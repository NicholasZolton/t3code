export type RankedSearchResult<T> = {
  item: T;
  score: number;
  tieBreaker: string;
};

export const SEARCH_FAVORITE_SCORE_BOOST = 24;
export const SEARCH_SECONDARY_FIELD_WEIGHT = 1_000;

export type SearchField =
  | string
  | {
      readonly value: string;
      /** Added to the match cost; lower-weight fields lead the results. */
      readonly weight?: number;
      /** Disable subsequence matching for prose or opaque identifiers. */
      readonly fuzzy?: boolean;
    };

function normalizeSearchField(value: string): string {
  return normalizeSearchQuery(value.normalize("NFKD").replace(/\p{M}/gu, "")).replace(/\s+/gu, " ");
}

function scoreField(value: string, query: string, fuzzy: boolean): number | null {
  return scoreQueryMatch({
    value,
    query,
    exactBase: 0,
    prefixBase: 1,
    boundaryBase: 2,
    includesBase: 100,
    ...(fuzzy ? { fuzzyBase: 500 } : {}),
    boundaryMarkers: [" ", "-", "_", "/", "\\", ".", ":"],
  });
}

function scoreNormalizedSearchFields(fields: readonly SearchField[], query: string): number | null {
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
      const match = scoreField(field.value, token, field.fuzzy);
      if (match !== null) best = Math.min(best, field.weight + match);
    }
    if (!Number.isFinite(best)) return null;
    score += best;
  }

  // A complete phrase (especially an exact label) beats scattered token hits.
  if (tokens.length > 1) {
    for (const field of normalizedFields) {
      const match = scoreField(field.value, query, field.fuzzy);
      if (match !== null) score = Math.min(score, (field.weight + match) * tokens.length);
    }
  }
  return score;
}

/** All tokens must match, possibly across fields. Lower scores are better. */
export function scoreSearchFields(fields: readonly SearchField[], query: string): number | null {
  return scoreNormalizedSearchFields(fields, normalizeSearchField(query));
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

export function normalizeSearchQuery(
  input: string,
  options?: {
    trimLeadingPattern?: RegExp;
  },
): string {
  const trimmed = input.trim();
  if (!trimmed) {
    return "";
  }
  return options?.trimLeadingPattern
    ? trimmed.replace(options.trimLeadingPattern, "").toLowerCase()
    : trimmed.toLowerCase();
}

export function scoreSubsequenceMatch(value: string, query: string): number | null {
  if (!query) return 0;

  let queryIndex = 0;
  let firstMatchIndex = -1;
  let previousMatchIndex = -1;
  let gapPenalty = 0;

  for (let valueIndex = 0; valueIndex < value.length; valueIndex += 1) {
    if (value[valueIndex] !== query[queryIndex]) {
      continue;
    }

    if (firstMatchIndex === -1) {
      firstMatchIndex = valueIndex;
    }
    if (previousMatchIndex !== -1) {
      gapPenalty += valueIndex - previousMatchIndex - 1;
    }

    previousMatchIndex = valueIndex;
    queryIndex += 1;
    if (queryIndex === query.length) {
      const spanPenalty = valueIndex - firstMatchIndex + 1 - query.length;
      const lengthPenalty = Math.min(64, value.length - query.length);
      return firstMatchIndex * 2 + gapPenalty * 3 + spanPenalty + lengthPenalty;
    }
  }

  return null;
}

function lengthPenalty(value: string, query: string): number {
  return Math.min(64, Math.max(0, value.length - query.length));
}

function findBoundaryMatchIndex(
  value: string,
  query: string,
  boundaryMarkers: readonly string[],
): number | null {
  let bestIndex: number | null = null;

  for (const marker of boundaryMarkers) {
    const index = value.indexOf(`${marker}${query}`);
    if (index === -1) {
      continue;
    }

    const matchIndex = index + marker.length;
    if (bestIndex === null || matchIndex < bestIndex) {
      bestIndex = matchIndex;
    }
  }

  return bestIndex;
}

/**
 * Scores how well `value` matches `query` using tiered match strategies.
 *
 * **Expects pre-normalized inputs**: both `value` and `query` must already be
 * trimmed and lowercased (e.g. via {@link normalizeSearchQuery}).
 */
export function scoreQueryMatch(input: {
  value: string;
  query: string;
  exactBase: number;
  prefixBase?: number;
  boundaryBase?: number;
  includesBase?: number;
  fuzzyBase?: number;
  boundaryMarkers?: readonly string[];
}): number | null {
  const { value, query } = input;

  if (!value || !query) {
    return null;
  }

  if (value === query) {
    return input.exactBase;
  }

  if (input.prefixBase !== undefined && value.startsWith(query)) {
    return input.prefixBase + lengthPenalty(value, query);
  }

  if (input.boundaryBase !== undefined) {
    const boundaryIndex = findBoundaryMatchIndex(
      value,
      query,
      input.boundaryMarkers ?? [" ", "-", "_", "/"],
    );
    if (boundaryIndex !== null) {
      return input.boundaryBase + boundaryIndex * 2 + lengthPenalty(value, query);
    }
  }

  if (input.includesBase !== undefined) {
    const includesIndex = value.indexOf(query);
    if (includesIndex !== -1) {
      return input.includesBase + includesIndex * 2 + lengthPenalty(value, query);
    }
  }

  if (input.fuzzyBase !== undefined) {
    const fuzzyScore = scoreSubsequenceMatch(value, query);
    if (fuzzyScore !== null) {
      return input.fuzzyBase + fuzzyScore;
    }
  }

  return null;
}

function compareRankedSearchResults<T>(
  left: RankedSearchResult<T>,
  right: RankedSearchResult<T>,
): number {
  const scoreDelta = left.score - right.score;
  if (scoreDelta !== 0) return scoreDelta;
  return left.tieBreaker.localeCompare(right.tieBreaker);
}

function findInsertionIndex<T>(
  rankedEntries: RankedSearchResult<T>[],
  candidate: RankedSearchResult<T>,
): number {
  let low = 0;
  let high = rankedEntries.length;

  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    const current = rankedEntries[middle];
    if (!current) {
      break;
    }

    if (compareRankedSearchResults(candidate, current) < 0) {
      high = middle;
    } else {
      low = middle + 1;
    }
  }

  return low;
}

export function insertRankedSearchResult<T>(
  rankedEntries: RankedSearchResult<T>[],
  candidate: RankedSearchResult<T>,
  limit: number,
): void {
  if (limit <= 0) {
    return;
  }

  const insertionIndex = findInsertionIndex(rankedEntries, candidate);
  if (rankedEntries.length < limit) {
    rankedEntries.splice(insertionIndex, 0, candidate);
    return;
  }

  if (insertionIndex >= limit) {
    return;
  }

  rankedEntries.splice(insertionIndex, 0, candidate);
  rankedEntries.pop();
}
