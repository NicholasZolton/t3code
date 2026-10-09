import type { ServerProviderSkill } from "@t3tools/contracts";
import { scoreProviderSkill } from "@t3tools/client-runtime/providerSkills";

export function scoreSlashSkillQuery(skill: ServerProviderSkill, query: string): number | null {
  if (!skill.enabled || skill.userInvocable === false) return null;
  const normalizedQuery = query.toLowerCase();
  const skillQuery =
    normalizedQuery === "skill"
      ? ""
      : normalizedQuery.startsWith("skill:")
        ? normalizedQuery.slice("skill:".length)
        : normalizedQuery;
  return scoreProviderSkill(skill, skillQuery);
}
