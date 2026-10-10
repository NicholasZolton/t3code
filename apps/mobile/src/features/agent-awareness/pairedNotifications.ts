import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentId } from "@t3tools/contracts";
import {
  getPairedNotificationStatus,
  registerPairedNotifications,
  unregisterPairedNotifications,
  type PairedNotificationConnection,
} from "@t3tools/client-runtime/rpc";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Semaphore from "effect/Semaphore";
import { AsyncResult, Atom } from "effect/reactivity";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { useEffect, useRef } from "react";
import { AppState, Platform } from "react-native";

import type { SavedRemoteConnection } from "../../lib/connection";
import { runtime } from "../../lib/runtime";
import { appAtomRegistry } from "../../state/atom-registry";
import { mobilePreferencesAtom } from "../../state/preferences";
import { useSavedRemoteConnections } from "../../state/use-remote-environment-registry";
import type { Preferences } from "../../persistence/mobile-preferences";
import {
  configurePairedAndroidNotifications,
  pairedNotificationPublicKey,
  supportsPairedAndroidNotifications,
} from "./androidNotifications";
import { requestAgentNotificationPermission } from "./notificationPermissions";
import { makeAgentAwarenessPreferences } from "./registrationPayload";

type Registration = NonNullable<Preferences["pairedNotifications"]>[string];
interface RegistrationStatus {
  readonly registered: boolean;
  readonly message: string;
}

export const pairedNotificationStatusesAtom = Atom.make<
  Readonly<Record<string, RegistrationStatus>>
>({}).pipe(Atom.keepAlive);
const registrationLock = Semaphore.makeUnsafe(1);

function setStatus(environmentId: EnvironmentId, status: RegistrationStatus): void {
  appAtomRegistry.set(pairedNotificationStatusesAtom, {
    ...appAtomRegistry.get(pairedNotificationStatusesAtom),
    [environmentId]: status,
  });
}

export function pairedNotificationConnection(
  connection: SavedRemoteConnection,
): PairedNotificationConnection | null {
  return connection.bearerToken && !connection.relayManaged
    ? { httpBaseUrl: connection.httpBaseUrl, bearerToken: connection.bearerToken }
    : null;
}

export class PairedNotificationSetupError extends Schema.TaggedError<PairedNotificationSetupError>()(
  "PairedNotificationSetupError",
  {
    reason: Schema.Literals([
      "connection",
      "configuration",
      "permission",
      "token",
      "registration",
      "encryption",
      "server-version",
    ]),
  },
) {
  override get message(): string {
    switch (this.reason) {
      case "connection":
        return "Reconnect to this paired environment first.";
      case "configuration":
        return "This server needs T3CODE_FCM_SERVICE_ACCOUNT before it can send notifications.";
      case "permission":
        return "Allow T3 Code notifications in Android Settings first.";
      case "token":
        return "Could not obtain a Firebase token. Check this app build's Google services configuration.";
      case "registration":
        return "This environment did not accept the notification registration.";
      case "encryption":
        return "Could not prepare this phone's encrypted notification key.";
      case "server-version":
        return "Update this server to support encrypted agent notifications.";
    }
  }
}

const pushToken = Effect.tryPromise(() => Notifications.getDevicePushTokenAsync()).pipe(
  Effect.flatMap((token) =>
    token.type === "android" && typeof token.data === "string" && token.data.trim()
      ? Effect.succeed(token.data.trim())
      : Effect.fail(new PairedNotificationSetupError({ reason: "token" })),
  ),
  Effect.catch(() => Effect.fail(new PairedNotificationSetupError({ reason: "token" }))),
);

const updateRegistration = Effect.fn("updatePairedNotificationRegistration")(function* (
  connection: SavedRemoteConnection,
  registration: Registration,
  observedToken?: string,
) {
  const target = pairedNotificationConnection(connection);
  if (!target) return yield* new PairedNotificationSetupError({ reason: "connection" });
  if (!registration.enabled) {
    yield* unregisterPairedNotifications(target, registration.registrationId);
    setStatus(connection.environmentId, { registered: false, message: "Off" });
    return;
  }
  const packageName = Constants.expoConfig?.android?.package;
  if (!packageName) return yield* new PairedNotificationSetupError({ reason: "token" });
  const current = appAtomRegistry.get(mobilePreferencesAtom);
  const preferences = AsyncResult.isSuccess(current) ? current.value : {};
  const encryptionPublicKey = yield* Effect.tryPromise({
    try: () => pairedNotificationPublicKey(registration.registrationId),
    catch: () => new PairedNotificationSetupError({ reason: "encryption" }),
  });
  const status = yield* registerPairedNotifications(target, {
    registrationId: registration.registrationId,
    pushToken: observedToken ?? (yield* pushToken),
    packageName,
    encryptionPublicKey,
    preferences: makeAgentAwarenessPreferences({ notificationsEnabled: true, preferences }),
  });
  if (!status.configured)
    return yield* new PairedNotificationSetupError({ reason: "configuration" });
  if (status.encryptedActivitySupported !== true)
    return yield* new PairedNotificationSetupError({ reason: "server-version" });
  if (status.registrationId !== registration.registrationId)
    return yield* new PairedNotificationSetupError({ reason: "registration" });
  setStatus(connection.environmentId, {
    registered: true,
    message: "Encrypted alerts and activity sent directly by this server",
  });
});

export const updatePairedNotificationRegistration = (
  connection: SavedRemoteConnection,
  registration: Registration,
) => registrationLock.withPermit(updateRegistration(connection, registration));

export const enablePairedNotifications = Effect.fn("enablePairedNotifications")(function* (
  connection: SavedRemoteConnection,
  registrationId: string,
) {
  const target = pairedNotificationConnection(connection);
  if (!target) return yield* new PairedNotificationSetupError({ reason: "connection" });
  const status = yield* getPairedNotificationStatus(target);
  if (!status.configured)
    return yield* new PairedNotificationSetupError({ reason: "configuration" });
  if (status.encryptedActivitySupported !== true)
    return yield* new PairedNotificationSetupError({ reason: "server-version" });
  const permission = yield* requestAgentNotificationPermission;
  if (permission.type !== "granted")
    return yield* new PairedNotificationSetupError({ reason: "permission" });
  const current = appAtomRegistry.get(mobilePreferencesAtom);
  const preferences = AsyncResult.isSuccess(current) ? current.value : {};
  const enabled = Object.values(preferences.pairedNotifications ?? {})
    .filter((registration) => registration.enabled)
    .map((registration) => registration.registrationId);
  configurePairedAndroidNotifications(
    [...enabled, registrationId],
    preferences.liveActivitiesEnabled !== false,
  );
  yield* updateRegistration(connection, { registrationId, enabled: true }).pipe(
    Effect.catch((error) => {
      configurePairedAndroidNotifications(enabled, preferences.liveActivitiesEnabled !== false);
      return Effect.fail(error);
    }),
  );
}, registrationLock.withPermit);

// Keep token updates and cold starts working even without a T3 Connect account.
export function usePairedNotificationSync(): void {
  const preferences = useAtomValue(mobilePreferencesAtom);
  const { savedConnectionsById, isLoadingSavedConnection } = useSavedRemoteConnections();
  const previousConnections = useRef<Readonly<Record<string, SavedRemoteConnection>>>({});
  useEffect(() => {
    if (
      Platform.OS !== "android" ||
      !supportsPairedAndroidNotifications() ||
      isLoadingSavedConnection ||
      !AsyncResult.isSuccess(preferences)
    )
      return;
    const registrations = preferences.value.pairedNotifications ?? {};
    const connections = Object.values(savedConnectionsById).filter(
      (connection) => !connection.relayManaged,
    );
    let cancelled = false;
    const enabled = connections.flatMap((connection) => {
      const registration = registrations[connection.environmentId];
      return registration?.enabled ? [registration.registrationId] : [];
    });
    configurePairedAndroidNotifications(enabled, preferences.value.liveActivitiesEnabled !== false);
    const synchronize = async (observedToken?: string): Promise<void> => {
      const permission = await Notifications.getPermissionsAsync().catch(() => null);
      if (cancelled || permission === null) return;
      await Promise.all(
        connections.map(async (connection) => {
          const registration = registrations[connection.environmentId];
          if (!registration || !pairedNotificationConnection(connection)) return;
          try {
            await runtime.runPromise(
              registrationLock.withPermit(
                Effect.suspend(() => {
                  if (cancelled) return Effect.void;
                  const current = appAtomRegistry.get(mobilePreferencesAtom);
                  const latest = AsyncResult.isSuccess(current)
                    ? current.value.pairedNotifications?.[connection.environmentId]
                    : null;
                  if (!latest) return Effect.void;
                  return updateRegistration(
                    connection,
                    {
                      ...latest,
                      enabled: latest.enabled && permission?.granted === true,
                    },
                    observedToken,
                  );
                }),
              ),
            );
          } catch (error) {
            if (!cancelled)
              setStatus(connection.environmentId, {
                registered: false,
                message:
                  error instanceof Error
                    ? error.message
                    : "Reconnect or enable again to refresh registration",
              });
          }
        }),
      );
    };
    Object.values(previousConnections.current)
      .filter((connection) => !savedConnectionsById[connection.environmentId])
      .forEach((connection) => {
        const registration = registrations[connection.environmentId];
        if (registration)
          void runtime
            .runPromise(
              updatePairedNotificationRegistration(connection, { ...registration, enabled: false }),
            )
            .catch(() => undefined);
      });
    previousConnections.current = savedConnectionsById;
    void synchronize();
    const foreground = AppState.addEventListener("change", (state) => {
      if (state === "active") void synchronize();
    });
    const tokens = Notifications.addPushTokenListener((token) => {
      if (token.type === "android" && typeof token.data === "string") void synchronize(token.data);
    });
    return () => {
      cancelled = true;
      foreground.remove();
      tokens.remove();
    };
  }, [preferences, savedConnectionsById, isLoadingSavedConnection]);
}
