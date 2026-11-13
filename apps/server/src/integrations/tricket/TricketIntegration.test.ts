// @effect-diagnostics-next-line nodeBuiltinImport:off -- Signs the local vendor fixture's webhook independently.
import * as NodeCrypto from "node:crypto";
import * as NodeHttpServer from "@effect/platform-node/NodeHttpServer";
import * as NodePlatformCrypto from "@effect/platform-node/NodeCrypto";
import { expect, it } from "@effect/vitest";
import {
  DEFAULT_TRICKET_SETTINGS,
  EnvironmentId,
  ProjectId,
  ProviderInstanceId,
  ThreadId,
  type OrchestrationV2ThreadProjection,
  type OrchestrationV2ThreadShell,
  type TricketSettings,
} from "@t3tools/contracts";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import * as Context from "effect/Context";
import * as Clock from "effect/Clock";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as FetchHttpClient from "effect/http/FetchHttpClient";
import { HttpRouter, HttpServer, HttpServerRequest, HttpServerResponse } from "effect/http";

import * as ServerSecretStore from "../../auth/ServerSecretStore.ts";
import * as ServerEnvironment from "../../environment/ServerEnvironment.ts";
import * as ThreadLaunchService from "../../orchestration-v2/ThreadLaunchService.ts";
import * as ThreadManagementService from "../../orchestration-v2/ThreadManagementService.ts";
import * as ManagedProjectFolders from "../../project/ManagedProjectFolders.ts";
import * as TricketClient from "./TricketClient.ts";
import * as TricketIntegration from "./TricketIntegration.ts";
import * as TricketRepository from "./TricketRepository.ts";
import { Event, type Actor, type HistoryEntry, type Issue } from "./schemas.ts";

const issueId = "d86e0000-0000-4000-8000-000000000001";
const projectId = "d86e0000-0000-4000-8000-000000000002";
const firstHandoff = "d86e0000-0000-4000-8000-000000000003";
const secondHandoff = "d86e0000-0000-4000-8000-000000000004";
const deliveryId = "d86e0000-0000-4000-8000-000000000005";
const signingKey = Buffer.alloc(32, 7);
const signingSecret = `whsec_${signingKey.toString("base64")}`;
const now = DateTime.makeUnsafe(0);
const encodeEvent = Schema.encodeEffect(Schema.fromJsonString(Event));

interface Vendor {
  issue: Issue;
  additionalIssues: Array<Issue>;
  history: Array<HistoryEntry>;
  blocked: boolean;
  claimStatus: number;
  loseIssuance: boolean;
  loseStart: boolean;
  failStart: boolean;
  issuanceCount: number;
  renewalCount: number;
  actors: Array<Actor>;
}

function projection(input: ThreadLaunchService.ThreadLaunchInput): OrchestrationV2ThreadProjection {
  const id = input.threadId ?? ThreadId.make("fixture");
  return {
    thread: {
      id,
      projectId: input.projectId,
      title: input.title,
      modelSelection: input.modelSelection,
      providerInstanceId: input.modelSelection.instanceId,
      runtimeMode: input.runtimeMode,
      interactionMode: input.interactionMode,
      createdBy: input.createdBy,
      creationSource: input.creationSource,
      branch: null,
      worktreePath: null,
      activeProviderThreadId: null,
      lineage: { parentThreadId: null, relationshipToParent: null, rootThreadId: id },
      forkedFrom: null,
      createdAt: now,
      updatedAt: now,
      archivedAt: null,
      settledOverride: null,
      settledAt: null,
      lastVisitedAt: null,
      deletedAt: null,
    },
    runs: [],
    attempts: [],
    nodes: [],
    subagents: [],
    providerSessions: [],
    providerThreads: [],
    providerTurns: [],
    runtimeRequests: [],
    messages: [],
    plans: [],
    turnItems: [],
    checkpointScopes: [],
    checkpoints: [],
    contextHandoffs: [],
    contextTransfers: [],
    visibleTurnItems: [],
    updatedAt: now,
  };
}

function shell(thread: OrchestrationV2ThreadProjection["thread"]): OrchestrationV2ThreadShell {
  return {
    ...thread,
    latestRunId: null,
    activeRunId: null,
    status: "idle",
    pendingRuntimeRequest: null,
    latestVisibleMessage: null,
    latestUserMessageAt: null,
    hasActionableProposedPlan: false,
    pendingBackgroundTasks: [],
    providerInstanceHistory: [],
    itemCount: 0,
    visibleItemCount: 0,
  };
}

function poolEvent(id: string, targetId: string = issueId): Event {
  return {
    schema_version: 1,
    event_id: id,
    event_type: "issue.assignment_changed",
    subject: { resource: "issue", id: targetId, revision: 1 },
    data: { assignee_id: "t3" },
  };
}

const RequestBody = Schema.Struct({
  thread_ref: Schema.optional(Schema.String),
  thread_url: Schema.optional(Schema.String),
  assignee_id: Schema.optional(Schema.String),
  status_id: Schema.optional(Schema.String),
  body: Schema.optional(Schema.String),
  issue_id: Schema.optional(Schema.String),
});

const withHarness = Effect.fn("test.tricket.withHarness")(function* <A, E>(
  body: (fixture: {
    readonly open: Effect.Effect<TricketIntegration.TricketIntegration["Service"], never>;
    readonly settings: TricketSettings;
    readonly vendor: Vendor;
    readonly starts: Array<ThreadLaunchService.ThreadLaunchInput>;
    readonly stops: Array<ThreadId>;
    readonly secrets: Map<string, Uint8Array>;
    readonly repository: TricketRepository.TricketRepository["Service"];
  }) => Effect.Effect<A, E>,
) {
  const vendor: Vendor = {
    additionalIssues: [],
    issue: {
      id: issueId,
      identifier: "TRI-1",
      title: "Implement feature",
      description: "Change the repository.",
      revision: 1,
      project_id: projectId,
      assignee_id: "t3",
      status_id: "issue-started",
      archived_at: null,
      deleted_at: null,
    } satisfies Issue,
    history: [{ sequence: 1, event: poolEvent(firstHandoff) }],
    blocked: false,
    claimStatus: 200,
    loseIssuance: false,
    loseStart: false,
    failStart: false,
    issuanceCount: 0,
    renewalCount: 0,
    actors: new Array<Actor>(),
  };
  const secrets = new Map<string, Uint8Array>();
  const starts: Array<ThreadLaunchService.ThreadLaunchInput> = [];
  const stops: Array<ThreadId> = [];
  const threadProjections = new Map<ThreadId, OrchestrationV2ThreadProjection>();
  const receipts = new Set<string>();
  const routes = HttpRouter.add(
    "*",
    "/v1/*",
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest;
      const url = new URL(request.url, "http://localhost");
      const admin = request.headers.authorization === "Bearer fixture-admin";
      const authenticatedActor = vendor.actors.find(
        (actor) => request.headers.authorization === `Bearer token-${actor.id}`,
      );
      const reply = HttpServerResponse.jsonUnsafe;
      if (!admin && !authenticatedActor) return reply({}, { status: 401 });
      if (url.pathname === "/v1/statuses")
        return reply([
          { id: "issue-started", resource: "issue", category: "started" },
          { id: "issue-review", resource: "issue", category: "review" },
          { id: "issue-completed", resource: "issue", category: "completed" },
        ]);
      if (url.pathname === "/v1/actors" && request.method === "GET") return reply(vendor.actors);
      if (url.pathname === "/v1/actors" && request.method === "POST") {
        expect(admin).toBe(true);
        expect(request.headers["idempotency-key"]).toBeUndefined();
        const input = yield* request.json.pipe(
          Effect.flatMap(Schema.decodeUnknownEffect(RequestBody)),
        );
        expect(input.thread_url).toMatch(/^https:\/\//);
        const actor: Actor = {
          id: `agent-${vendor.issuanceCount + 1}`,
          thread_ref: input.thread_ref ?? null,
          retired_at: null,
        };
        vendor.actors.push(actor);
        vendor.issuanceCount += 1;
        if (vendor.loseIssuance) {
          vendor.loseIssuance = false;
          return reply({}, { status: 503 });
        }
        return reply({ actor, token: `token-${actor.id}`, expires_at: null }, { status: 201 });
      }
      if (url.pathname.endsWith("/credential")) {
        expect(admin).toBe(true);
        expect(request.headers["idempotency-key"]).toBeUndefined();
        const actor = vendor.actors.find((candidate) => url.pathname.includes(`/${candidate.id}/`));
        vendor.renewalCount += 1;
        return reply({ actor, token: `token-${actor?.id}`, expires_at: null }, { status: 201 });
      }
      if (url.pathname === "/v1/issues/query")
        return reply({
          items: [vendor.issue, ...vendor.additionalIssues].filter(
            (issue) => issue.assignee_id === "t3" && !vendor.blocked,
          ),
          next_cursor: null,
        });
      if (url.pathname.endsWith("/history"))
        return reply(
          vendor.history
            .filter(
              (entry) =>
                entry.event.subject.id === url.pathname.split("/")[3] &&
                entry.sequence > Number(url.searchParams.get("after")),
            )
            .slice(0, 200),
        );
      const target = [vendor.issue, ...vendor.additionalIssues].find(
        (issue) => url.pathname === `/v1/issues/${issue.id}`,
      );
      if (target !== undefined) {
        if (request.method === "GET") return reply(target);
        expect(admin).toBe(false);
        expect(request.headers["if-match"]).toBe(`"${target.revision}"`);
        if (vendor.claimStatus !== 200) return reply({}, { status: vendor.claimStatus });
        const input = yield* request.json.pipe(
          Effect.flatMap(Schema.decodeUnknownEffect(RequestBody)),
        );
        if (input.assignee_id !== undefined) expect(input.assignee_id).toBe(authenticatedActor?.id);
        const updated: Issue = {
          ...target,
          assignee_id: input.assignee_id ?? target.assignee_id,
          status_id: input.status_id ?? target.status_id,
          revision: target.revision + 1,
        };
        if (target.id === vendor.issue.id) vendor.issue = updated;
        else
          vendor.additionalIssues = vendor.additionalIssues.map((issue) =>
            issue.id === target.id ? updated : issue,
          );
        return reply(updated);
      }
      if (url.pathname === "/v1/notes") {
        expect(admin).toBe(false);
        const input = yield* request.json.pipe(
          Effect.flatMap(Schema.decodeUnknownEffect(RequestBody)),
        );
        expect(input.issue_id).toBe(issueId);
        return reply({ id: "note-1" }, { status: 201 });
      }
      return reply({}, { status: 404 });
    }),
  );
  yield* Layer.build(HttpRouter.serve(routes, { disableLogger: true, disableListenLog: true }));
  const address = (yield* HttpServer.HttpServer).address;
  if (typeof address === "string" || !("port" in address))
    return yield* Effect.die("Expected TCP fixture");
  const settings: TricketSettings = {
    ...DEFAULT_TRICKET_SETTINGS,
    enabled: true,
    apiUrl: `http://127.0.0.1:${address.port}`,
    tricketProjectId: projectId,
    projectId: ProjectId.make("repository-on-ovh"),
    modelSelection: { instanceId: ProviderInstanceId.make("fixture"), model: "free" },
  };
  const boundaries = Layer.mergeAll(
    Layer.mock(ManagedProjectFolders.ManagedProjectFolders)({
      namedProjectsRoot: "/fixture-projects",
      isScratchProject: () => Effect.succeed(false),
    }),
    Layer.mock(ServerEnvironment.ServerEnvironment)({
      getEnvironmentId: Effect.succeed(EnvironmentId.make("fixture-environment")),
    }),
    Layer.mock(ServerSecretStore.ServerSecretStore)({
      get: (name) => Effect.sync(() => Option.fromUndefinedOr(secrets.get(name))),
      set: (name, value) =>
        Effect.sync(() => {
          secrets.set(name, value);
        }),
      remove: (name) =>
        Effect.sync(() => {
          secrets.delete(name);
        }),
    }),
    Layer.mock(ThreadLaunchService.ThreadLaunchService)({
      checkWorktreeBase: () => Effect.void,
      launch: (input) =>
        Effect.suspend(() => {
          const value = projection(input);
          threadProjections.set(value.thread.id, value);
          if (input.initialMessage !== undefined) {
            expect(vendor.issue.assignee_id).toMatch(/^agent-/);
            if (vendor.failStart)
              return Effect.fail(
                new ThreadLaunchService.ThreadLaunchError({
                  operation: "dispatch-message",
                  commandId: input.commandId,
                  projectId: input.projectId,
                  cause: "fixture",
                }),
              );
            if (!receipts.has(input.commandId)) starts.push(input);
            receipts.add(input.commandId);
            if (vendor.loseStart) {
              vendor.loseStart = false;
              return Effect.fail(
                new ThreadLaunchService.ThreadLaunchError({
                  operation: "dispatch-message",
                  commandId: input.commandId,
                  projectId: input.projectId,
                  cause: "lost response",
                }),
              );
            }
          }
          return Effect.succeed({ threadId: value.thread.id, projection: value, resumed: false });
        }),
    }),
    Layer.mock(ThreadManagementService.ThreadManagementService)({
      getThreadShell: (id) =>
        Effect.sync(() => {
          const value = threadProjections.get(id);
          return value === undefined ? null : shell(value.thread);
        }),
      dispatch: (command) =>
        Effect.sync(() => {
          if (command.type === "thread.stop") stops.push(command.threadId);
          return { sequence: 1, storedEvents: [] };
        }),
    }),
  );
  return yield* Effect.gen(function* () {
    const repository = yield* TricketRepository.TricketRepository;
    const build = Layer.build(Layer.fresh(TricketIntegration.layer)).pipe(
      Effect.map((context) => Context.get(context, TricketIntegration.TricketIntegration)),
      Effect.orDie,
    );
    const context = yield* Effect.context<Effect.Services<typeof build>>();
    const open = build.pipe(Effect.provideContext(context));
    return yield* body({ open, settings, vendor, starts, stops, secrets, repository });
  }).pipe(
    Effect.provide(
      Layer.mergeAll(
        boundaries,
        TricketClient.layer,
        TricketRepository.layer.pipe(
          Layer.provide(NodeSqliteClient.layer({ filename: ":memory:" })),
        ),
      ),
    ),
  );
});

const fixtureLayers = Layer.mergeAll(
  NodeHttpServer.layerTest,
  FetchHttpClient.layer,
  NodePlatformCrypto.layer,
);
const enable = (
  service: TricketIntegration.TricketIntegration["Service"],
  settings: TricketSettings,
) => service.update({ settings, adminToken: "fixture-admin", signingSecret });

it.live("limits ticket workers and releases a slot only after an explicit review request", () =>
  withHarness(({ open, settings, vendor, starts }) =>
    Effect.gen(function* () {
      const integration = yield* open;
      vendor.additionalIssues.push({ ...vendor.issue, id: deliveryId, identifier: "TRI-2" });
      vendor.history.push({ sequence: 2, event: poolEvent(secondHandoff, deliveryId) });
      yield* enable(integration, { ...settings, maxWorkers: 1 });
      yield* integration.reconcile;
      yield* integration.reconcile;
      expect(starts).toHaveLength(1);
      const first = starts[0]?.threadId;
      if (first === undefined) return yield* Effect.die("Expected managed thread");
      yield* integration.act(first, { action: "request_review", commandId: deliveryId });
      yield* integration.reconcile;
      expect(starts).toHaveLength(2);
      expect(starts[1]?.title).toContain("TRI-2");
    }),
  ).pipe(Effect.scoped, Effect.provide(fixtureLayers)),
);

it.live.each(["archived", "deleted", "moved", "retired", "completed"] as const)(
  "stops %s work without starting a replacement",
  (reason) =>
    withHarness(({ open, settings, vendor, starts, stops }) =>
      Effect.gen(function* () {
        const integration = yield* open;
        yield* enable(integration, settings);
        yield* integration.reconcile;
        if (reason === "archived")
          vendor.issue = { ...vendor.issue, archived_at: "2026-01-01T00:00:00Z" };
        if (reason === "deleted")
          vendor.issue = { ...vendor.issue, deleted_at: "2026-01-01T00:00:00Z" };
        if (reason === "moved") vendor.issue = { ...vendor.issue, project_id: secondHandoff };
        if (reason === "completed")
          vendor.issue = { ...vendor.issue, status_id: "issue-completed" };
        if (reason === "retired")
          vendor.actors = vendor.actors.map((actor) => ({
            ...actor,
            retired_at: "2026-01-01T00:00:00Z",
          }));
        yield* integration.reconcile;
        expect(stops).toEqual([starts[0]?.threadId]);
        expect(starts).toHaveLength(1);
      }),
    ).pipe(Effect.scoped, Effect.provide(fixtureLayers)),
);

it.live("never carries administrator credentials to a changed Tricket origin", () =>
  withHarness(({ open, settings }) =>
    Effect.gen(function* () {
      const integration = yield* open;
      yield* enable(integration, { ...settings, enabled: false });
      const changed = yield* integration.update({
        settings: { ...settings, enabled: false, apiUrl: "https://other.example.com" },
      });
      expect(changed.hasAdminToken).toBe(false);
      expect(changed.hasSigningSecret).toBe(false);
    }),
  ).pipe(Effect.scoped, Effect.provide(fixtureLayers)),
);

it.live(
  "claims with a separate agent before starting, deduplicates deliveries and restarts, and keeps credentials out of public state and prompts",
  () =>
    withHarness(({ open, settings, starts, vendor }) =>
      Effect.gen(function* () {
        const integration = yield* open;
        yield* enable(integration, settings);
        const event = { ...poolEvent(deliveryId), event_type: "issue.agent_ready" };
        const body = new TextEncoder().encode(yield* encodeEvent(event));
        const timestamp = Math.floor((yield* Clock.currentTimeMillis) / 1000).toString();
        const signature = NodeCrypto.createHmac("sha256", signingKey)
          .update(`${deliveryId}.${timestamp}.`)
          .update(body)
          .digest("base64");
        const input = {
          body,
          headers: {
            "webhook-id": deliveryId,
            "webhook-timestamp": timestamp,
            "webhook-signature": `v1,${signature}`,
          },
        };
        expect(yield* integration.receive(input)).toBe("accepted");
        expect(yield* integration.receive(input)).toBe("accepted");
        expect((yield* integration.state).pendingDeliveries).toBe(1);
        expect(starts).toHaveLength(0);
        yield* Effect.all([integration.reconcile, integration.reconcile], {
          concurrency: "unbounded",
        });
        const restarted = yield* open;
        yield* restarted.reconcile;
        expect(starts).toHaveLength(1);
        expect(starts[0]?.projectId).toBe(settings.projectId);
        expect(vendor.issuanceCount).toBe(1);
        const visible = [yield* restarted.state, ...starts];
        expect(JSON.stringify(visible)).not.toContain("fixture-admin");
        expect(JSON.stringify(visible)).not.toContain("token-agent");
        expect((yield* restarted.state).pendingDeliveries).toBe(0);
      }),
    ).pipe(Effect.scoped, Effect.provide(fixtureLayers)),
);

it.live(
  "does not launch after losing a claim and retries the same dormant handoff when the revision changes",
  () =>
    withHarness(({ open, settings, vendor, starts }) =>
      Effect.gen(function* () {
        const integration = yield* open;
        vendor.claimStatus = 412;
        yield* enable(integration, settings);
        yield* integration.reconcile;
        expect(starts).toHaveLength(0);
        vendor.claimStatus = 200;
        vendor.issue = { ...vendor.issue, revision: 2 };
        yield* integration.reconcile;
        expect(starts).toHaveLength(1);
        expect(vendor.issuanceCount).toBe(1);
      }),
    ).pipe(Effect.scoped, Effect.provide(fixtureLayers)),
);

it.live(
  "recovers an ambiguous credential issuance and an accepted launch without issuing another identity or starting twice",
  () =>
    withHarness(({ open, settings, vendor, starts }) =>
      Effect.gen(function* () {
        const integration = yield* open;
        yield* enable(integration, settings);
        vendor.loseIssuance = true;
        expect((yield* integration.reconcile.pipe(Effect.result))._tag).toBe("Failure");
        vendor.loseStart = true;
        const restarted = yield* open;
        expect((yield* restarted.reconcile.pipe(Effect.result))._tag).toBe("Failure");
        yield* restarted.reconcile;
        expect(vendor.issuanceCount).toBe(1);
        expect(vendor.renewalCount).toBe(1);
        expect(starts).toHaveLength(1);
      }),
    ).pipe(Effect.scoped, Effect.provide(fixtureLayers)),
);

it.live(
  "reloads authoritative ownership, stops reassigned work, rejects old callers, and creates a fresh thread for a new pool handoff",
  () =>
    withHarness(({ open, settings, vendor, starts, stops }) =>
      Effect.gen(function* () {
        const integration = yield* open;
        yield* enable(integration, settings);
        yield* integration.reconcile;
        const first = starts[0]?.threadId;
        if (first === undefined) return yield* Effect.die("Expected managed thread");
        vendor.issue = { ...vendor.issue, assignee_id: "human", revision: 3 };
        yield* integration.reconcile;
        expect(stops).toEqual([first]);
        expect((yield* integration.act(first, { action: "read" }).pipe(Effect.result))._tag).toBe(
          "Failure",
        );
        vendor.issue = { ...vendor.issue, assignee_id: "t3", revision: 4 };
        vendor.history.push({ sequence: 2, event: poolEvent(secondHandoff) });
        yield* integration.reconcile;
        expect(starts).toHaveLength(2);
        expect(starts[1]?.threadId).not.toBe(first);
        expect(vendor.issuanceCount).toBe(2);
      }),
    ).pipe(Effect.scoped, Effect.provide(fixtureLayers)),
);

it.live(
  "does not infer completion, requests review explicitly with the thread credential, and stops managed work when disabled",
  () =>
    withHarness(({ open, settings, vendor, starts, stops }) =>
      Effect.gen(function* () {
        const integration = yield* open;
        yield* enable(integration, settings);
        yield* integration.reconcile;
        const threadId = starts[0]?.threadId;
        if (threadId === undefined) return yield* Effect.die("Expected managed thread");
        expect(vendor.issue.status_id).toBe("issue-started");
        yield* integration.act(threadId, {
          action: "comment",
          body: "Implementation ready.",
          commandId: deliveryId,
        });
        yield* integration.act(threadId, { action: "request_review", commandId: secondHandoff });
        expect(vendor.issue.status_id).toBe("issue-review");
        const revision = vendor.issue.revision;
        yield* integration.act(threadId, { action: "request_review", commandId: secondHandoff });
        expect(vendor.issue.revision).toBe(revision);
        yield* integration.update({ settings: { ...settings, enabled: false } });
        expect(stops).toEqual([threadId]);
        expect(vendor.issue.assignee_id).toBe("agent-1");
        yield* integration.reconcile;
        expect(starts).toHaveLength(1);
      }),
    ).pipe(Effect.scoped, Effect.provide(fixtureLayers)),
);

it.live("does not act on blocked, stale, or unmapped tickets", () =>
  withHarness(({ open, settings, vendor, starts }) =>
    Effect.gen(function* () {
      const integration = yield* open;
      yield* enable(integration, settings);
      vendor.blocked = true;
      yield* integration.reconcile;
      vendor.blocked = false;
      vendor.issue = { ...vendor.issue, project_id: secondHandoff };
      yield* integration.reconcile;
      vendor.issue = { ...vendor.issue, project_id: projectId, assignee_id: "human" };
      yield* integration.reconcile;
      expect(starts).toHaveLength(0);
      expect(vendor.issuanceCount).toBe(0);
    }),
  ).pipe(Effect.scoped, Effect.provide(fixtureLayers)),
);
