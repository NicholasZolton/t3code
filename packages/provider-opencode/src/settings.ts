/**
 * OpenCode instance settings. Shared by the server driver and the client
 * settings form, so it holds only browser-safe schema code.
 *
 * @module provider-opencode/settings
 */
import {
  CustomModelSetting,
  makeBinaryPathSetting,
  makeProviderSettingsSchema,
  TrimmedString,
  type ProviderSettingsFormOption,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";

const OPENCODE_PERMISSION_MODES = [
  { value: "t3", label: "T3 Code modes" },
  { value: "provider", label: "Provider settings" },
] as const satisfies ReadonlyArray<ProviderSettingsFormOption>;
const OpenCodePermissionMode = Schema.Literals(OPENCODE_PERMISSION_MODES.map((mode) => mode.value));

export const OpenCodeSettings = makeProviderSettingsSchema(
  {
    // Off by default (like Cursor and Grok): the binding is not yet stable
    // enough to probe on every install. Users opt in from Settings.
    enabled: Schema.Boolean.pipe(
      Schema.withDecodingDefault(Effect.succeed(false)),
      Schema.annotateKey({ providerSettingsForm: { hidden: true } }),
    ),
    binaryPath: makeBinaryPathSetting("opencode").pipe(
      Schema.annotateKey({
        title: "Binary path",
        description: "Path to the OpenCode binary.",
        providerSettingsForm: {
          placeholder: "opencode",
          clearWhenEmpty: "omit",
        },
      }),
    ),
    serverUrl: TrimmedString.pipe(
      Schema.withDecodingDefault(Effect.succeed("")),
      Schema.annotateKey({
        title: "Server URL",
        description: "Leave blank to let T3 Code spawn the server when needed.",
        providerSettingsForm: {
          placeholder: "http://127.0.0.1:4096",
          clearWhenEmpty: "omit",
        },
      }),
    ),
    serverPassword: TrimmedString.pipe(
      Schema.withDecodingDefault(Effect.succeed("")),
      Schema.annotateKey({
        title: "Server password",
        description: "Stored in plain text on disk.",
        providerSettingsForm: {
          control: "password",
          placeholder: "Optional",
          clearWhenEmpty: "omit",
        },
      }),
    ),
    permissionMode: OpenCodePermissionMode.pipe(
      Schema.withDecodingDefault(Effect.succeed("t3" as const)),
      Schema.annotateKey({
        title: "Permissions",
        description:
          "Use thread permission modes, or preserve your opencode.json(c) rules instead. Applies when sessions reconnect.",
        providerSettingsForm: {
          control: "select",
          options: OPENCODE_PERMISSION_MODES,
          clearWhenEmpty: "omit",
        },
      }),
    ),
    customModels: Schema.Array(CustomModelSetting).pipe(
      Schema.withDecodingDefault(Effect.succeed([])),
      Schema.annotateKey({ providerSettingsForm: { hidden: true } }),
    ),
  },
  {
    order: ["binaryPath", "serverUrl", "serverPassword", "permissionMode"],
  },
);
export type OpenCodeSettings = typeof OpenCodeSettings.Type;
