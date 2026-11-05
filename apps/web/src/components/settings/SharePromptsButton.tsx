import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentId } from "@t3tools/contracts";
import {
  planSavedPromptTransfer,
  SAVED_PROMPT_TRANSFER_MODES,
  type SavedPromptTransferMode,
} from "@t3tools/shared/savedPrompts";
import { Atom } from "effect/reactivity";
import { CopyIcon } from "lucide-react";
import { useState, type ReactNode } from "react";

import { useEnvironments } from "../../state/environments";
import { ensureLocalApi } from "../../localApi";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { Label } from "../ui/label";
import { Select, SelectItem, SelectPopup, SelectTrigger, SelectValue } from "../ui/select";
import { toastManager } from "../ui/toast";
import { useSettingsScope } from "./SettingsScopeContext";
import { settingsScopeEnvironmentLabel } from "./settingsScopeAxis";

export function SharePromptsButton(): ReactNode {
  const { targets } = useSettingsScope();
  const { environments } = useEnvironments();
  const update = useAtomCommand(serverEnvironment.updateSettings, { reportFailure: false });
  const [open, setOpen] = useState(false);
  const [sourceId, setSourceId] = useState<EnvironmentId | null>(null);
  const [mode, setMode] = useState<SavedPromptTransferMode>("copy");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedMode = SAVED_PROMPT_TRANSFER_MODES.find((option) => option.value === mode);
  const sources = environments.flatMap((entry) =>
    entry.connection.phase === "connected" &&
    entry.serverConfig !== null &&
    targets.some((target) => target.environmentId !== entry.environmentId)
      ? [
          {
            environmentId: entry.environmentId,
            label: settingsScopeEnvironmentLabel(entry, environments),
            prompts: entry.serverConfig.settings.savedPrompts,
          },
        ]
      : [],
  );
  const source = sources.find((entry) => entry.environmentId === sourceId);
  const destinations = targets
    .filter((target) => target.environmentId !== source?.environmentId)
    .map((target) => {
      const environment = environments.find(
        (entry) => entry.environmentId === target.environmentId,
      );
      return {
        ...target,
        label: environment
          ? settingsScopeEnvironmentLabel(environment, environments)
          : target.label,
      };
    });
  const canWrite = useAtomValue(
    Atom.make((get) =>
      destinations.every((target) =>
        get(serverEnvironment.updateSettings.permissionAtom(target.environmentId)),
      ),
    ),
  );
  const writes = destinations.flatMap((target) => {
    if (!source) return [];
    const plan = planSavedPromptTransfer(source.prompts, target.settings.savedPrompts, mode);
    return Object.keys(plan.patch).length > 0 ? [{ ...target, ...plan }] : [];
  });

  const transfer = async (): Promise<void> => {
    if (pending || !canWrite || !source || writes.length === 0) return;
    setPending(true);
    setError(null);
    if (mode === "sync") {
      const confirmed = await ensureLocalApi().dialogs.confirm(
        `Make prompts on ${writes.map(({ label }) => label).join(", ")} exactly match ${source.label}?\n\nThis replaces matching prompts and deletes ${writes.reduce((count, target) => count + target.removed.length, 0)} destination-only prompts. The source is not changed.`,
        { variant: "destructive" },
      );
      if (!confirmed) {
        setPending(false);
        return;
      }
    }
    const results = await Promise.all(
      writes.map(async (target) => ({
        label: target.label,
        result: await update({
          environmentId: target.environmentId,
          input: { patch: { savedPrompts: target.patch } },
        }),
      })),
    ).catch((cause: unknown) => {
      setError(cause instanceof Error ? cause.message : "Could not save prompts. Try again.");
      return null;
    });
    setPending(false);
    if (results === null) return;
    const failed = results.filter(({ result }) => result._tag !== "Success");
    if (failed.length > 0) {
      const saved = results.filter(({ result }) => result._tag === "Success");
      setError(
        [
          `Could not save prompts on ${failed.map(({ label }) => label).join(", ")}.`,
          ...(saved.length > 0 ? [`Saved on ${saved.map(({ label }) => label).join(", ")}.`] : []),
        ].join(" "),
      );
      return;
    }
    toastManager.add({
      type: "success",
      title: mode === "sync" ? "Prompts synced" : "Prompts copied",
      description: `Saved on ${results.map(({ label }) => label).join(", ")}.`,
    });
    setOpen(false);
  };

  return (
    <>
      <Button
        size="xs"
        variant="outline"
        disabled={targets.length === 0}
        onClick={() => {
          setMode("copy");
          setSourceId(
            sources.find((entry) => Object.keys(entry.prompts).length > 0)?.environmentId ??
              sources[0]?.environmentId ??
              null,
          );
          setError(null);
          setOpen(true);
        }}
      >
        <CopyIcon />
        Copy or sync
      </Button>
      <Dialog open={open} onOpenChange={(value) => !pending && setOpen(value)}>
        <DialogPopup showCloseButton={!pending}>
          <DialogHeader>
            <DialogTitle>Copy or sync prompts</DialogTitle>
            <DialogDescription>
              Share reusable prompts with the selected environments. Changes run once, not
              automatically.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel>
            <div className="space-y-4">
              {sources.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Connect another environment to copy or sync its prompts here.
                </p>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="copy-prompts-source">Source environment</Label>
                    <Select
                      value={source?.environmentId ?? null}
                      onValueChange={setSourceId}
                      disabled={pending}
                    >
                      <SelectTrigger id="copy-prompts-source">
                        <SelectValue placeholder="Choose an environment">
                          {source?.label}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectPopup>
                        {sources.map((entry) => (
                          <SelectItem key={entry.environmentId} value={entry.environmentId}>
                            {entry.label}
                          </SelectItem>
                        ))}
                      </SelectPopup>
                    </Select>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Destinations: {destinations.map(({ label }) => label).join(", ")}.
                  </p>
                  <div className="space-y-2">
                    <Label htmlFor="prompt-transfer-mode">Action</Label>
                    <Select
                      value={mode}
                      onValueChange={(value) => value !== null && setMode(value)}
                      disabled={pending}
                    >
                      <SelectTrigger id="prompt-transfer-mode">
                        <SelectValue>{selectedMode?.label}</SelectValue>
                      </SelectTrigger>
                      <SelectPopup>
                        {SAVED_PROMPT_TRANSFER_MODES.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectPopup>
                    </Select>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {selectedMode?.description} Variables are copied as written. The source is not
                    changed.
                  </p>
                  <ul
                    aria-label="Prompt changes"
                    className="space-y-2 text-xs text-muted-foreground"
                  >
                    {writes.map((target) => (
                      <li key={target.environmentId}>
                        <p>
                          {target.label}: {target.added} added, {target.updated} replaced,{" "}
                          {target.removed.length} removed.
                        </p>
                        {target.removed.length > 0 ? (
                          <p className="text-destructive">
                            Remove: {target.removed.map((name) => `>${name}`).join(", ")}
                          </p>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                  {writes.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No changes with these options.</p>
                  ) : null}
                  {!canWrite ? (
                    <p className="text-sm text-muted-foreground">
                      You need settings permission on each destination.
                    </p>
                  ) : null}
                </>
              )}
              {error ? (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              ) : null}
            </div>
          </DialogPanel>
          <DialogFooter variant="bare">
            <Button variant="outline" disabled={pending} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={pending || !canWrite || writes.length === 0}
              variant={mode === "sync" ? "destructive" : "default"}
              onClick={() => void transfer()}
            >
              {pending ? "Saving…" : mode === "sync" ? "Sync prompts" : "Copy prompts"}
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </>
  );
}
