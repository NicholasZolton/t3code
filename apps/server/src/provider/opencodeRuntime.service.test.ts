import * as NodeAssert from "node:assert/strict";

import * as NodeServices from "@effect/platform-node/NodeServices";
import * as OpenCodeService from "@opencode/client/service";
import { vi } from "vite-plus/test";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { it } from "@effect/vitest";

import { OpenCodeRuntime, OpenCodeRuntimeLive } from "./opencodeRuntime.ts";

const endpoint = {
  url: "http://127.0.0.1:4301",
  auth: { type: "basic" as const, username: "opencode", password: "test-password" },
};

vi.mock("@opencode/client/service", () => ({
  ensure: vi.fn(),
  discover: vi.fn(),
}));

it.layer(OpenCodeRuntimeLive.pipe(Layer.provideMerge(NodeServices.layer)))(
  "reuses the authenticated OpenCode service instead of spawning a private server",
  (it) => {
    it.effect("uses the service registration for local inventory requests", () =>
      Effect.gen(function* () {
        const ensure = vi.mocked(OpenCodeService.ensure);
        const discover = vi.mocked(OpenCodeService.discover);
        ensure.mockResolvedValue(endpoint);
        discover.mockResolvedValue(endpoint);
        const requests: Request[] = [];
        vi.stubGlobal("fetch", async (input: string | Request | URL, init?: RequestInit) => {
          const request = new Request(input, init);
          requests.push(request);
          const route = new URL(request.url).pathname;
          return Response.json(
            route === "/api/info"
              ? { version: "2.0.14" }
              : { data: [{ id: "openai", activation: "enabled" }] },
          );
        });
        try {
          const runtime = yield* OpenCodeRuntime;
          const server = yield* runtime.startOpenCodeServerProcess({
            binaryPath: process.execPath,
            directory: process.cwd(),
            environment: process.env,
          });
          const inventory = yield* runtime.loadOpenCodeInventory(
            runtime.createOpenCodeSdkClient({
              baseUrl: server.url,
              ...(server.serverPassword ? { serverPassword: server.serverPassword } : {}),
            }),
            process.cwd(),
          );

          NodeAssert.equal(server.version, "2.0.14");
          NodeAssert.equal(yield* server.isRunning, true);
          NodeAssert.deepEqual(
            inventory.providers.map((provider) => provider.id),
            ["openai"],
          );
          NodeAssert.equal(ensure.mock.calls.length, 1);
          NodeAssert.ok(
            requests.every(
              (request) =>
                request.headers.get("authorization") ===
                `Basic ${Buffer.from("opencode:test-password").toString("base64")}`,
            ),
          );
        } finally {
          vi.unstubAllGlobals();
        }
      }).pipe(Effect.scoped),
    );
  },
);
