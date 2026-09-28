import { scoreQueryMatch } from "./searchRanking.ts";

const VARIABLE = /\{\{(clipboard|env\.([a-zA-Z_][a-zA-Z0-9_]*))\}\}/g;

export function searchSavedPrompts(
  prompts: Readonly<Record<string, string>>,
  query: string,
): Array<[string, string]> {
  const normalizedQuery = query.toLowerCase();
  if (!normalizedQuery) {
    return Object.entries(prompts).sort(([left], [right]) => left.localeCompare(right));
  }

  return Object.entries(prompts)
    .map(([name, body]) => ({
      name,
      body,
      score: scoreQueryMatch({
        value: name.toLowerCase(),
        query: normalizedQuery,
        exactBase: 0,
        prefixBase: 1,
        includesBase: 100,
        fuzzyBase: 500,
      }),
    }))
    .filter((entry): entry is typeof entry & { score: number } => entry.score !== null)
    .sort((left, right) => left.score - right.score || left.name.localeCompare(right.name))
    .map(({ name, body }) => [name, body]);
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
