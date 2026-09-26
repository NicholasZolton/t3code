import { useState } from "react";
import {
  SAVED_PROMPT_BODY_MAX_LENGTH,
  SAVED_PROMPT_NAME_MAX_LENGTH,
  SAVED_PROMPT_NAME_PATTERN,
} from "@t3tools/contracts/settings";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Textarea } from "../ui/textarea";
import { SettingsPageContainer, SettingsSection } from "./settingsLayout";
import { SettingsScopeNotice } from "./SettingsScopeNotice";
import { useSettingsScope } from "./SettingsScopeContext";
import { useUpdateScopedSettings } from "./useScopedSettings";

export function PromptsSettings() {
  const { scope, targets } = useSettingsScope();
  const updateSettings = useUpdateScopedSettings();
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const prompts: Record<string, string> = Object.assign(
    {},
    ...targets.map((entry) => entry.settings.savedPrompts).reverse(),
  );

  if (scope.kind === "project" || scope.kind === "checkout") {
    return (
      <SettingsScopeNotice target="environment">
        Choose a machine to edit its reusable prompts.
      </SettingsScopeNotice>
    );
  }

  const open = (promptName: string | null) => {
    setEditing(promptName ?? "");
    setName(promptName ?? "");
    setBody(promptName === null ? "" : (prompts[promptName] ?? ""));
  };
  const trimmedName = name.trim();
  const canSave =
    SAVED_PROMPT_NAME_PATTERN.test(trimmedName) &&
    trimmedName.length <= SAVED_PROMPT_NAME_MAX_LENGTH &&
    body.trim().length > 0 &&
    body.length <= SAVED_PROMPT_BODY_MAX_LENGTH &&
    (editing === trimmedName || !Object.hasOwn(prompts, trimmedName));

  return (
    <SettingsPageContainer>
      <SettingsSection
        id="saved-prompts"
        title="Reusable prompts"
        headerAction={
          <Button size="sm" variant="outline" onClick={() => open(null)}>
            Add prompt
          </Button>
        }
      >
        <p className="px-3 text-sm text-muted-foreground sm:px-4">
          Type &gt; followed by a short name in the composer. Use {"{{env.NAME}}"} for a variable on
          the selected host and {"{{clipboard}}"} for text from this device’s clipboard.
        </p>
        {targets.length > 1 ? (
          <p className="px-3 text-xs text-muted-foreground sm:px-4">
            Changes are saved to every selected machine.
          </p>
        ) : null}
        <div className="space-y-2 px-3 sm:px-4">
          {Object.entries(prompts)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([promptName, promptBody]) => (
              <div key={promptName} className="flex items-center gap-3 rounded-lg border p-3">
                <div className="min-w-0 flex-1">
                  <div className="font-medium">&gt;{promptName}</div>
                  <div className="truncate text-xs text-muted-foreground">{promptBody}</div>
                </div>
                <Button size="sm" variant="outline" onClick={() => open(promptName)}>
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => updateSettings({ savedPrompts: { [promptName]: null } })}
                >
                  Delete
                </Button>
              </div>
            ))}
          {editing !== null ? (
            <form
              className="space-y-3 rounded-lg border p-3"
              onSubmit={(event) => {
                event.preventDefault();
                if (!canSave) return;
                updateSettings({
                  savedPrompts: {
                    ...(editing && editing !== trimmedName ? { [editing]: null } : {}),
                    [trimmedName]: body,
                  },
                });
                setEditing(null);
              }}
            >
              <label className="block space-y-1 text-sm">
                Short name
                <Input
                  autoFocus
                  value={name}
                  maxLength={SAVED_PROMPT_NAME_MAX_LENGTH}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="pr"
                  aria-invalid={name.length > 0 && !SAVED_PROMPT_NAME_PATTERN.test(trimmedName)}
                />
              </label>
              <label className="block space-y-1 text-sm">
                Prompt
                <Textarea
                  value={body}
                  maxLength={SAVED_PROMPT_BODY_MAX_LENGTH}
                  onChange={(event) => setBody(event.target.value)}
                  placeholder="Go ahead and file a PR…"
                />
              </label>
              <div className="flex gap-2">
                <Button size="sm" type="submit" disabled={!canSave}>
                  Save
                </Button>
                <Button size="sm" variant="outline" type="button" onClick={() => setEditing(null)}>
                  Cancel
                </Button>
              </div>
            </form>
          ) : null}
        </div>
      </SettingsSection>
    </SettingsPageContainer>
  );
}
