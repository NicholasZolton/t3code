import {
  ProviderDriverKind,
  type EnvironmentId,
  type OpenCodeCodexAccount,
  type ProviderInstanceId,
} from "@t3tools/contracts";
import {
  collectOpenCodeAccountTargets,
  type LimitPresentations,
} from "@t3tools/shared/usageLimits";
import { useEffect, useState } from "react";

import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { ProviderInstanceIcon } from "../chat/ProviderInstanceIcon";
import { RedactedSensitiveText } from "../settings/RedactedSensitiveText";
import { Button } from "../ui/button";
import { formatResetsIn, remainingPercent } from "@t3tools/shared/usageLimits";

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
    <section className="flex flex-col gap-3">
      <h2 className="flex items-center gap-2 text-sm font-medium text-foreground">
        <ProviderInstanceIcon
          driverKind={ProviderDriverKind.make("opencode")}
          displayName="OpenCode"
          indicatorBackground="var(--background)"
          className="size-5"
          iconClassName="size-4 text-foreground/80"
        />
        OpenCode · Codex {label}
      </h2>
      {accounts?.map((account) => (
        <div
          key={account.id}
          className="flex flex-col gap-2 rounded-lg border border-border/60 p-4"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-1 text-sm font-medium text-foreground">
              {account.label.includes("@") ? (
                <RedactedSensitiveText
                  value={account.label}
                  ariaLabel="Toggle account label visibility"
                  revealTooltip="Click to reveal label"
                  hideTooltip="Click to hide label"
                />
              ) : (
                <span className="truncate">{account.label}</span>
              )}
              {account.plan ? (
                <span className="text-muted-foreground">· {account.plan}</span>
              ) : null}
            </span>
            {account.active ? (
              <span className="text-xs text-muted-foreground">Active</span>
            ) : (
              <Button
                size="xs"
                variant="outline"
                disabled={busyId !== null}
                onClick={() => void switchAccount(account.id)}
              >
                {busyId === account.id ? "Switching…" : "Switch to account"}
              </Button>
            )}
          </div>
          {account.limits.unavailable ? (
            <p className="text-xs text-muted-foreground">{account.limits.unavailable.message}</p>
          ) : null}
          {!account.limits.unavailable && account.limits.windows.length === 0 ? (
            <p className="text-xs text-muted-foreground">No usage windows reported.</p>
          ) : null}
          {account.limits.windows.map((window) => (
            <div
              key={window.id}
              className="flex justify-between gap-3 text-xs text-muted-foreground"
            >
              <span>{window.label}</span>
              <span className="tabular-nums">
                {remainingPercent(window)}% left · {formatResetsIn(window, now) ?? "reset unknown"}
              </span>
            </div>
          ))}
        </div>
      ))}
      {accounts?.length === 0 ? (
        <p className="text-xs text-muted-foreground">No local OpenCode Codex accounts available.</p>
      ) : null}
      {accounts === null && !message ? (
        <p className="text-xs text-muted-foreground">Checking accounts…</p>
      ) : null}
      {message ? (
        <p role="status" className="text-xs text-muted-foreground">
          {message}
        </p>
      ) : null}
    </section>
  );
}

/** The account store is local to an OpenCode instance's environment. */
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
