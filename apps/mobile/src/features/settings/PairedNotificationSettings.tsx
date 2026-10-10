import { useAtomSet, useAtomValue } from "@effect/atom-react";
import { AsyncResult } from "effect/reactivity";
import { useState, type JSX } from "react";
import { Alert, Platform } from "react-native";

import { AppText as Text } from "../../components/AppText";
import { runtime } from "../../lib/runtime";
import { uuidv4 } from "../../lib/uuid";
import { mobilePreferencesAtom, updateMobilePreferencesAtom } from "../../state/preferences";
import { useSavedRemoteConnections } from "../../state/use-remote-environment-registry";
import { supportsPairedAndroidNotifications } from "../agent-awareness/androidNotifications";
import {
  enablePairedNotifications,
  pairedNotificationStatusesAtom,
  updatePairedNotificationRegistration,
} from "../agent-awareness/pairedNotifications";
import type { SavedRemoteConnection } from "../../lib/connection";
import { SettingsSection } from "./components/SettingsSection";
import { SettingsSwitchRow } from "./components/SettingsSwitchRow";

export function PairedNotificationSettings(): JSX.Element | null {
  const preferences = useAtomValue(mobilePreferencesAtom);
  const save = useAtomSet(updateMobilePreferencesAtom, { mode: "promise" });
  const statuses = useAtomValue(pairedNotificationStatusesAtom);
  const { savedConnectionsById } = useSavedRemoteConnections();
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  if (Platform.OS !== "android") return null;
  const supported = supportsPairedAndroidNotifications();
  const registrations = AsyncResult.isSuccess(preferences)
    ? (preferences.value.pairedNotifications ?? {})
    : {};
  const connections = Object.values(savedConnectionsById).filter(
    (connection) => !connection.relayManaged,
  );

  async function toggle(connection: SavedRemoteConnection, enabled: boolean): Promise<void> {
    if (pending.has(connection.environmentId)) return;
    setPending((current) => new Set([...current, connection.environmentId]));
    const registrationId = registrations[connection.environmentId]?.registrationId ?? uuidv4();
    let preferenceSaved = false;
    try {
      if (enabled) await runtime.runPromise(enablePairedNotifications(connection, registrationId));
      await save({
        transform: (current) => ({
          pairedNotifications: {
            ...current.pairedNotifications,
            [connection.environmentId]: { registrationId, enabled },
          },
        }),
      });
      preferenceSaved = true;
      if (!enabled)
        await runtime.runPromise(
          updatePairedNotificationRegistration(connection, { registrationId, enabled }),
        );
    } catch (error) {
      if (!enabled && preferenceSaved) {
        Alert.alert(
          "Notifications are off on this phone",
          "Couldn't remove the server subscription yet. It will retry when this environment is reachable.",
        );
        return;
      }
      Alert.alert(
        "Couldn't update notifications",
        error instanceof Error
          ? error.message
          : "Could not update this device's notification registration.",
      );
    } finally {
      setPending(
        (current) => new Set([...current].filter((id) => id !== connection.environmentId)),
      );
    }
  }

  return (
    <SettingsSection title="Paired environments">
      <Text className="text-sm text-foreground-muted">
        Get completion, failure, approval and input alerts directly from your servers. T3 Connect is
        not used. Google receives only generic event types and opaque notification IDs.
      </Text>
      {!supported ? (
        <Text className="text-sm text-foreground-muted">
          Install a newer Android build with Firebase configured to enable paired notifications.
        </Text>
      ) : null}
      {connections.length === 0 ? (
        <Text className="text-sm text-foreground-muted">
          Pair an environment to enable its notifications.
        </Text>
      ) : null}
      {connections.map((connection) => (
        <SettingsSwitchRow
          key={connection.environmentId}
          icon="bell.badge"
          label={connection.environmentLabel}
          subtitle={
            pending.has(connection.environmentId)
              ? "Updating…"
              : registrations[connection.environmentId]?.enabled
                ? (statuses[connection.environmentId]?.message ?? "Checking registration…")
                : "Off"
          }
          disabled={
            !supported ||
            (!connection.bearerToken && !registrations[connection.environmentId]?.enabled) ||
            pending.has(connection.environmentId) ||
            !AsyncResult.isSuccess(preferences)
          }
          value={registrations[connection.environmentId]?.enabled === true}
          onValueChange={(enabled) => {
            void toggle(connection, enabled);
          }}
        />
      ))}
    </SettingsSection>
  );
}
