import { describe, expect, it } from "vite-plus/test";
import { DEFAULT_SERVER_SETTINGS } from "@t3tools/contracts";
import { resolveSavedPromptEnvironment } from "./savedPromptEnvironment.ts";

describe("saved prompt host environment", () => {
  it("resolves only referenced names on the selected host, including missing values", () => {
    const settings = {
      ...DEFAULT_SERVER_SETTINGS,
      savedPrompts: { pr: "{{env.HOST}} {{env.HOST}} {{env.MISSING}} {{clipboard}}" },
    };
    expect(
      resolveSavedPromptEnvironment(settings, "pr", { HOST: "build-host", SECRET: "hidden" }),
    ).toEqual({
      HOST: "build-host",
      MISSING: null,
    });
    expect(resolveSavedPromptEnvironment(settings, "unknown", { SECRET: "hidden" })).toEqual({});
  });
});
