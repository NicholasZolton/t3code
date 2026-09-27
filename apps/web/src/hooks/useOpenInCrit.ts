import {
  isAtomCommandInterrupted,
  squashAtomCommandFailure,
} from "@t3tools/client-runtime/state/runtime";
import type { CritOpenInput, EnvironmentId } from "@t3tools/contracts";
import { useState } from "react";

import { toastManager } from "../components/ui/toast";
import { shellEnvironment } from "../state/shell";
import { useAtomCommand } from "../state/use-atom-command";

export function useOpenInCrit(environmentId: EnvironmentId | null): {
  open: (input: CritOpenInput) => Promise<void>;
  opening: boolean;
} {
  const command = useAtomCommand(shellEnvironment.openInCrit, { reportFailure: false });
  const [opening, setOpening] = useState(false);

  const open = async (input: CritOpenInput): Promise<void> => {
    if (environmentId === null || opening) return;
    setOpening(true);
    try {
      const result = await command({ environmentId, input });
      if (result._tag === "Failure" && !isAtomCommandInterrupted(result)) {
        const error = squashAtomCommandFailure(result);
        toastManager.add({
          type: "error",
          title: "Could not open Crit",
          description: error instanceof Error ? error.message : String(error),
        });
      }
    } finally {
      setOpening(false);
    }
  };

  return { open, opening };
}
