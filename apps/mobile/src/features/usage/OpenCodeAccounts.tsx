import type { EnvironmentId, OpenCodeCodexAccount, ProviderInstanceId } from "@t3tools/contracts";
import {
  collectLimitPools,
  collectOpenCodeAccountTargets,
  formatResetsIn,
  openCodeLimitAccounts,
  remainingPercent,
  type LimitPresentations,
} from "@t3tools/shared/usageLimits";
import { useEffect, useState } from "react";
import { Modal, Pressable, ScrollView, View } from "react-native";

import { AppText as Text } from "../../components/AppText";
import { ProviderIcon } from "../../components/ProviderIcon";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { PoolWindowCard } from "./UsagePoolWindowCard";
import { useProviderColors } from "./usageProviders";

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
  const colors = useProviderColors();
  const [accounts, setAccounts] = useState<readonly OpenCodeCodexAccount[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
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

  const limitAccounts = openCodeLimitAccounts(accounts ?? [], environmentId, instanceId, label);
  const pool = collectLimitPools(limitAccounts, now)[0];
  const selected = accounts?.find((account) => account.id === selectedId);
  const active = accounts?.find((account) => account.active);
  const activeAccountKey = active ? `${environmentId}:${instanceId}:${active.id}` : undefined;
  const unavailable = (accounts ?? []).filter((account) => account.limits.windows.length === 0);
  return (
    <View className="gap-3">
      <View className="flex-row items-center gap-2 px-1">
        <ProviderIcon provider="opencode" size={18} />
        <Text className="text-base font-t3-medium text-foreground">OpenCode · Codex · {label}</Text>
      </View>
      {pool?.windows.map((window) => (
        <PoolWindowCard
          key={`${window.kind}:${window.id}`}
          pool={window}
          color={colors.codex}
          now={now}
          environmentIds={[environmentId]}
          activeAccountKey={activeAccountKey}
          onOpenAccount={(account) =>
            setSelectedId(
              accounts?.find(
                (candidate) => account.key === `${environmentId}:${instanceId}:${candidate.id}`,
              )?.id ?? null,
            )
          }
        />
      ))}
      {unavailable.map((account) => (
        <Pressable
          key={account.id}
          accessibilityRole="button"
          accessibilityLabel="Show OpenCode account details"
          onPress={() => setSelectedId(account.id)}
          className="gap-1 rounded-[24px] border-continuous bg-card p-4 active:opacity-60"
        >
          <Text className="text-sm font-t3-medium text-foreground">
            {account.label.includes("@") ? "••••••@••••••" : account.label}
            {account.active ? " · Active" : ""}
          </Text>
          <Text className="text-xs text-foreground-muted">
            {account.limits.unavailable?.message ?? "No usage windows reported."}
          </Text>
        </Pressable>
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
      <Modal
        visible={selected !== undefined}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedId(null)}
      >
        <View className="flex-1 items-center justify-center bg-backdrop px-6">
          <ScrollView
            className="max-h-[80%] w-full max-w-md grow-0 rounded-3xl bg-screen"
            contentContainerClassName="gap-4 p-6"
          >
            <View className="flex-row items-center justify-between gap-3">
              <Text className="text-lg font-t3-semibold text-foreground">OpenCode account</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close account details"
                onPress={() => setSelectedId(null)}
                className="min-h-[44px] justify-center"
              >
                <Text className="text-foreground">Done</Text>
              </Pressable>
            </View>
            {selected ? (
              <>
                <View className="flex-row">
                  <AccountLabel label={selected.label} />
                </View>
                {selected.plan ? (
                  <Text className="text-sm text-foreground-muted">{selected.plan}</Text>
                ) : null}
                <Text className="text-sm text-foreground-muted">{label}</Text>
                {selected.limits.windows.map((window) => (
                  <Text key={window.id} className="text-sm text-foreground">
                    {window.label}: {remainingPercent(window)}% left ·{" "}
                    {formatResetsIn(window, now) ?? "reset unknown"}
                  </Text>
                ))}
                {selected.limits.unavailable ? (
                  <Text className="text-sm text-foreground-muted">
                    {selected.limits.unavailable.message}
                  </Text>
                ) : null}
                {selected.active ? (
                  <Text className="text-sm text-foreground-muted">Active account</Text>
                ) : (
                  <Pressable
                    accessibilityRole="button"
                    disabled={busyId !== null}
                    onPress={() => void switchAccount(selected.id)}
                    className="min-h-[44px] justify-center rounded-xl bg-subtle px-4 active:opacity-60"
                  >
                    <Text className="text-center text-foreground">
                      {busyId === selected.id ? "Switching…" : "Switch to account"}
                    </Text>
                  </Pressable>
                )}
                {message ? (
                  <Text accessibilityRole="alert" className="text-xs text-foreground-muted">
                    {message}
                  </Text>
                ) : null}
              </>
            ) : null}
          </ScrollView>
        </View>
      </Modal>
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
