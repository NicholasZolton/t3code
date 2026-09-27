import { useState } from "react";
import {
  SAVED_PROMPT_BODY_MAX_LENGTH,
  SAVED_PROMPT_NAME_MAX_LENGTH,
  SAVED_PROMPT_NAME_PATTERN,
} from "@t3tools/contracts/settings";
import { Alert, Pressable, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppText as Text } from "../../components/AppText";
import { ScreenScrollView } from "../../components/ScreenScrollView";
import { serverEnvironment } from "../../state/server";
import { useAtomCommand } from "../../state/use-atom-command";
import { SettingsSection } from "./components/SettingsSection";
import { SettingsScreen } from "./components/SettingsScreen";
import {
  SettingsEnvironmentFilterHeader,
  AndroidSettingsEnvironmentFilter,
} from "./components/SettingsEnvironmentFilterHeader";
import { useSettingsEnvironmentFilter } from "./settings-environment-filter";

export function SettingsPromptsRouteScreen() {
  const insets = useSafeAreaInsets();
  const { selectedTargets, selectedProjectKey } = useSettingsEnvironmentFilter();
  const update = useAtomCommand(serverEnvironment.updateSettings, { reportFailure: false });
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [pending, setPending] = useState(false);
  const prompts: Record<string, string> = Object.assign(
    {},
    ...selectedTargets.map((entry) => entry.serverConfig.settings.savedPrompts).reverse(),
  );
  const trimmedName = name.trim();
  const canSave =
    SAVED_PROMPT_NAME_PATTERN.test(trimmedName) &&
    trimmedName.length <= SAVED_PROMPT_NAME_MAX_LENGTH &&
    body.trim().length > 0 &&
    body.length <= SAVED_PROMPT_BODY_MAX_LENGTH &&
    (editing === trimmedName || !Object.hasOwn(prompts, trimmedName));

  const open = (promptName: string | null) => {
    setName(promptName ?? "");
    setBody(promptName === null ? "" : (prompts[promptName] ?? ""));
    setEditing(promptName ?? "");
  };
  const write = async (patch: Record<string, string | null>) => {
    setPending(true);
    try {
      const results = await Promise.all(
        selectedTargets.map((target) =>
          update({
            environmentId: target.environmentId,
            input: { patch: { savedPrompts: patch } },
          }),
        ),
      );
      if (results.some((result) => result._tag !== "Success"))
        throw new Error("One or more machines could not save the prompt.");
      setEditing(null);
    } catch (error) {
      Alert.alert("Prompt not saved", error instanceof Error ? error.message : "Try again.");
    } finally {
      setPending(false);
    }
  };

  return (
    <>
      <SettingsEnvironmentFilterHeader />
      <SettingsScreen title="Prompts" trailing={<AndroidSettingsEnvironmentFilter />}>
        <ScreenScrollView
          contentContainerClassName="gap-5 px-5 pt-4"
          contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 18) + 18 }}
        >
          <Text className="text-sm text-foreground-muted">
            Type &gt; followed by a short name in the composer. {"{{env.NAME}}"} reads from the host
            machine; {"{{clipboard}}"} reads this device’s clipboard.
          </Text>
          {selectedProjectKey !== null ? (
            <Text className="text-sm text-foreground-muted">
              Select environments instead of a project to edit prompts.
            </Text>
          ) : null}
          {selectedTargets.length > 1 ? (
            <Text className="text-xs text-foreground-muted">
              Changes are saved to every selected machine.
            </Text>
          ) : null}
          {selectedProjectKey === null ? (
            <SettingsSection title="Reusable prompts">
              {Object.entries(prompts)
                .sort(([a], [b]) => a.localeCompare(b))
                .map(([promptName, promptBody]) => (
                  <View key={promptName} className="gap-1 border-b border-border p-4">
                    <Text className="font-t3-medium">&gt;{promptName}</Text>
                    <Text numberOfLines={2} className="text-xs text-foreground-muted">
                      {promptBody}
                    </Text>
                    <View className="flex-row gap-5 pt-2">
                      <Pressable
                        disabled={pending}
                        onPress={() => open(promptName)}
                        accessibilityRole="button"
                      >
                        <Text className="text-primary">Edit</Text>
                      </Pressable>
                      <Pressable
                        disabled={pending}
                        onPress={() =>
                          Alert.alert("Delete prompt?", `Remove >${promptName}?`, [
                            { text: "Cancel" },
                            {
                              text: "Delete",
                              style: "destructive",
                              onPress: () => void write({ [promptName]: null }),
                            },
                          ])
                        }
                        accessibilityRole="button"
                      >
                        <Text className="text-danger-foreground">Delete</Text>
                      </Pressable>
                    </View>
                  </View>
                ))}
              <Pressable className="p-4" accessibilityRole="button" onPress={() => open(null)}>
                <Text className="text-primary">Add prompt</Text>
              </Pressable>
            </SettingsSection>
          ) : null}
          {editing !== null && selectedProjectKey === null ? (
            <View className="gap-3 rounded-2xl border border-border p-4">
              <Text className="font-t3-medium">Short name</Text>
              <TextInput
                value={name}
                onChangeText={setName}
                maxLength={SAVED_PROMPT_NAME_MAX_LENGTH}
                placeholder="pr"
                autoCapitalize="none"
                autoCorrect={false}
                className="rounded-lg border border-border p-3 text-foreground"
              />
              <Text className="font-t3-medium">Prompt</Text>
              <TextInput
                value={body}
                onChangeText={setBody}
                maxLength={SAVED_PROMPT_BODY_MAX_LENGTH}
                placeholder="Go ahead and file a PR…"
                multiline
                className="min-h-32 rounded-lg border border-border p-3 text-foreground"
                textAlignVertical="top"
              />
              <View className="flex-row gap-5">
                <Pressable
                  disabled={!canSave || pending}
                  accessibilityRole="button"
                  onPress={() =>
                    void write({
                      ...(editing && editing !== trimmedName ? { [editing]: null } : {}),
                      [trimmedName]: body,
                    })
                  }
                >
                  <Text className="text-primary">Save</Text>
                </Pressable>
                <Pressable accessibilityRole="button" onPress={() => setEditing(null)}>
                  <Text>Cancel</Text>
                </Pressable>
              </View>
            </View>
          ) : null}
        </ScreenScrollView>
      </SettingsScreen>
    </>
  );
}
