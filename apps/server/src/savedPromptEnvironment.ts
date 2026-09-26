import type { ServerSettings } from "@t3tools/contracts";
import { savedPromptEnvironmentNames } from "@t3tools/shared/savedPrompts";

/** Resolve only names referenced by a saved prompt, using this server's process environment. */
export function resolveSavedPromptEnvironment(
  settings: ServerSettings,
  name: string,
  hostEnvironment: NodeJS.ProcessEnv,
): Record<string, string | null> {
  const body = Object.hasOwn(settings.savedPrompts, name) ? settings.savedPrompts[name] : undefined;
  if (body === undefined) return {};
  return Object.fromEntries(
    savedPromptEnvironmentNames(body).map((variable) => [
      variable,
      hostEnvironment[variable] ?? null,
    ]),
  );
}
