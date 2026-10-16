import {
  normalizeSearchQuery,
  scoreSearchFields,
  SEARCH_FAVORITE_SCORE_BOOST,
  type SearchField,
} from "@t3tools/shared/searchRanking";

type ModelPickerSearchableModel = {
  /** Driver kind — indexed so "codex" still matches a Codex Personal instance. */
  driverKind: string;
  /**
   * Instance display name (e.g. "Codex Personal"). Indexed as a search
   * field so typing the custom instance's user-authored name matches its
   * models directly instead of just the driver kind.
   */
  providerDisplayName: string;
  name: string;
  shortName?: string;
  subProvider?: string;
  isFavorite?: boolean;
};

// Far below any token-scored match, favorites included.
const MODEL_PICKER_EXACT_NAME_SCORE = -1000;

function getModelPickerSearchFields(model: ModelPickerSearchableModel): SearchField[] {
  return [
    model.name,
    model.shortName ?? "",
    { value: model.subProvider ?? "", weight: 20 },
    { value: model.driverKind, weight: 30 },
    { value: model.providerDisplayName, weight: 30 },
  ];
}

function normalizeModelName(name: string): string {
  return normalizeSearchQuery(name).replace(/\s+/gu, " ");
}

export function buildModelPickerSearchText(model: ModelPickerSearchableModel): string {
  return normalizeSearchQuery(
    [model.name, model.shortName, model.subProvider, model.driverKind, model.providerDisplayName]
      .filter((value): value is string => typeof value === "string" && value.length > 0)
      .join(" "),
  );
}

export function scoreModelPickerSearch(
  model: ModelPickerSearchableModel,
  query: string,
): number | null {
  const normalizedQuery = normalizeModelName(query);
  if (!normalizedQuery) {
    return 0;
  }

  if (
    normalizedQuery === normalizeModelName(model.name) ||
    normalizedQuery === normalizeModelName(model.shortName ?? "")
  ) {
    return MODEL_PICKER_EXACT_NAME_SCORE;
  }

  const score = scoreSearchFields(getModelPickerSearchFields(model), query, {
    ignorePosition: true,
  });
  if (score === null) return null;
  return model.isFavorite ? score - SEARCH_FAVORITE_SCORE_BOOST : score;
}

/**
 * Filters `items` to those matching `query`, best match first. Equal matches
 * keep their order in `items`, which is the provider's own newest-first order.
 */
export function rankModelPickerSearch<T>(
  items: ReadonlyArray<T>,
  query: string,
  toSearchable: (item: T) => ModelPickerSearchableModel,
): T[] {
  const ranked: Array<{
    item: T;
    score: number;
    isFavorite: boolean;
    order: number;
  }> = [];
  items.forEach((item, order) => {
    const searchable = toSearchable(item);
    const score = scoreModelPickerSearch(searchable, query);
    if (score !== null) {
      ranked.push({
        item,
        score,
        isFavorite: searchable.isFavorite === true,
        order,
      });
    }
  });
  return ranked
    .toSorted(
      (a, b) =>
        a.score - b.score || Number(b.isFavorite) - Number(a.isFavorite) || a.order - b.order,
    )
    .map((entry) => entry.item);
}
