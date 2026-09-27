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

export function useOpenInCrit(environmentId: EnvironmentId | null): {
  open: (input: CritOpenInput) => Promise<void>;
  opening: boolean;
} {
  const command = useAtomCommand(shellEnvironment.openInCrit, { reportFailure: false });
  const environment = useEnvironment(environmentId);
  const [opening, setOpening] = useState(false);

  const open = async (input: CritOpenInput): Promise<void> => {
    if (environmentId === null || opening) return;
    setOpening(true);
    try {
      const profile = environment?.entry.profile;
      const sshTarget =
        environment?.entry.target._tag === "SshConnectionTarget" &&
        profile &&
        Option.isSome(profile) &&
        profile.value._tag === "SshConnectionProfile"
          ? profile.value.target
          : null;
      if (environment?.entry.target._tag === "SshConnectionTarget" && !sshTarget) {
        throw new Error("The SSH connection is not ready to forward Crit.");
      }
      let portlessPort: number | null = null;
      if (sshTarget) {
        const sync = window.desktopBridge?.syncSshPortlessForward;
        if (!sync) throw new Error("SSH Portless forwarding requires the desktop app.");
        portlessPort = await sync({ target: sshTarget, cwd: input.cwd });
        if (portlessPort === null)
          throw new Error("No SSH Portless forward is available for this project.");
      }
      const result = await command({
        environmentId,
        input: portlessPort === null ? input : { ...input, portlessPort },
      });
      if (result._tag === "Success" && result.value !== null) {
        if (!(await window.desktopBridge?.openExternal(result.value))) {
          throw new Error("Could not open the forwarded Crit review in the browser.");
        }
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
