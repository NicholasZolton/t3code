// @effect-diagnostics nodeBuiltinImport:off
import * as NodeAssert from "node:assert/strict";
import * as NodeFS from "node:fs";
import * as NodeHttp from "node:http";
import * as NodeOS from "node:os";
import * as NodePath from "node:path";
import * as NodeSqlite from "node:sqlite";

import * as Effect from "effect/Effect";
import * as OpenCode2Client from "./opencode2/OpenCode2Client.ts";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import { it } from "@effect/vitest";
import { afterEach } from "vite-plus/test";

import { activateOpenCodeCredential, readOpenCodeCodexAccounts } from "./openCodeCodexAccounts.ts";

const homes: string[] = [];
afterEach(() => {
  for (const home of homes.splice(0)) NodeFS.rmSync(home, { recursive: true, force: true });
});

function fixture(): string {
  const home = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3-opencode-accounts-"));
  homes.push(home);
  const dir = NodePath.join(home, "opencode");
  NodeFS.mkdirSync(dir);
  const db = new NodeSqlite.DatabaseSync(NodePath.join(dir, "opencode.db"));
  try {
    db.exec(
      "CREATE TABLE credential (id TEXT, integration_id TEXT, label TEXT, active INTEGER, value TEXT, time_created INTEGER)",
    );
    const insert = db.prepare("INSERT INTO credential VALUES (?, ?, ?, ?, ?, ?)");
    insert.run(
      "work/id",
      "openai",
      "Work",
      1,
      JSON.stringify({
        type: "oauth",
        access: "work-secret",
        refresh: "refresh-secret",
        expires: 4_000_000_000_000,
        metadata: { accountID: "work-account" },
      }),
      2,
    );
    insert.run(
      "personal",
      "openai",
      "Personal",
      0,
      JSON.stringify({
        type: "oauth",
        access: "personal-secret",
        expires: 4_000_000_000_000,
        metadata: { accountID: "personal-account" },
      }),
      1,
    );
    insert.run("key", "openai", "API key", 0, JSON.stringify({ type: "api", key: "secret" }), 0);
    insert.run(
      "other",
      "anthropic",
      "Other",
      1,
      JSON.stringify({ type: "oauth", access: "secret" }),
      0,
    );
  } finally {
    db.close();
  }
  return home;
}

it("reports every local OpenCode Codex login without exposing credentials", async () => {
  const home = fixture();
  const headers: string[] = [];
  const accounts = await readOpenCodeCodexAccounts(home, async (_url, init) => {
    const requestHeaders = new Headers(init?.headers);
    headers.push(requestHeaders.get("ChatGPT-Account-Id") ?? "");
    NodeAssert.match(requestHeaders.get("Authorization") ?? "", /^Bearer (work|personal)-secret$/);
    return Response.json({
      plan_type: "plus",
      rate_limit: {
        primary_window: { used_percent: 25, limit_window_seconds: 18_000, reset_at: 2_000_000_000 },
        secondary_window: {
          used_percent: 60,
          limit_window_seconds: 604_800,
          reset_at: 2_000_000_000,
        },
      },
    });
  });
  NodeAssert.deepEqual(headers, ["work-account", "personal-account"]);
  NodeAssert.deepEqual(
    accounts.map(({ id, active, limits }) => ({
      id,
      active,
      windows: limits.windows.map((window) => window.kind),
    })),
    [
      { id: "work/id", active: true, windows: ["session", "weekly"] },
      { id: "personal", active: false, windows: ["session", "weekly"] },
    ],
  );
  NodeAssert.ok(!JSON.stringify(accounts).includes("secret"));
});

it("keeps an expired account available to switch while reporting its usage as unavailable", async () => {
  const home = fixture();
  const db = new NodeSqlite.DatabaseSync(NodePath.join(home, "opencode", "opencode.db"));
  try {
    db.prepare("UPDATE credential SET value = ? WHERE id = 'personal'").run(
      JSON.stringify({
        type: "oauth",
        access: "expired-secret",
        expires: 1,
        metadata: { accountID: "personal-account" },
      }),
    );
  } finally {
    db.close();
  }
  const accounts = await readOpenCodeCodexAccounts(home, async () =>
    Response.json({ plan_type: "plus", rate_limit: null }),
  );
  NodeAssert.equal(accounts.length, 2);
  NodeAssert.equal(accounts[1]?.active, false);
  NodeAssert.equal(accounts[1]?.limits.unavailable?.reason, "probeFailed");
  NodeAssert.match(accounts[1]?.limits.unavailable?.message ?? "", /expired/);
});

it("ignores an OpenCode history database without V2 credentials", async () => {
  const home = NodeFS.mkdtempSync(NodePath.join(NodeOS.tmpdir(), "t3-opencode-history-"));
  homes.push(home);
  NodeFS.mkdirSync(NodePath.join(home, "opencode"));
  const db = new NodeSqlite.DatabaseSync(NodePath.join(home, "opencode", "opencode.db"));
  db.exec("CREATE TABLE message (id TEXT)");
  db.close();
  NodeAssert.deepEqual(await readOpenCodeCodexAccounts(home), []);
});

it.effect("activates only an existing OpenAI login through OpenCode's V2 client", () => {
  const home = fixture();
  const requests: string[] = [];
  const server = NodeHttp.createServer((request, response) => {
    requests.push(`${request.method} ${request.url}`);
    NodeAssert.equal(
      request.headers.authorization,
      `Basic ${Buffer.from("opencode:password").toString("base64")}`,
    );
    response.writeHead(204).end();
  });
  return Effect.acquireUseRelease(
    Effect.promise(() => new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))),
    () =>
      Effect.gen(function* () {
        const address = server.address();
        NodeAssert.ok(address && typeof address !== "string");
        const api = yield* OpenCode2Client.make;
        const { client } = yield* api.connect({
          baseUrl: `http://127.0.0.1:${address.port}`,
          password: "password",
        });
        yield* activateOpenCodeCredential({ dataHome: home, credentialId: "work/id", client });
        NodeAssert.deepEqual(requests, ["POST /api/credential/work%2Fid/activate"]);
        const rejected = yield* Effect.result(
          activateOpenCodeCredential({ dataHome: home, credentialId: "key", client }),
        );
        NodeAssert.equal(rejected._tag, "Failure");
        NodeAssert.equal(requests.length, 1);
      }),
    () =>
      Effect.promise(
        () =>
          new Promise<void>((resolve, reject) =>
            server.close((error) => (error ? reject(error) : resolve())),
          ),
      ),
  ).pipe(Effect.provide(FetchHttpClient.layer));
});
