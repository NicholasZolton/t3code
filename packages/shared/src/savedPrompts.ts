import { searchItems } from "./searchRanking.ts";

const VARIABLE = /\{\{(clipboard|env\.([a-zA-Z_][a-zA-Z0-9_]*))\}\}/g;

export function searchSavedPrompts(
  prompts: Readonly<Record<string, string>>,
  query: string,
): Array<[string, string]> {
  const entries = Object.entries(prompts).sort(([left], [right]) => left.localeCompare(right));
  return searchItems(entries, query, ([name]) => [name]);
}

export function savedPromptEnvironmentNames(body: string): string[] {
  return [
    ...new Set([...body.matchAll(VARIABLE)].flatMap((match) => (match[2] ? [match[2]] : []))),
  ];
}

/** Expand only supported placeholders, preserving other braces as literal prompt text. */
export function expandSavedPrompt(
  body: string,
  environment: Readonly<Record<string, string | null>>,
  clipboard: string | null,
): string {
  return body.replace(VARIABLE, (placeholder, variable: string, name: string | undefined) => {
    if (variable === "clipboard") {
      if (clipboard === null) throw new Error("Could not read the clipboard.");
      if (clipboard.length === 0) throw new Error("The clipboard has no text to insert.");
      return clipboard;
    }
    if (name === undefined || environment[name] == null) {
      throw new Error(`Environment variable ${name ?? placeholder} is not set on the host.`);
    }
    return environment[name];
  });
}
