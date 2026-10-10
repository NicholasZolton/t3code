import { StackActions, useNavigation, type StaticScreenProps } from "@react-navigation/native";
import { useAtomValue } from "@effect/atom-react";
import { resolvePairedNotification } from "@t3tools/client-runtime/rpc";
import { PairedNotificationReference } from "@t3tools/contracts";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import { AsyncResult } from "effect/reactivity";
import { useEffect, useMemo, useState, type JSX } from "react";

import { AppText as Text } from "../../components/AppText";
import { runtime } from "../../lib/runtime";
import { mobilePreferencesAtom } from "../../state/preferences";
import { useSavedRemoteConnections } from "../../state/use-remote-environment-registry";
import { SettingsScreen } from "../settings/components/SettingsScreen";
import { SettingsRow } from "../settings/components/SettingsRow";
import { pairedNotificationConnection } from "./pairedNotifications";

const decodeReference = Schema.decodeUnknownOption(PairedNotificationReference);

export function PairedNotificationRouteScreen({
  route,
}: StaticScreenProps<{ registrationId: string; notificationId: string }>): JSX.Element {
  const navigation = useNavigation();
  const preferences = useAtomValue(mobilePreferencesAtom);
  const { savedConnectionsById, isLoadingSavedConnection } = useSavedRemoteConnections();
  const [result, setResult] = useState<{
    readonly attempt: number;
    readonly message: string;
  } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const target = useMemo(() => {
    if (isLoadingSavedConnection || !AsyncResult.isSuccess(preferences))
      return { message: "Loading your paired environments…", request: null };
    const reference = decodeReference(route.params);
    if (Option.isNone(reference))
      return { message: "This notification link is invalid.", request: null };
    const registration = Object.entries(preferences.value.pairedNotifications ?? {}).find(
      ([, value]) => value.registrationId === reference.value.registrationId && value.enabled,
    );
    const saved = registration
      ? Object.values(savedConnectionsById).find((entry) => entry.environmentId === registration[0])
      : null;
    if (!saved)
      return {
        message:
          "This notification's environment is no longer paired or notifications are disabled.",
        request: null,
      };
    const connection = pairedNotificationConnection(saved);
    if (!connection)
      return { message: "Reconnect to this environment to open the notification.", request: null };
    return {
      message: null,
      request: { connection, reference: reference.value, environmentId: saved.environmentId },
    };
  }, [preferences, savedConnectionsById, isLoadingSavedConnection, route.params]);
  useEffect(() => {
    const request = target.request;
    if (!request) return;
    let cancelled = false;
    void runtime
      .runPromise(resolvePairedNotification(request.connection, request.reference))
      .then((destination) => {
        if (cancelled) return;
        if (!destination || destination.environmentId !== request.environmentId) {
          setResult({
            attempt,
            message: "This notification has expired or is no longer available.",
          });
          return;
        }
        navigation.dispatch(StackActions.replace("Thread", destination));
      })
      .catch(() => {
        if (!cancelled)
          setResult({
            attempt,
            message:
              "Could not reach your environment. Check Tailscale or your network connection and retry.",
          });
      });
    return () => {
      cancelled = true;
    };
  }, [target, navigation, attempt]);
  const message =
    target.message ??
    (result?.attempt === attempt ? result.message : "Connecting to your environment…");
  return (
    <SettingsScreen title="Notification">
      <Text className="px-5 pt-4 text-base text-foreground-muted">{message}</Text>
      <SettingsRow
        label="Retry"
        icon="arrow.clockwise"
        disabled={!target.request}
        onPress={() => setAttempt((value) => value + 1)}
      />
    </SettingsScreen>
  );
}
