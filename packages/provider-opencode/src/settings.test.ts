import { describe, expect, it } from "vite-plus/test";
import * as Schema from "effect/Schema";

import { OpenCodeSettings } from "./settings.ts";

const decodeSettings = Schema.decodeUnknownSync(OpenCodeSettings);
const encodeSettings = Schema.encodeSync(OpenCodeSettings);

describe("OpenCode permissions", () => {
  it("defaults existing configurations to T3 permission modes", () => {
    expect(decodeSettings({}).permissionMode).toBe("t3");
  });

  it("round-trips provider-managed permissions and rejects unsupported modes", () => {
    expect(encodeSettings(decodeSettings({ permissionMode: "provider" }))).toMatchObject({
      permissionMode: "provider",
    });
    expect(() => decodeSettings({ permissionMode: "unsupported" })).toThrow();
  });
});
