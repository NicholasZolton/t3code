import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import type { CritOpenInput, EnvironmentId } from "@t3tools/contracts";
import * as Option from "effect/Option";
import { useState } from "react";

import { toastManager } from "../components/ui/toast";
import { shellEnvironment } from "../state/shell";
import { useEnvironment } from "../state/environments";
import { useAtomCommand } from "../state/use-atom-command";
import { usePreparedConnection } from "../state/session";
import { ensureLocalApi } from "../localApi";
import { resolveCritForwarding } from "./useOpenInCrit.logic";

async function syncCritForwarding(
  forwarding: ReturnType<typeof resolveCritForwarding>,
  cwd: string,
): Promise<number | null> {
  if (forwarding.kind !== "ssh") return null;
  const sync = window.desktopBridge?.syncSshPortlessForward;
  if (!sync) throw new Error("SSH Portless forwarding requires the desktop app.");
  const port = await sync({ target: forwarding.target, cwd });
  if (port === null) throw new Error("No SSH Portless forward is available for this project.");
  return port;
}

async function openCritUrl(url: string | null, remote: boolean): Promise<void> {
  if (url === null) {
    if (remote)
      throw new Error("The remote server did not forward Crit. Update the server and try again.");
    return;
  }
  await ensureLocalApi().shell.openExternal(url);
}

function reportCritError(error: unknown): void {
  toastManager.add({
    type: "error",
    title: "Could not open Crit",
    description: error instanceof Error ? error.message : String(error),
  });
}

export function useOpenInCrit(environmentId: EnvironmentId | null): {
  open: (input: CritOpenInput) => Promise<void>;
  opening: boolean;
} {
  const command = useAtomCommand(shellEnvironment.openInCrit, { reportFailure: false });
  const environment = useEnvironment(environmentId);
  const prepared = usePreparedConnection(environmentId);
  const [opening, setOpening] = useState(false);

  const open = async (input: CritOpenInput): Promise<void> => {
    if (environmentId === null || opening) return;
    setOpening(true);
    try {
      const forwarding = resolveCritForwarding(
        environment?.entry ?? null,
        Option.getOrNull(prepared),
      );
      const portlessPort = await syncCritForwarding(forwarding, input.cwd);
      const result = await command({
        environmentId,
        input: {
          ...input,
          ...(portlessPort === null ? {} : { portlessPort }),
          ...(forwarding.kind === "tailscale" ? { tailscale: true } : {}),
        },
      });
      if (result._tag === "Success") {
        await openCritUrl(result.value, forwarding.kind !== "local");
      }
      if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
        reportCritError(squashAtomCommandFailure(result));
      }
    } catch (error) {
      reportCritError(error);
    }
    setOpening(false);
  };

  return { open, opening };
}
