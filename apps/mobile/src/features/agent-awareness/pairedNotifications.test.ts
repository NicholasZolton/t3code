import { beforeEach, vi } from "vite-plus/test";
import { describe, expect, it } from "@effect/vitest";
import { EnvironmentId, type PairedNotificationRegistration } from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import { AsyncResult } from "effect/reactivity";
import type { Preferences } from "../../persistence/mobile-preferences";
import type { SavedRemoteConnection } from "../../lib/connection";

const mocks = vi.hoisted(() => ({
  configured: true,
  encrypted: true,
  accepted: true,
  permission: true,
  token: "first-fcm-token",
  preferences: {} as Preferences,
  register: vi.fn(),
  unregister: vi.fn(),
  configureNative: vi.fn(),
  publicKey: vi.fn(),
}));

vi.mock("@t3tools/client-runtime/rpc", () => ({
  getPairedNotificationStatus: () =>
    Effect.succeed({
      configured: mocks.configured,
      encryptedActivitySupported: mocks.encrypted,
      registrationId: null,
    }),
  registerPairedNotifications: (
    connection: { readonly httpBaseUrl: string },
    input: PairedNotificationRegistration,
  ) => {
    mocks.register(connection, input);
    return Effect.succeed({
      configured: mocks.configured,
      encryptedActivitySupported: mocks.encrypted,
      registrationId: mocks.accepted ? input.registrationId : null,
    });
  },
  unregisterPairedNotifications: (
    connection: { readonly httpBaseUrl: string },
    registrationId: string,
  ) => {
    mocks.unregister(connection, registrationId);
    return Effect.void;
  },
}));
vi.mock("expo-constants", () => ({
  default: { expoConfig: { android: { package: "com.t3tools.t3code.preview" } } },
}));
vi.mock("expo-notifications", () => ({
  getDevicePushTokenAsync: () => Promise.resolve({ type: "android", data: mocks.token }),
}));
vi.mock("react-native", () => ({ Platform: { OS: "android" } }));
vi.mock("../../lib/runtime", () => ({ runtime: {} }));
vi.mock("../../state/preferences", () => ({ mobilePreferencesAtom: Symbol("preferences") }));
vi.mock("../../state/use-remote-environment-registry", () => ({
  useSavedRemoteConnections: vi.fn(),
}));
vi.mock("../../state/atom-registry", () => ({
  appAtomRegistry: { get: () => AsyncResult.success(mocks.preferences), set: vi.fn() },
}));
vi.mock("./capabilities", () => ({ supportsAgentAwarenessPush: () => true }));
vi.mock("./androidNotifications", () => ({
  supportsPairedAndroidNotifications: () => true,
  configurePairedAndroidNotifications: mocks.configureNative,
  pairedNotificationPublicKey: mocks.publicKey,
}));
vi.mock("./notificationPermissions", () => ({
  get requestAgentNotificationPermission() {
    return Effect.succeed({ type: mocks.permission ? "granted" : "denied" });
  },
}));

import {
  enablePairedNotifications,
  updatePairedNotificationRegistration,
} from "./pairedNotifications";

const connection: SavedRemoteConnection = {
  environmentId: EnvironmentId.make("paired"),
  environmentLabel: "Paired host",
  pairingUrl: "https://host.example/pair",
  displayUrl: "https://host.example",
  httpBaseUrl: "https://host.example",
  wsBaseUrl: "wss://host.example/ws",
  bearerToken: "test-bearer",
};
const registrationId = "5ea7c5d1-89c1-4e23-8b31-1ca2b4a9b8ef";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.configured = true;
  mocks.encrypted = true;
  mocks.accepted = true;
  mocks.permission = true;
  mocks.token = "first-fcm-token";
  mocks.preferences = { liveActivitiesEnabled: false };
  mocks.publicKey.mockResolvedValue("native-public-key");
});

describe("paired notification registration", () => {
  it.effect(
    "uploads only the native public key through existing pairing and shares device preferences",
    () =>
      Effect.gen(function* () {
        yield* enablePairedNotifications(connection, registrationId);
        expect(mocks.register).toHaveBeenCalledWith(
          { httpBaseUrl: connection.httpBaseUrl, bearerToken: connection.bearerToken },
          {
            registrationId,
            pushToken: "first-fcm-token",
            packageName: "com.t3tools.t3code.preview",
            encryptionPublicKey: "native-public-key",
            preferences: {
              notificationsEnabled: true,
              liveActivitiesEnabled: false,
              notifyOnApproval: true,
              notifyOnInput: true,
              notifyOnCompletion: true,
              notifyOnFailure: true,
            },
          },
        );
        expect(mocks.configureNative).toHaveBeenLastCalledWith([registrationId], false);
        mocks.token = "rotated-fcm-token";
        yield* updatePairedNotificationRegistration(connection, { registrationId, enabled: true });
        expect(mocks.register.mock.calls.at(-1)?.[1]).toMatchObject({
          registrationId,
          pushToken: "rotated-fcm-token",
          encryptionPublicKey: "native-public-key",
        });
      }).pipe(Effect.provide(FetchHttpClient.layer)),
  );

  it.effect("requires server encryption support and permission before registering", () =>
    Effect.gen(function* () {
      mocks.encrypted = false;
      expect(
        (yield* Effect.flip(enablePairedNotifications(connection, registrationId))).message,
      ).toContain("Update this server");
      mocks.encrypted = true;
      mocks.permission = false;
      expect(
        (yield* Effect.flip(enablePairedNotifications(connection, registrationId))).message,
      ).toContain("Allow T3 Code notifications");
      expect(mocks.register).not.toHaveBeenCalled();
      expect(mocks.publicKey).not.toHaveBeenCalled();
    }).pipe(Effect.provide(FetchHttpClient.layer)),
  );

  it.effect("removes the provisional native registration when setup fails", () =>
    Effect.gen(function* () {
      mocks.accepted = false;
      expect(
        (yield* Effect.flip(enablePairedNotifications(connection, registrationId))).message,
      ).toContain("did not accept");
      expect(mocks.configureNative).toHaveBeenLastCalledWith([], false);
    }).pipe(Effect.provide(FetchHttpClient.layer)),
  );

  it.effect("opts out without fetching a token or a notification key", () =>
    Effect.gen(function* () {
      yield* updatePairedNotificationRegistration(connection, { registrationId, enabled: false });
      expect(mocks.unregister).toHaveBeenCalledWith(
        { httpBaseUrl: connection.httpBaseUrl, bearerToken: connection.bearerToken },
        registrationId,
      );
      expect(mocks.register).not.toHaveBeenCalled();
      expect(mocks.publicKey).not.toHaveBeenCalled();
    }).pipe(Effect.provide(FetchHttpClient.layer)),
  );
});
