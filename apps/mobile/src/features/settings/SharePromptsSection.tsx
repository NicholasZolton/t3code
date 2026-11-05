import { useAtomValue } from "@effect/atom-react";
import type { EnvironmentId } from "@t3tools/contracts";
import {
  planSavedPromptTransfer,
  SAVED_PROMPT_TRANSFER_MODES,
  type SavedPromptTransferMode,
} from "@t3tools/shared/savedPrompts";
import { Atom } from "effect/reactivity";
import { useState, type ReactNode } from "react";
import { View } from "react-native";

import { AppText as Text } from "../../components/ui/AppText";
import * as Dialog from "../../components/ui/Dialog";
import { ListActionRow } from "../../components/ui/ListActionRow";
import { ListChoiceRow } from "../../components/ui/ListChoiceRow";
import { SelectionRow } from "../../components/ui/SelectionRow";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { SettingsSection } from "./components/SettingsSection";
import { useSettingsEnvironmentFilter } from "./settings-environment-filter";

export function SharePromptsSection(): ReactNode {
  const { availableTargets, selectedTargets } = useSettingsEnvironmentFilter();
  const update = useAtomCommand(serverEnvironment.updateSettings, { reportFailure: false });
  const [open, setOpen] = useState(false);
  const [sourceId, setSourceId] = useState<EnvironmentId | null>(null);
  const [mode, setMode] = useState<SavedPromptTransferMode>("copy");
  const [pending, setPending] = useState(false);
  const sources = availableTargets.filter((entry) =>
    selectedTargets.some((target) => target.environmentId !== entry.environmentId),
  );
  const source = sources.find((entry) => entry.environmentId === sourceId);
  const destinations = selectedTargets.filter(
    (target) => target.environmentId !== source?.environmentId,
  );
  const canWrite = useAtomValue(
    Atom.make((get) =>
      destinations.every((target) =>
        get(serverEnvironment.updateSettings.permissionAtom(target.environmentId)),
      ),
    ),
  );
  const writes = destinations.flatMap((target) => {
    if (!source) return [];
    const plan = planSavedPromptTransfer(
      source.serverConfig.settings.savedPrompts,
      target.serverConfig.settings.savedPrompts,
      mode,
    );
    return Object.keys(plan.patch).length > 0 ? [{ ...target, ...plan }] : [];
  });

  const transfer = async (): Promise<void> => {
    if (pending || !canWrite || !source || writes.length === 0) return;
    setPending(true);
    const results = await Promise.all(
      writes.map(async (target) => ({
        label: target.label,
        result: await update({
          environmentId: target.environmentId,
          input: { patch: { savedPrompts: target.patch } },
        }),
      })),
    ).catch((error: unknown) => {
      Dialog.alert("Prompts not saved", error instanceof Error ? error.message : "Try again.");
      return null;
    });
    setPending(false);
    if (results === null) return;
    const failed = results.filter(({ result }) => result._tag !== "Success");
    const saved = results.filter(({ result }) => result._tag === "Success");
    if (failed.length > 0) {
      Dialog.alert(
        "Prompts not saved",
        [
          `Could not save on ${failed.map(({ label }) => label).join(", ")}.`,
          ...(saved.length > 0 ? [`Saved on ${saved.map(({ label }) => label).join(", ")}.`] : []),
        ].join(" "),
      );
      return;
    }
    Dialog.alert(
      mode === "sync" ? "Prompts synced" : "Prompts copied",
      `Saved on ${saved.map(({ label }) => label).join(", ")}.`,
    );
    setOpen(false);
  };

  const requestTransfer = (): void => {
    if (pending || !canWrite || !source || writes.length === 0) return;
    if (mode !== "sync") {
      void transfer();
      return;
    }
    Dialog.alert(
      "Sync prompts?",
      `Make prompts on ${writes.map(({ label }) => label).join(", ")} exactly match ${source.label}? This replaces matching prompts and deletes ${writes.reduce((count, target) => count + target.removed.length, 0)} destination-only prompts. The source is not changed.`,
      [
        { text: "Cancel" },
        { text: "Sync prompts", style: "destructive", onPress: () => void transfer() },
      ],
    );
  };

  return (
    <SettingsSection title="Share prompts">
      <ListActionRow
        label="Copy or sync"
        disabled={pending || selectedTargets.length === 0}
        onPress={() => {
          setMode("copy");
          setSourceId(
            sources.find(
              (entry) => Object.keys(entry.serverConfig.settings.savedPrompts).length > 0,
            )?.environmentId ??
              sources[0]?.environmentId ??
              null,
          );
          setOpen(!open);
        }}
      />
      {open ? (
        <>
          <View className="gap-2 px-4 py-3">
            <Text className="text-sm text-foreground-muted">
              Changes run once, not automatically. Variables are copied as written. The source is
              not changed.
            </Text>
            <Text className="text-sm text-foreground-muted">
              Destinations:{" "}
              {destinations
                .map(({ label, displayUrl }) => (displayUrl ? `${label} · ${displayUrl}` : label))
                .join(", ")}
              .
            </Text>
            <Text className="font-t3-medium">Source environment</Text>
            {sources.length === 0 ? (
              <Text className="text-sm text-foreground-muted">
                Connect another environment to copy or sync its prompts here.
              </Text>
            ) : null}
          </View>
          {sources.map((entry) => (
            <SelectionRow
              key={entry.environmentId}
              title={entry.label}
              subtitle={entry.displayUrl ?? undefined}
              selected={entry.environmentId === source?.environmentId}
              disabled={pending}
              onPress={() => setSourceId(entry.environmentId)}
            />
          ))}
          {SAVED_PROMPT_TRANSFER_MODES.map((option) => (
            <ListChoiceRow
              key={option.value}
              label={option.label}
              description={option.description}
              selected={mode === option.value}
              disabled={pending}
              onPress={() => setMode(option.value)}
            />
          ))}
          {writes.map((target) => (
            <View key={target.environmentId} className="gap-1 px-4 py-3">
              <Text className="text-xs text-foreground-muted">
                {target.label}: {target.added} added, {target.updated} replaced,{" "}
                {target.removed.length} removed.
              </Text>
              {target.removed.length > 0 ? (
                <Text className="text-xs text-danger-foreground">
                  Remove: {target.removed.map((name) => `>${name}`).join(", ")}
                </Text>
              ) : null}
            </View>
          ))}
          <ListActionRow
            label={mode === "sync" ? "Sync prompts" : "Copy prompts"}
            tone={mode === "sync" ? "danger" : "default"}
            loading={pending}
            disabled={!canWrite || writes.length === 0}
            description={
              !canWrite
                ? "You need settings permission on each destination."
                : writes.length === 0
                  ? "No changes with these options."
                  : undefined
            }
            onPress={requestTransfer}
          />
        </>
      ) : null}
    </SettingsSection>
  );
}
