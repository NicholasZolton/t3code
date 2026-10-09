import { describe, expect, it } from "vite-plus/test";

import { scoreSlashSkillQuery } from "./composerSlashSkillSearch";

const browserSkill = {
  name: "browser",
  path: "/skills/browser/SKILL.md",
  enabled: true,
  shortDescription: "Open and control the in-app browser",
};

describe("scoreSlashSkillQuery", () => {
  it("matches the rendered skill prefix", () => {
    expect(scoreSlashSkillQuery(browserSkill, "skill")).toBe(0);
    expect(scoreSlashSkillQuery(browserSkill, "skill:brow")).not.toBeNull();
  });
});
