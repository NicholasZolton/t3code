import { useAtomValue } from "@effect/atom-react";
import type { StaticScreenProps } from "@react-navigation/native";
import { EnvironmentId } from "@t3tools/contracts";
import {
  collectLimitAccounts,
  collectOpenCodeAccountTargets,
  collectExternalUsageLinks,
  collectLimitNotices,
  collectLimitPools,
  cursorUsageWindowDetails,
  displayLimitWindows,
  remainingPercent,
  type LimitPoolWindow,
} from "@t3tools/shared/usageLimits";
import { Fragment, type ReactNode, useState } from "react";
import { Linking, Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { SymbolView } from "../../components/AppSymbol";
import { AppText as Text } from "../../components/AppText";
import { ProviderIcon } from "../../components/ProviderIcon";
import { SettingsScreen } from "../settings/components/SettingsScreen";
import { environmentPresentations } from "../../state/presentation";
import { ResetCredits } from "./UsageLimitsSection";
import { OpenCodeAccounts } from "./OpenCodeAccounts";
import { DRIVER_LABEL, PoolWindowCard } from "./UsagePoolWindowCard";
import { useProviderColors } from "./usageProviders";

export function UsageLimitsSection({
  now,
  failedLabels,
  selectedEnvironmentIds,
  cursorPrompt,
}: {
  readonly now: number;
  readonly failedLabels: readonly string[];
  readonly selectedEnvironmentIds: ReadonlySet<EnvironmentId> | null;
  readonly cursorPrompt?: ReactNode;
}) {
  const presentations = useAtomValue(environmentPresentations.presentationsAtom);
  const selected =
    selectedEnvironmentIds === null
      ? presentations
      : new Map([...presentations].filter(([id]) => selectedEnvironmentIds.has(id)));
  const pools = collectLimitPools(collectLimitAccounts(selected), now);
  const notices = collectLimitNotices(selected);
  const externalLinks = collectExternalUsageLinks(selected);
  const colors = useProviderColors();
  const cursorPromptAt =
    Math.max(
      pools.findIndex((pool) => pool.driver === "codex"),
      pools.findIndex((pool) => pool.driver === "claudeAgent"),
    ) + 1;
  return (
    <View className="gap-6">
      {pools.length === 0 &&
      notices.length === 0 &&
      failedLabels.length === 0 &&
      !cursorPrompt &&
      externalLinks.length === 0 &&
      collectOpenCodeAccountTargets(selected).length === 0 ? (
        <Text className="py-12 text-center text-base text-foreground-muted">
          {selected.size === 0
            ? "Select an environment to see limits."
            : "No provider on the selected environments reports subscription limits."}
        </Text>
      ) : null}
      {pools.map((pool, index) => {
        const windows = displayLimitWindows(pool);
        return (
          <Fragment key={pool.driver}>
            {index === cursorPromptAt ? cursorPrompt : null}
            <View className="gap-3">
              <View className="flex-row items-center gap-2 px-1">
                <ProviderIcon provider={pool.driver} size={18} />
                <Text className="text-base font-t3-medium text-foreground">
                  {DRIVER_LABEL[pool.driver] ?? pool.driver}
                </Text>
              </View>
              {windows.map((window) => {
                const details =
                  pool.driver === "cursor" ? cursorUsageWindowDetails(window.id) : undefined;
                return (
                  <PoolWindowCard
                    key={`${window.kind}:${window.id}`}
                    pool={window}
                    color={pool.driver === "claudeAgent" ? colors.claude : colors.codex}
                    now={now}
                    environmentIds={
                      selectedEnvironmentIds === null ? null : [...selectedEnvironmentIds]
                    }
                    label={details?.label}
                    description={details?.description}
                  />
                );
              })}
            </View>
          </Fragment>
        );
      })}
      {cursorPromptAt === pools.length ? cursorPrompt : null}
      <OpenCodeAccounts presentations={selected} now={now} />
      {externalLinks.map((link) => (
        <View key={link.url} className="gap-3 rounded-xl border border-border-subtle p-4">
          <Text className="text-base font-t3-medium text-foreground">{link.label}</Text>
          <Text className="text-xs text-foreground-muted">{link.accounts.join(", ")}</Text>
          {link.message ? (
            <Text className="text-sm text-foreground-muted">{link.message}</Text>
          ) : null}
          <Pressable
            accessibilityRole="link"
            className="min-h-11 justify-center"
            onPress={() => void Linking.openURL(link.url).catch(() => undefined)}
          >
            <Text className="text-sm font-t3-medium text-primary">Manage usage</Text>
          </Pressable>
        </View>
      ))}
      {notices.length > 0 || failedLabels.length > 0 ? (
        <View
          accessible
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          className="flex-row items-start gap-2 rounded-xl border border-warning-border bg-warning px-3.5 py-3"
        >
          <SymbolView
            name="exclamationmark.triangle"
            size={16}
            tintColorClassName="accent-warning-foreground"
          />
          <View className="min-w-0 flex-1 gap-0.5">
            {notices.map((notice) => (
              <Text key={notice} className="text-sm font-t3-medium text-warning-foreground">
                {notice}
              </Text>
            ))}
            {failedLabels.length > 0 ? (
              <Text className="text-sm font-t3-medium text-warning-foreground">
                {failedLabels.join(", ")} could not refresh limits. Showing the last known values.
              </Text>
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}

type AccountScreenProps = StaticScreenProps<{
  accountKey: string;
  windowId: string;
  windowKind: LimitPoolWindow["kind"];
  environmentIds: readonly string[] | null;
  now: number;
}>;

/** Resolve the account again so live quota and credit updates reach the open detail screen. */
export function UsageLimitAccountScreen({ route }: AccountScreenProps) {
  const insets = useSafeAreaInsets();
  const presentations = useAtomValue(environmentPresentations.presentationsAtom);
  const { accountKey, windowId, windowKind, environmentIds, now } = route.params;
  const selectedIds =
    environmentIds === null ? null : new Set(environmentIds.map((id) => EnvironmentId.make(id)));
  const selected =
    selectedIds === null
      ? presentations
      : new Map([...presentations].filter(([id]) => selectedIds.has(id)));
  const accounts = collectLimitAccounts(selected);
  const account = accounts.find((candidate) => candidate.key === accountKey);
  const pool = collectLimitPools(accounts, now)
    .find((candidate) => candidate.driver === account?.driver)
    ?.windows.find((candidate) => candidate.id === windowId && candidate.kind === windowKind);
  const window = pool?.members.find((member) => member.account.key === accountKey)?.window;
  const reset = pool?.resets.find((candidate) => candidate.member.account.key === accountKey);
  const [revealed, setRevealed] = useState(false);
  return (
    <SettingsScreen title="Account">
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerClassName="gap-5 p-5"
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
      >
        {!account || !window ? (
          <Text className="text-base text-foreground-muted">
            This account is no longer reporting limits on the selected environments.
          </Text>
        ) : (
          <>
            <View className="gap-2">
              <View className="flex-row items-center gap-2">
                <ProviderIcon provider={account.driver} size={24} />
                <Text className="flex-1 text-xl font-t3-bold text-foreground">
                  {account.displayName ?? DRIVER_LABEL[account.driver] ?? account.driver}
                </Text>
              </View>
              {account.email ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={revealed ? "Hide account email" : "Reveal account email"}
                  onPress={() => setRevealed((value) => !value)}
                  className="min-h-[44px] justify-center"
                >
                  <Text className="text-sm text-foreground-muted">
                    {revealed ? account.email : "••••••@••••••"}
                  </Text>
                </Pressable>
              ) : null}
              {account.plan ? (
                <Text selectable className="text-sm text-foreground-muted">
                  {account.plan}
                </Text>
              ) : null}
            </View>
            <View className="gap-3 rounded-[24px] border-continuous bg-grouped-card p-4">
              <Text className="text-sm font-t3-medium text-foreground">{window.label}</Text>
              <Text className="text-3xl font-t3-bold tabular-nums text-foreground">
                {remainingPercent(window)}% left
              </Text>
              {window.resetsAt ? (
                <Text selectable className="text-sm text-foreground-muted">
                  Resets{" "}
                  {new Date(window.resetsAt).toLocaleString(undefined, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </Text>
              ) : null}
              {reset && reset.restoresPercent > 0 ? (
                <Text className="text-sm text-foreground-muted">
                  Restores {reset.restoresPercent}% of the pool
                </Text>
              ) : null}
            </View>
            <View className="gap-2 rounded-[24px] border-continuous bg-grouped-card p-4">
              <Text className="text-sm font-t3-medium text-foreground">
                {account.environments.length ? "Signed in" : "Source"}
              </Text>
              {account.environments.length ? (
                account.environments.map((environment) => (
                  <Text key={environment.environmentId} className="text-sm text-foreground-muted">
                    {environment.label}
                  </Text>
                ))
              ) : (
                <Text className="text-sm text-foreground-muted">{account.sourceLabel}</Text>
              )}
            </View>
            {account.redeem && account.limits.resetCredits ? (
              <View className="gap-3 rounded-[24px] border-continuous bg-grouped-card p-4">
                <Text className="text-sm font-t3-medium text-foreground">Reset credits</Text>
                <ResetCredits
                  key={account.key}
                  environmentId={account.redeem.environmentId}
                  input={account.redeem.input}
                  credits={account.limits.resetCredits}
                  now={now}
                />
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </SettingsScreen>
  );
}
