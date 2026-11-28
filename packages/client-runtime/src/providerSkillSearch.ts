import type { ServerProviderSkill } from "@t3tools/contracts";
import { formatProviderSkillDisplayName } from "@t3tools/shared/inlineSkills";
import { normalizeSearchQuery } from "@t3tools/shared/searchRanking";
import {
  scoreSearchFields,
  searchItems,
  SEARCH_SECONDARY_FIELD_WEIGHT,
  type SearchField,
} from "@t3tools/shared/weightedSearch";
import { getProviderSkillsForSlashMenu } from "./providerSkills.ts";

function providerSkillSearchFields(skill: ServerProviderSkill): readonly SearchField[] {
  return [
    skill.name,
    formatProviderSkillDisplayName(skill),
    { value: skill.shortDescription ?? "", weight: SEARCH_SECONDARY_FIELD_WEIGHT, fuzzy: false },
    { value: skill.description ?? "", weight: SEARCH_SECONDARY_FIELD_WEIGHT * 2, fuzzy: false },
    { value: skill.scope ?? "", weight: SEARCH_SECONDARY_FIELD_WEIGHT * 3, fuzzy: false },
  ];
}

export function scoreProviderSkill(skill: ServerProviderSkill, query: string): number | null {
  return scoreSearchFields(providerSkillSearchFields(skill), query);
}

export function searchProviderSkills(
  skills: ReadonlyArray<ServerProviderSkill>,
  query: string,
  limit = Number.POSITIVE_INFINITY,
): ServerProviderSkill[] {
  const visibleSkills = getProviderSkillsForSlashMenu(skills, true);
  const normalizedQuery = normalizeSearchQuery(query, { trimLeadingPattern: /^\p{Sc}+/u });
  return searchItems(visibleSkills, normalizedQuery, providerSkillSearchFields, limit);
}
