import { useState } from "react";
import {
  SAVED_PROMPT_BODY_MAX_LENGTH,
  SAVED_PROMPT_NAME_MAX_LENGTH,
  SAVED_PROMPT_NAME_PATTERN,
} from "@t3tools/contracts/settings";
import { MoreVerticalIcon, PlusIcon } from "lucide-react";
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
import { InputGroup, InputGroupAddon, InputGroupInput } from "../ui/input-group";
import { Label } from "../ui/label";
import { Menu, MenuItem, MenuPopup, MenuTrigger } from "../ui/menu";
import { Textarea } from "../ui/textarea";
import { SettingsGroup } from "./SettingsGroup";
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
    ...targets.map((entry) => entry.settings.savedPrompts).toReversed(),
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
  const nameTaken = editing !== trimmedName && Object.hasOwn(prompts, trimmedName);
  const canSave =
    SAVED_PROMPT_NAME_PATTERN.test(trimmedName) &&
    trimmedName.length <= SAVED_PROMPT_NAME_MAX_LENGTH &&
    body.trim().length > 0 &&
    body.length <= SAVED_PROMPT_BODY_MAX_LENGTH &&
    !nameTaken;

  return (
    <SettingsPageContainer>
      <SettingsSection
        id="saved-prompts"
        title="Reusable prompts"
        variant="plain"
        headerAction={
          <Button size="xs" variant="outline" onClick={() => open(null)}>
            <PlusIcon />
            Add prompt
          </Button>
        }
      >
        <p className="px-3 text-xs leading-relaxed text-muted-foreground sm:px-4">
          Type <code className="font-mono text-foreground">&gt;name</code> in the composer to insert
          a saved prompt.
          {targets.length > 1 ? " Changes apply to every selected machine." : null}
        </p>
        <SettingsGroup>
          {Object.keys(prompts).length === 0 ? (
            <div className="px-3 py-7 sm:px-4">
              <p className="text-sm font-medium">No reusable prompts yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Add one to reuse your instructions across conversations.
              </p>
            </div>
          ) : (
            Object.entries(prompts)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([promptName, promptBody]) => (
                <div
                  key={promptName}
                  className="flex flex-wrap items-center gap-3 px-3 py-3 sm:px-4"
                >
                  <div className="min-w-40 flex-1">
                    <code className="text-sm font-medium text-foreground">&gt;{promptName}</code>
                    <p className="line-clamp-2 whitespace-pre-line wrap-anywhere text-xs text-muted-foreground">
                      {promptBody}
                    </p>
                  </div>
                  <Menu>
                    <MenuTrigger
                      render={
                        <Button
                          size="icon-sm"
                          variant="ghost-muted"
                          aria-label={`Options for >${promptName}`}
                        />
                      }
                    >
                      <MoreVerticalIcon />
                    </MenuTrigger>
                    <MenuPopup align="end">
                      <MenuItem onClick={() => open(promptName)}>Edit</MenuItem>
                      <MenuItem
                        variant="destructive"
                        onClick={() => updateSettings({ savedPrompts: { [promptName]: null } })}
                      >
                        Delete
                      </MenuItem>
                    </MenuPopup>
                  </Menu>
                </div>
              ))
          )}
        </SettingsGroup>
      </SettingsSection>
      <Dialog open={editing !== null} onOpenChange={(isOpen) => !isOpen && setEditing(null)}>
        <DialogPopup className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing ? `Edit >${editing}` : "Add prompt"}</DialogTitle>
            <DialogDescription>
              Insert this prompt by typing its short name after &gt; in the composer.
            </DialogDescription>
          </DialogHeader>
          <DialogPanel>
            <form
              id="saved-prompt-form"
              className="space-y-4"
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
              <div className="space-y-2">
                <Label htmlFor="saved-prompt-name">Short name</Label>
                <InputGroup>
                  <InputGroupAddon>
                    <span aria-hidden className="font-mono text-muted-foreground">
                      &gt;
                    </span>
                  </InputGroupAddon>
                  <InputGroupInput
                    id="saved-prompt-name"
                    autoFocus
                    value={name}
                    maxLength={SAVED_PROMPT_NAME_MAX_LENGTH}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="pr"
                    aria-describedby="saved-prompt-name-hint"
                    aria-invalid={
                      name.length > 0 && (nameTaken || !SAVED_PROMPT_NAME_PATTERN.test(trimmedName))
                    }
                  />
                </InputGroup>
                <p id="saved-prompt-name-hint" className="text-xs text-muted-foreground">
                  {nameTaken
                    ? "A prompt with this name already exists."
                    : "Letters, numbers, hyphens, and underscores. Start with a letter or number."}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="saved-prompt-body">Prompt</Label>
                <Textarea
                  id="saved-prompt-body"
                  value={body}
                  maxLength={SAVED_PROMPT_BODY_MAX_LENGTH}
                  onChange={(event) => setBody(event.target.value)}
                  placeholder="Go ahead and file a PR…"
                  rows={6}
                  aria-describedby="saved-prompt-body-hint"
                />
                <p
                  id="saved-prompt-body-hint"
                  className="text-xs leading-relaxed text-muted-foreground"
                >
                  Use <code className="font-mono text-foreground">{"{{env.NAME}}"}</code> for a
                  variable on the host or{" "}
                  <code className="font-mono text-foreground">{"{{clipboard}}"}</code> for this
                  device’s clipboard.
                </p>
              </div>
            </form>
          </DialogPanel>
          <DialogFooter variant="bare">
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button type="submit" form="saved-prompt-form" disabled={!canSave}>
              {editing ? "Save changes" : "Add prompt"}
            </Button>
          </DialogFooter>
        </DialogPopup>
      </Dialog>
    </SettingsPageContainer>
  );
}
