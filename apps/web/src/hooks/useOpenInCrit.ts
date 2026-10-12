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
      let portlessPort: number | null = null;
      if (forwarding.kind === "ssh") {
        const sync = window.desktopBridge?.syncSshPortlessForward;
        if (!sync) throw new Error("SSH Portless forwarding requires the desktop app.");
        portlessPort = await sync({ target: forwarding.target, cwd: input.cwd });
        if (portlessPort === null)
          throw new Error("No SSH Portless forward is available for this project.");
      }
      const result = await command({
        environmentId,
        input: {
          ...input,
          ...(portlessPort === null ? {} : { portlessPort }),
          ...(forwarding.kind === "tailscale" ? { tailscale: true } : {}),
        },
      });
      if (result._tag === "Success" && result.value === null && forwarding.kind !== "local") {
        throw new Error("The remote server did not forward Crit. Update the server and try again.");
      }
      if (result._tag === "Success" && result.value !== null) {
        await ensureLocalApi().shell.openExternal(result.value);
      }
      if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
        const error = squashAtomCommandFailure(result);
        toastManager.add({
          type: "error",
          title: "Could not open Crit",
          description: error instanceof Error ? error.message : String(error),
        });
      }
    } catch (error) {
      toastManager.add({
        type: "error",
        title: "Could not open Crit",
        description: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setOpening(false);
    }
  };

  return { open, opening };
}
