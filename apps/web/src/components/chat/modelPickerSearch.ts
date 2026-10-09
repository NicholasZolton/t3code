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

function getModelPickerSearchFields(model: ModelPickerSearchableModel): SearchField[] {
  return [
    model.name,
    model.shortName ?? "",
    { value: model.subProvider ?? "", weight: 20 },
    { value: model.driverKind, weight: 30 },
    { value: model.providerDisplayName, weight: 30 },
  ];
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
  if (!query.trim()) return 0;
  const score = scoreSearchFields(getModelPickerSearchFields(model), query);
  if (score === null) return null;
  return model.isFavorite ? score - SEARCH_FAVORITE_SCORE_BOOST : score;
}
