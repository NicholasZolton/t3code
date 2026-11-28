import { normalizeSearchQuery, scoreQueryMatch } from "./searchRanking.ts";

export const SEARCH_SECONDARY_FIELD_WEIGHT = 1_000;

export type SearchField =
  | string
  | {
      readonly value: string;
      readonly weight?: number;
      readonly fuzzy?: boolean;
    };

function normalizeSearchField(value: string): string {
  return normalizeSearchQuery(value.normalize("NFKD").replace(/\p{M}/gu, "")).replace(/\s+/gu, " ");
}

function scoreField(
  value: string,
  query: string,
  fuzzy: boolean,
  ignorePosition: boolean,
): number | null {
  return scoreQueryMatch({
    value,
    query,
    exactBase: 0,
    prefixBase: 1,
    boundaryBase: 2,
    includesBase: 100,
    ...(fuzzy ? { fuzzyBase: 500 } : {}),
    boundaryMarkers: [" ", "-", "_", "/", "\\", ".", ":"],
    ignorePosition,
  });
}

function scoreNormalizedSearchFields(
  fields: readonly SearchField[],
  query: string,
  ignorePosition = false,
): number | null {
  if (!query) return 0;
  const normalizedFields = fields.map((field) => ({
    value: normalizeSearchField(typeof field === "string" ? field : field.value),
    weight: typeof field === "string" ? 0 : (field.weight ?? 0),
    fuzzy: typeof field === "string" || field.fuzzy !== false,
  }));
  const tokens = query.split(" ");
  let score = 0;
  for (const token of tokens) {
    let best = Number.POSITIVE_INFINITY;
    for (const field of normalizedFields) {
      const match = scoreField(field.value, token, field.fuzzy, ignorePosition);
      if (match !== null) best = Math.min(best, field.weight + match);
    }
    if (!Number.isFinite(best)) return null;
    score += best;
  }

  // A complete phrase (especially an exact label) beats scattered token hits.
  if (tokens.length > 1) {
    for (const field of normalizedFields) {
      const match = scoreField(field.value, query, field.fuzzy, ignorePosition);
      if (match !== null) score = Math.min(score, (field.weight + match) * tokens.length);
    }
  }
  return score;
}

/** All tokens must match, possibly across fields. Lower scores are better. */
export function scoreSearchFields(
  fields: readonly SearchField[],
  query: string,
  options?: { readonly ignorePosition?: boolean },
): number | null {
  return scoreNormalizedSearchFields(fields, normalizeSearchField(query), options?.ignorePosition);
}

/** Rank labels and weighted metadata, retaining source order for empty queries and equal scores. */
export function searchItems<T>(
  items: readonly T[],
  query: string,
  fields: (item: T) => readonly SearchField[],
  limit = Number.POSITIVE_INFINITY,
): T[] {
  if (limit <= 0) return [];
  const normalizedQuery = normalizeSearchField(query);
  if (!normalizedQuery) return items.slice(0, limit);
  return items
    .flatMap((item, index) => {
      const score = scoreNormalizedSearchFields(fields(item), normalizedQuery);
      return score === null ? [] : [{ item, index, score }];
    })
    .sort((left, right) => left.score - right.score || left.index - right.index)
    .slice(0, limit)
    .map(({ item }) => item);
}
