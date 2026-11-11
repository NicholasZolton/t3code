import type { OpenCodeClient } from "@opencode/client/effect";
import { Integration } from "@opencode/schema/integration";
import { ProviderDriverKind, type UsageLimitSourceAccount } from "@t3tools/contracts";
import {
  CodexUsage,
  codexPlanLabel,
  codexUsageToLimits,
} from "@t3tools/provider-core/server/codexUsageLimits";
import { makeUnavailableUsageLimits } from "@t3tools/provider-core/server/usageLimits";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientRequest from "effect/http/HttpClientRequest";
import * as HttpClientResponse from "effect/http/HttpClientResponse";

const CODEX = ProviderDriverKind.make("codex");
const OPENAI = Integration.ID.make("openai");
const decodeAccount = Schema.decodeUnknownOption(
  Schema.Struct({ accountID: Schema.NonEmptyString }),
);
const decodeProfile = Schema.decodeUnknownOption(
  Schema.fromJsonString(
    Schema.Struct({
      "https://api.openai.com/profile": Schema.optionalKey(
        Schema.Struct({ email: Schema.optionalKey(Schema.NonEmptyString) }),
      ),
    }),
  ),
);

// This claim is only a display/deduplication hint; the usage endpoint authenticates the token.
function accountEmail(access: string): string | undefined {
  const payload = access.split(".")[1];
  if (!payload) return undefined;
  const profile = decodeProfile(Buffer.from(payload, "base64url").toString("utf8"));
  return Option.isSome(profile)
    ? profile.value["https://api.openai.com/profile"]?.email
    : undefined;
}

export const readOpenCodeCodexAccount = Effect.fn("OpenCode.readCodexUsageLimits")(function* (
  client: OpenCodeClient,
  directory: string,
) {
  const integration = yield* client.integration.get({
    integrationID: OPENAI,
    location: { directory },
  });
  const selected = integration.data.connections[0];
  if (selected?.type !== "credential" || selected.method !== "oauth") return undefined;

  const credentials = yield* client.credential.list();
  const credential = credentials.find(
    (entry) => entry.id === selected.id && entry.integrationID === OPENAI,
  );
  if (credential?.value.type !== "oauth") return undefined;
  const value = credential.value;
  if (value.methodID !== "chatgpt-browser" && value.methodID !== "chatgpt-headless")
    return undefined;

  const checked = yield* DateTime.now;
  const checkedAt = DateTime.formatIso(checked);
  const account = decodeAccount(value.metadata);
  const email = accountEmail(value.access);
  const base = {
    id: credential.id,
    driver: CODEX,
    ...(email ? { email } : {}),
    ...(Option.isSome(account) ? { workspaceId: account.value.accountID } : {}),
  };
  const unavailable = (message: string): UsageLimitSourceAccount => ({
    ...base,
    usageLimits: makeUnavailableUsageLimits({ checkedAt, reason: "probeFailed", message }),
  });
  if (Option.isNone(account))
    return unavailable("OpenCode's Codex login has no account ID. Sign in again in OpenCode.");
  if (value.expires > 0 && value.expires <= DateTime.toEpochMillis(checked)) {
    return unavailable("Codex login expired. Open OpenCode to refresh it, then refresh limits.");
  }

  return yield* Effect.gen(function* () {
    const http = yield* HttpClient.HttpClient;
    const response = yield* http.execute(
      HttpClientRequest.get("https://chatgpt.com/backend-api/wham/usage").pipe(
        HttpClientRequest.bearerToken(value.access),
        HttpClientRequest.setHeaders({
          "ChatGPT-Account-Id": account.value.accountID,
          "User-Agent": "codex-cli",
        }),
      ),
    );
    const usage = yield* HttpClientResponse.filterStatusOk(response).pipe(
      Effect.flatMap(HttpClientResponse.schemaBodyJson(CodexUsage)),
    );
    return {
      ...base,
      plan: codexPlanLabel(usage.plan_type),
      usageLimits: codexUsageToLimits({ usage, checkedAt }),
    } satisfies UsageLimitSourceAccount;
  }).pipe(
    Effect.timeout("5 seconds"),
    Effect.orElseSucceed(() =>
      unavailable(
        "Could not read the Codex subscription used by OpenCode. Refresh the login in OpenCode and try again.",
      ),
    ),
  );
});
