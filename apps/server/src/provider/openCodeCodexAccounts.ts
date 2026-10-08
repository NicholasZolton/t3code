// OpenCode owns the credential database and token refresh. This reader never writes it.
// @effect-diagnostics nodeBuiltinImport:off
// @effect-diagnostics globalDate:off
import * as NodeFS from "node:fs";
import * as NodePath from "node:path";
import * as NodeSqlite from "node:sqlite";

import type { OpenCodeCodexAccount, ServerProviderUsageWindow } from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import * as Effect from "effect/Effect";

import type { OpenCodeClient } from "@opencode/client/effect";
import { Credential as NativeCredential } from "@opencode/schema/credential";

const Credential = Schema.Struct({
  type: Schema.Literal("oauth"),
  access: Schema.NonEmptyString,
  expires: Schema.Number,
  metadata: Schema.Struct({ accountID: Schema.NonEmptyString }),
});
const Window = Schema.Struct({
  used_percent: Schema.Number,
  limit_window_seconds: Schema.Number,
  reset_at: Schema.Number,
});
const Usage = Schema.Struct({
  plan_type: Schema.String,
  rate_limit: Schema.optionalKey(
    Schema.NullOr(
      Schema.Struct({
        primary_window: Schema.optionalKey(Schema.NullOr(Window)),
        secondary_window: Schema.optionalKey(Schema.NullOr(Window)),
      }),
    ),
  ),
});
const decodeCredential = Schema.decodeUnknownOption(Schema.fromJsonString(Credential));
const decodeUsage = Schema.decodeUnknownSync(Usage);

interface OpenCodeCredential {
  readonly id: string;
  readonly label: string;
  readonly active: boolean;
  readonly access: string;
  readonly accountId: string;
  readonly expires: number;
}

class OpenCodeAccountError extends Schema.TaggedError<OpenCodeAccountError>()(
  "OpenCodeAccountError",
  {
    detail: Schema.String,
  },
) {}

/** Only the local OpenCode V2 store is readable; an external server owns its own logins. */
export function readOpenCodeCredentials(dataHome: string): readonly OpenCodeCredential[] {
  const file = NodePath.join(dataHome, "opencode", "opencode.db");
  if (!NodeFS.existsSync(file)) return [];
  const db = new NodeSqlite.DatabaseSync(file, { readOnly: true });
  try {
    db.exec("PRAGMA busy_timeout = 100");
    if (
      !db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'credential'").get()
    )
      return [];
    const rows = db
      .prepare(
        "SELECT id, label, value FROM credential WHERE integration_id = 'openai' ORDER BY active DESC, time_created DESC, id DESC",
      )
      .all();
    return rows.flatMap((row) => {
      if (
        typeof row.id !== "string" ||
        typeof row.label !== "string" ||
        typeof row.value !== "string"
      )
        return [];
      const parsed = decodeCredential(row.value);
      if (parsed._tag === "None") return [];
      return [
        {
          id: row.id,
          label: row.label,
          active: row.id === rows[0]?.id,
          access: parsed.value.access,
          accountId: parsed.value.metadata.accountID,
          expires: parsed.value.expires,
        },
      ];
    });
  } finally {
    db.close();
  }
}

function usageWindow(
  value: typeof Window.Type | null,
  id: string,
): ServerProviderUsageWindow | null {
  if (
    !value ||
    !Number.isFinite(value.used_percent) ||
    !Number.isFinite(value.reset_at) ||
    value.limit_window_seconds <= 0
  )
    return null;
  const minutes = Math.ceil(value.limit_window_seconds / 60);
  const kind =
    minutes <= 5 * 60 + 1 ? "session" : minutes <= 7 * 24 * 60 + 1 ? "weekly" : "monthly";
  return {
    id,
    label: `Codex · ${kind === "session" ? "Session" : kind === "weekly" ? "Weekly" : "Monthly"}`,
    kind,
    windowDurationMins: minutes,
    usedPercent: Math.max(0, Math.min(100, value.used_percent)),
    resetsAt: new Date(value.reset_at * 1000).toISOString(),
  };
}

/** Fetch per-account subscription quotas without forwarding OAuth tokens to clients. */
export async function readOpenCodeCodexAccounts(
  dataHome: string,
  fetcher: typeof fetch = fetch,
): Promise<readonly OpenCodeCodexAccount[]> {
  const credentials = readOpenCodeCredentials(dataHome);
  return Promise.all(
    credentials.map(async (credential): Promise<OpenCodeCodexAccount> => {
      const checkedAt = new Date().toISOString();
      const base = { id: credential.id, label: credential.label, active: credential.active };
      const unavailable = (message: string): OpenCodeCodexAccount => ({
        ...base,
        limits: { checkedAt, windows: [], unavailable: { reason: "probeFailed", message } },
      });
      if (credential.expires <= Date.now())
        return unavailable("OpenCode login expired. Open OpenCode to refresh it.");
      try {
        const response = await fetcher("https://chatgpt.com/backend-api/wham/usage", {
          headers: {
            Authorization: `Bearer ${credential.access}`,
            "ChatGPT-Account-Id": credential.accountId,
            "User-Agent": "codex-cli",
            "OpenAI-Beta": "codex-1",
            originator: "Codex Desktop",
          },
          signal: AbortSignal.timeout(10_000),
        });
        if (!response.ok)
          return unavailable("Could not read Codex usage for this OpenCode account.");
        const usage = decodeUsage(await response.json());
        const windows = [
          usageWindow(usage.rate_limit?.primary_window ?? null, "primary"),
          usageWindow(usage.rate_limit?.secondary_window ?? null, "secondary"),
        ].filter((window): window is ServerProviderUsageWindow => window !== null);
        return { ...base, plan: usage.plan_type, limits: { checkedAt, windows } };
      } catch {
        return unavailable("Could not read Codex usage for this OpenCode account.");
      }
    }),
  );
}

/** Let OpenCode switch its own credential so it also publishes its switch event. */
export const activateOpenCodeCredential = Effect.fn("activateOpenCodeCredential")(
  function* (input: {
    readonly dataHome: string;
    readonly credentialId: string;
    readonly client: OpenCodeClient;
  }) {
    const accounts = yield* Effect.try(() => readOpenCodeCredentials(input.dataHome));
    if (!accounts.some((account) => account.id === input.credentialId)) {
      return yield* new OpenCodeAccountError({ detail: "OpenCode account not found." });
    }
    yield* input.client.credential.activate({
      credentialID: NativeCredential.ID.make(input.credentialId),
    });
  },
);
