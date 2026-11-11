import * as NodeAssert from "node:assert/strict";

import { it } from "@effect/vitest";
import { AbsolutePath } from "@opencode/schema/schema";
import * as Effect from "effect/Effect";
import * as TestClock from "effect/testing/TestClock";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientResponse from "effect/http/HttpClientResponse";

import * as OpenCode2Client from "./v2/OpenCode2Client.ts";
import { readOpenCodeCodexAccount } from "./codexUsageLimits.ts";

const DIRECTORY = AbsolutePath.make("/work");
const ACCOUNT_ID = "workspace-selected";
const TOKEN = `header.${Buffer.from(
  JSON.stringify({ "https://api.openai.com/profile": { email: "person@example.com" } }),
).toString("base64url")}.signature`;
const CREDENTIAL = {
  id: "selected",
  integrationID: "openai",
  label: "Personal",
  active: true,
  value: {
    type: "oauth",
    methodID: "chatgpt-browser",
    access: TOKEN,
    refresh: "refresh-secret",
    expires: 4_000_000_000_000,
    metadata: { accountID: ACCOUNT_ID },
  },
};
const WEEKLY = { used_percent: 11, limit_window_seconds: 604_800, reset_at: 1_794_807_679 };
const INTEGRATION = {
  location: { directory: DIRECTORY },
  data: {
    id: "openai",
    name: "OpenAI",
    methods: [],
    connections: [{ type: "credential", id: "selected", label: "Personal", method: "oauth" }],
  },
};

type AccountRead = ReturnType<typeof readOpenCodeCodexAccount>;

function readAccount(
  http: HttpClient.HttpClient,
): Effect.Effect<Effect.Success<AccountRead>, Effect.Error<AccountRead>> {
  return Effect.gen(function* () {
    const api = yield* OpenCode2Client.make;
    const { client } = yield* api.connect({
      baseUrl: "http://opencode.test",
      password: "password",
    });
    return yield* readOpenCodeCodexAccount(client, DIRECTORY);
  }).pipe(Effect.provideService(HttpClient.HttpClient, http));
}

it.effect("reads only OpenCode's selected Codex login and preserves a weekly primary window", () =>
  Effect.gen(function* () {
    const requests: string[] = [];
    const http = HttpClient.make((request) => {
      requests.push(`${request.method} ${new URL(request.url).pathname}`);
      const isUsage = request.url === "https://chatgpt.com/backend-api/wham/usage";
      NodeAssert.equal(
        request.headers.authorization,
        isUsage
          ? `Bearer ${TOKEN}`
          : `Basic ${Buffer.from("opencode:password").toString("base64")}`,
      );
      if (isUsage) NodeAssert.equal(request.headers["chatgpt-account-id"], ACCOUNT_ID);
      const data = isUsage
        ? { plan_type: "pro", rate_limit: { primary_window: WEEKLY, secondary_window: null } }
        : request.url.includes("/integration/")
          ? INTEGRATION
          : {
              data: [
                {
                  ...CREDENTIAL,
                  id: "unused",
                  active: false,
                  value: { ...CREDENTIAL.value, access: "unused-secret" },
                },
                CREDENTIAL,
              ],
            };
      return Effect.succeed(HttpClientResponse.fromWeb(request, Response.json(data)));
    });
    const account = yield* readAccount(http);
    NodeAssert.equal(account?.email, "person@example.com");
    NodeAssert.equal(account?.workspaceId, ACCOUNT_ID);
    NodeAssert.equal(account?.driver, "codex");
    NodeAssert.deepEqual(account?.usageLimits.windows, [
      {
        id: "primary",
        kind: "weekly",
        label: "Weekly",
        usedPercent: 11,
        windowDurationMins: 10_080,
        resetsAt: "2026-11-16T05:41:19.000Z",
      },
    ]);
    NodeAssert.deepEqual(requests, [
      "GET /api/integration/openai",
      "GET /api/credential",
      "GET /backend-api/wham/usage",
    ]);
    NodeAssert.ok(!JSON.stringify(account).includes(TOKEN));
    NodeAssert.ok(!JSON.stringify(account).includes("refresh-secret"));
  }),
);

it.effect(
  "does not read a different saved login when OpenCode uses an environment key or API key",
  () =>
    Effect.gen(function* () {
      for (const connection of [
        undefined,
        { type: "env", name: "OPENAI_API_KEY" },
        { type: "credential", id: "api-key", label: "API key", method: "key" },
      ]) {
        const http = HttpClient.make((request) => {
          NodeAssert.ok(request.url.includes("/api/integration/openai"));
          return Effect.succeed(
            HttpClientResponse.fromWeb(
              request,
              Response.json({
                location: { directory: DIRECTORY },
                data: {
                  id: "openai",
                  name: "OpenAI",
                  methods: [],
                  connections: connection ? [connection] : [],
                },
              }),
            ),
          );
        });
        NodeAssert.equal(yield* readAccount(http), undefined);
      }
    }),
);

it.effect(
  "keeps expired and rejected Codex logins visible without exposing upstream errors or refreshing tokens",
  () =>
    Effect.gen(function* () {
      yield* TestClock.setTime(1_000);
      for (const scenario of ["expired", "rejected", "malformed"] as const) {
        let usageReads = 0;
        const http = HttpClient.make((request) => {
          NodeAssert.equal(request.method, "GET");
          if (request.url.includes("/integration/")) {
            return Effect.succeed(HttpClientResponse.fromWeb(request, Response.json(INTEGRATION)));
          }
          if (request.url.endsWith("/api/credential")) {
            return Effect.succeed(
              HttpClientResponse.fromWeb(
                request,
                Response.json({
                  data: [
                    {
                      ...CREDENTIAL,
                      value: {
                        ...CREDENTIAL.value,
                        expires: scenario === "expired" ? 1 : CREDENTIAL.value.expires,
                      },
                    },
                  ],
                }),
              ),
            );
          }
          usageReads += 1;
          return Effect.succeed(
            HttpClientResponse.fromWeb(
              request,
              Response.json(
                { error: "upstream-secret" },
                { status: scenario === "rejected" ? 401 : 200 },
              ),
            ),
          );
        });
        const account = yield* readAccount(http);
        NodeAssert.equal(account?.usageLimits.unavailable?.reason, "probeFailed");
        NodeAssert.deepEqual(account?.usageLimits.windows, []);
        NodeAssert.equal(usageReads, scenario === "expired" ? 0 : 1);
        NodeAssert.ok(!JSON.stringify(account).includes("secret"));
      }
    }),
);
