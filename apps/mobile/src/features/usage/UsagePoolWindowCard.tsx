import { useNavigation } from "@react-navigation/native";
import type { LimitAccount, LimitPoolWindow } from "@t3tools/shared/usageLimits";
import {
  formatDuration,
  formatResetsIn,
  limitAccountWeight,
  remainingPercent,
} from "@t3tools/shared/usageLimits";
import { useId } from "react";
import { Pressable, View } from "react-native";
import { Defs, Path, Pattern, Rect, Svg } from "react-native-svg";

import { SymbolView } from "../../components/AppSymbol";
import { AppText as Text } from "../../components/AppText";

export const DRIVER_LABEL: Partial<Record<string, string>> = {
  codex: "Codex",
  claudeAgent: "Claude",
};
const PACE_LABEL = { ahead: "Ahead of pace", on: "On pace", under: "Under pace" } as const;

function accountName(account: LimitAccount) {
  if (account.displayName) return account.displayName;
  if (!account.email) return DRIVER_LABEL[account.driver] ?? String(account.driver);
  const [local = "", domain = ""] = account.email.split("@");
  return `${local[0] ?? ""}${domain[0] ?? ""}`.toUpperCase() || "Account";
}

/** The spent share comes back at reset. SVG keeps the hatching static on both platforms. */
function AccountSegment({
  remaining,
  color,
  pending,
}: {
  readonly remaining: number;
  readonly color: string;
  readonly pending: boolean;
}) {
  const patternId = useId().replace(/:/g, "");
  return (
    <Svg width="100%" height="100%" accessible={false}>
      <Defs>
        <Pattern id={patternId} width={6} height={6} patternUnits="userSpaceOnUse">
          <Path d="M-1 1L1 -1M0 6L6 0M5 7L7 5" stroke={color} strokeWidth={1} opacity={0.22} />
        </Pattern>
      </Defs>
      {pending ? (
        <Rect
          x={`${remaining}%`}
          width={`${100 - remaining}%`}
          height="100%"
          fill={`url(#${patternId})`}
        />
      ) : null}
      <Rect width={`${remaining}%`} height="100%" fill={color} opacity={0.35} />
    </Svg>
  );
}

export function PoolWindowCard({
  pool,
  color,
  now,
  environmentIds,
  label,
  description,
  onOpenAccount,
  activeAccountKey,
}: {
  readonly pool: LimitPoolWindow;
  readonly color: string;
  readonly now: number;
  readonly environmentIds: readonly string[] | null;
  readonly label?: string;
  readonly description?: string;
  readonly onOpenAccount?: (account: LimitAccount) => void;
  readonly activeAccountKey?: string | undefined;
}) {
  const navigation = useNavigation();
  const nextRefill = pool.resets.find((reset) => reset.restoresPercent > 0);
  const openAccount = (account: LimitAccount) => {
    if (onOpenAccount) return onOpenAccount(account);
    navigation.navigate("SettingsSheet", {
      screen: "SettingsContent",
      params: {
        screen: "SettingsUsageAccount",
        params: {
          accountKey: account.key,
          windowId: pool.id,
          windowKind: pool.kind,
          environmentIds,
          now,
        },
      },
    });
  };
  return (
    <View className="gap-3 rounded-[24px] border-continuous bg-card p-4">
      <View className="flex-row items-start justify-between gap-3">
        <View className="gap-1">
          <Text className="text-sm font-t3-medium text-foreground">{label ?? pool.label}</Text>
          <View className="flex-row items-baseline gap-1.5">
            <Text className="text-3xl font-t3-bold tabular-nums text-foreground">
              {pool.remainingPercent}%
            </Text>
            <Text className="text-sm text-foreground-muted">left</Text>
          </View>
        </View>
        {pool.pace ? (
          <Text className="text-xs text-foreground-tertiary">{PACE_LABEL[pool.pace]}</Text>
        ) : null}
      </View>
      {description ? <Text className="text-xs text-foreground-muted">{description}</Text> : null}
      {nextRefill ? (
        <Text className="text-xs tabular-nums text-foreground-muted">
          ↻ +{nextRefill.restoresPercent}%{" "}
          {nextRefill.at <= now ? "now" : `in ${formatDuration(nextRefill.at - now)}`}
        </Text>
      ) : null}
      <View className="flex-row gap-1">
        {pool.columns.map(({ account, window }, index) => {
          if (!window)
            return (
              <View
                key={account.key}
                className="h-7 min-w-0"
                style={{ flex: limitAccountWeight(account) }}
              />
            );
          return (
            <Pressable
              key={account.key}
              accessibilityRole="button"
              accessibilityLabel={`Segment ${index + 1}, ${accountName(account)}, ${remainingPercent(window)}% left${account.key === activeAccountKey ? ", active account" : ""}`}
              accessibilityHint="Show account details"
              onPress={() => openAccount(account)}
              className="h-7 min-w-0 overflow-hidden rounded-md bg-subtle"
              style={{ flex: limitAccountWeight(account) }}
            >
              <AccountSegment
                remaining={remainingPercent(window)}
                color={color}
                pending={Boolean(window.resetsAt)}
              />
              <View pointerEvents="none" className="absolute inset-0 items-center justify-center">
                <Text className="text-xs font-t3-medium tabular-nums text-foreground">
                  {index + 1}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
      <View>
        {pool.columns.map(({ account, window }, index) => {
          if (!window) return null;
          const credits = account.limits.resetCredits?.availableCount ?? 0;
          const resetsIn = formatResetsIn(window, now);
          return (
            <Pressable
              key={account.key}
              accessibilityRole="button"
              accessibilityLabel={`Segment ${index + 1}, ${accountName(account)}, ${remainingPercent(window)}% left${account.key === activeAccountKey ? ", active account" : ""}${resetsIn ? `, ${resetsIn}` : ""}${credits ? `, ${credits} reset credits banked` : ""}`}
              accessibilityHint="Show account details"
              onPress={() => openAccount(account)}
              className="min-h-[44px] flex-row items-center gap-2 active:opacity-60"
            >
              <View className="size-5 items-center justify-center overflow-hidden rounded-md bg-subtle-strong">
                <Text className="text-xs font-t3-medium tabular-nums text-foreground">
                  {index + 1}
                </Text>
              </View>
              <Text
                numberOfLines={1}
                className="min-w-0 flex-1 text-sm font-t3-medium text-foreground"
              >
                {accountName(account)}
              </Text>
              {account.key === activeAccountKey ? (
                <Text className="text-xs text-foreground-muted">Active</Text>
              ) : null}
              <Text className="text-sm font-t3-medium tabular-nums text-foreground">
                {remainingPercent(window)}%
              </Text>
              <View className="flex-row items-center gap-1">
                {resetsIn ? (
                  <Text className="text-xs tabular-nums text-foreground-muted">
                    {resetsIn.replace("resets in ", "↻ ")}
                  </Text>
                ) : null}
                {credits ? (
                  <>
                    {resetsIn ? <Text className="text-xs text-foreground-tertiary">·</Text> : null}
                    <SymbolView name="ticket" size={13} tintColorClassName="accent-icon" />
                    <Text className="text-xs font-t3-medium tabular-nums text-foreground">
                      {credits}
                    </Text>
                  </>
                ) : null}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
