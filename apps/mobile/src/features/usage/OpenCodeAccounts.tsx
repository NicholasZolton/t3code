import type { EnvironmentId, OpenCodeCodexAccount, ProviderInstanceId } from "@t3tools/contracts";
import {
  collectOpenCodeAccountTargets,
  formatResetsIn,
  remainingPercent,
  type LimitPresentations,
} from "@t3tools/shared/usageLimits";
import { useEffect, useState } from "react";
import { Pressable, View } from "react-native";

import { AppText as Text } from "../../components/AppText";
import { ProviderIcon } from "../../components/ProviderIcon";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";

function AccountLabel({ label }: { readonly label: string }) {
  const [revealed, setRevealed] = useState(false);
  if (!label.includes("@"))
    return (
      <Text className="min-w-0 flex-1 text-sm font-t3-medium text-foreground" numberOfLines={1}>
        {label}
      </Text>
    );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={revealed ? "Hide account label" : "Reveal account label"}
      onPress={() => setRevealed(!revealed)}
      className="min-w-0 flex-1"
    >
      <Text className="text-sm font-t3-medium text-foreground" numberOfLines={1}>
        {revealed ? label : "••••••@••••••"}
      </Text>
    </Pressable>
  );
}

function InstanceAccounts({
  environmentId,
  instanceId,
  label,
  now,
}: {
  readonly environmentId: EnvironmentId;
  readonly instanceId: ProviderInstanceId;
  readonly label: string;
  readonly now: number;
}) {
  const read = useAtomCommand(serverEnvironment.openCodeAccounts, { reportFailure: false });
  const activate = useAtomCommand(serverEnvironment.activateOpenCodeAccount, {
    reportFailure: false,
  });
  const [accounts, setAccounts] = useState<readonly OpenCodeCodexAccount[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    void read({ environmentId, input: { instanceId } }).then((result) => {
      if (result._tag === "Success") {
        setAccounts(result.value);
        setMessage(null);
      } else setMessage("Could not read OpenCode accounts on this environment.");
    });
    // oxlint-disable-next-line react/exhaustive-effect-dependencies -- Limits refresh changes now to refetch account quotas.
  }, [environmentId, instanceId, now, read]);

  const switchAccount = async (credentialId: string) => {
    setBusyId(credentialId);
    setMessage(null);
    try {
      const result = await activate({ environmentId, input: { instanceId, credentialId } });
      if (result._tag === "Success") {
        const updated = await read({ environmentId, input: { instanceId } });
        if (updated._tag === "Success") setAccounts(updated.value);
        setMessage(
          updated._tag === "Success"
            ? "OpenCode account switched."
            : "Switched, but could not refresh the account list.",
        );
      } else setMessage("Could not switch the OpenCode account.");
    } finally {
      setBusyId(null);
    }
  };
  return (
    <View className="gap-3">
      <View className="flex-row items-center gap-2 px-1">
        <ProviderIcon provider="opencode" size={18} />
        <Text className="text-base font-t3-medium text-foreground">OpenCode · Codex {label}</Text>
      </View>
      {accounts?.map((account) => (
        <View key={account.id} className="gap-3 rounded-[24px] border-continuous bg-card p-4">
          <View className="flex-row items-center justify-between gap-3">
            <AccountLabel label={account.label} />
            {account.plan ? (
              <Text className="text-xs text-foreground-muted">{account.plan}</Text>
            ) : null}
            {account.active ? (
              <Text className="text-xs text-foreground-muted">Active</Text>
            ) : (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Switch to this OpenCode account"
                disabled={busyId !== null}
                onPress={() => void switchAccount(account.id)}
                className="min-h-[44px] justify-center active:opacity-60"
              >
                <Text className="text-sm text-foreground">
                  {busyId === account.id ? "Switching…" : "Switch"}
                </Text>
              </Pressable>
            )}
          </View>
          {account.limits.unavailable ? (
            <Text className="text-xs text-foreground-muted">
              {account.limits.unavailable.message}
            </Text>
          ) : null}
          {!account.limits.unavailable && account.limits.windows.length === 0 ? (
            <Text className="text-xs text-foreground-muted">No usage windows reported.</Text>
          ) : null}
          {account.limits.windows.map((window) => (
            <View key={window.id} className="flex-row justify-between gap-3">
              <Text className="text-xs text-foreground-muted">{window.label}</Text>
              <Text className="text-xs tabular-nums text-foreground-muted">
                {remainingPercent(window)}% left · {formatResetsIn(window, now) ?? "reset unknown"}
              </Text>
            </View>
          ))}
        </View>
      ))}
      {accounts?.length === 0 ? (
        <Text className="text-xs text-foreground-muted">
          No local OpenCode Codex accounts available.
        </Text>
      ) : null}
      {accounts === null && !message ? (
        <Text className="text-xs text-foreground-muted">Checking accounts…</Text>
      ) : null}
      {message ? (
        <Text accessibilityRole="alert" className="text-xs text-foreground-muted">
          {message}
        </Text>
      ) : null}
    </View>
  );
}

export function OpenCodeAccounts({
  presentations,
  now,
}: {
  readonly presentations: LimitPresentations;
  readonly now: number;
}) {
  return collectOpenCodeAccountTargets(presentations).map(
    ({ environmentId, instanceId, label }) => (
      <InstanceAccounts
        key={`${environmentId}:${instanceId}`}
        environmentId={environmentId}
        instanceId={instanceId}
        label={label}
        now={now}
      />
    ),
  );
}
