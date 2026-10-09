import { scoreSearchFields, SEARCH_SECONDARY_FIELD_WEIGHT } from "@t3tools/shared/searchRanking";

export interface CommandPaletteItem {
  readonly key: string;
  readonly kind: "action" | "project" | "thread";
  readonly title: string;
  readonly detail?: string;
  readonly searchTerms: ReadonlyArray<string>;
  readonly run: () => void;
}

/** `>` narrows to actions, matching the desktop palette. Stable ties retain recent-thread order. */
export function filterCommandPaletteItems(
  items: ReadonlyArray<CommandPaletteItem>,
  query: string,
  matchedThreadKeys: ReadonlySet<string>,
) {
  const actionsOnly = query.startsWith(">");
  const normalized = (actionsOnly ? query.slice(1) : query).trim();
  return items
    .flatMap((item, index) => {
      if (actionsOnly && item.kind !== "action") return [];
      if (!normalized) return item.kind === "project" ? [] : [{ item, score: 0, index }];
      const score = scoreSearchFields(
        [
          item.title,
          ...item.searchTerms.map((value) => ({ value, weight: SEARCH_SECONDARY_FIELD_WEIGHT })),
        ],
        normalized,
      );
      if (score !== null) return [{ item, score, index }];
      return item.kind === "thread" && matchedThreadKeys.has(item.key)
        ? [{ item, score: Number.MAX_SAFE_INTEGER, index }]
        : [];
    })
    .sort((left, right) => left.score - right.score || left.index - right.index)
    .map(({ item }) => item);
}

export function nextPaletteIndex(index: number, direction: -1 | 1, count: number) {
  return count === 0 ? 0 : (index + direction + count) % count;
}
