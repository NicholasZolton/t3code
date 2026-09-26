import * as Schema from "effect/Schema";

import { ServerProviderUsageLimits } from "./providerUsageLimits.ts";

export const OpenCodeCodexAccount = Schema.Struct({
  id: Schema.String,
  label: Schema.String,
  active: Schema.Boolean,
  plan: Schema.optional(Schema.String),
  limits: ServerProviderUsageLimits,
});
export type OpenCodeCodexAccount = typeof OpenCodeCodexAccount.Type;
