import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientRequest from "effect/http/HttpClientRequest";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import * as FetchHttpClient from "effect/http/FetchHttpClient";

import {
  Actor,
  Credential,
  HistoryEntry,
  Issue,
  Project,
  Status,
  Uuid,
  type Resource,
} from "./schemas.ts";

const isUuid = Schema.is(Uuid);

export class TricketApiError extends Schema.TaggedError<TricketApiError>()("TricketApiError", {
  status: Schema.Number,
  cause: Schema.optional(Schema.Defect()),
}) {
  override get message(): string {
    return `Tricket request failed (HTTP ${this.status}).`;
  }
}

export interface Connection {
  readonly apiUrl: string;
  readonly token: string;
}

export class TricketClient extends Context.Service<
  TricketClient,
  {
    readonly issue: (connection: Connection, id: string) => Effect.Effect<Issue, TricketApiError>;
    readonly project: (
      connection: Connection,
      id: string,
    ) => Effect.Effect<Project, TricketApiError>;
    readonly list: (
      connection: Connection,
      resource: Resource,
      filter?: Schema.JsonObject,
    ) => Effect.Effect<ReadonlyArray<Issue | Project>, TricketApiError>;
    readonly resolve: (
      connection: Connection,
      resource: Resource,
      id: string,
    ) => Effect.Effect<Issue | Project, TricketApiError>;
    readonly assignment: (
      connection: Connection,
      resource: Resource,
      id: string,
      actorId: string,
    ) => Effect.Effect<HistoryEntry | null, TricketApiError>;
    readonly updateResource: (
      connection: Connection,
      resource: Resource,
      id: string,
      revision: number,
      patch: Schema.JsonObject,
      commandId: string,
    ) => Effect.Effect<Issue | Project, TricketApiError>;
    readonly createIssue: (
      connection: Connection,
      body: Schema.JsonObject,
      commandId: string,
    ) => Effect.Effect<Issue, TricketApiError>;
    readonly note: (
      connection: Connection,
      resource: Resource,
      id: string,
      body: string,
      commandId: string,
    ) => Effect.Effect<Schema.JsonObject, TricketApiError>;
    readonly ready: (
      connection: Connection,
      projectId: string,
    ) => Effect.Effect<ReadonlyArray<Issue>, TricketApiError>;
    readonly handoff: (
      connection: Connection,
      issueId: string,
    ) => Effect.Effect<string | null, TricketApiError>;
    readonly activity: (
      connection: Connection,
      after: number | string,
    ) => Effect.Effect<ReadonlyArray<HistoryEntry>, TricketApiError>;
    readonly actors: (
      connection: Connection,
    ) => Effect.Effect<ReadonlyArray<Actor>, TricketApiError>;
    readonly issueCredential: (
      connection: Connection,
      input: { readonly threadRef: string; readonly threadUrl: string },
    ) => Effect.Effect<Credential, TricketApiError>;
    readonly renewCredential: (
      connection: Connection,
      actorId: string,
    ) => Effect.Effect<Credential, TricketApiError>;
    readonly patch: (
      connection: Connection,
      issue: Issue,
      patch: { readonly assignee_id?: string; readonly status_id?: string },
      commandId: string,
    ) => Effect.Effect<Issue, TricketApiError>;
    readonly comment: (
      connection: Connection,
      issueId: string,
      body: string,
      commandId: string,
    ) => Effect.Effect<void, TricketApiError>;
    readonly statuses: (
      connection: Connection,
    ) => Effect.Effect<ReadonlyArray<Status>, TricketApiError>;
  }
>()("t3/integrations/tricket/TricketClient") {}

const make = Effect.gen(function* () {
  const http = yield* HttpClient.HttpClient;
  const request = Effect.fn("TricketClient.request")(
    function* <A>(
      connection: Connection,
      path: string,
      schema: Schema.Decoder<A>,
      options?: {
        readonly body?: object;
        readonly method?: "POST" | "PATCH";
        readonly headers?: Readonly<Record<string, string>>;
      },
    ): Effect.fn.Return<A, TricketApiError> {
      let outgoing = HttpClientRequest.make(options?.method ?? "GET")(
        `${connection.apiUrl}/v1${path}`,
      ).pipe(
        HttpClientRequest.setHeaders({
          authorization: `Bearer ${connection.token}`,
          ...options?.headers,
        }),
      );
      if (options?.body !== undefined)
        outgoing = yield* HttpClientRequest.bodyJson(outgoing, options.body).pipe(
          Effect.mapError((cause) => new TricketApiError({ status: 0, cause })),
        );
      const response = yield* http.execute(outgoing).pipe(
        Effect.provideService(FetchHttpClient.RequestInit, { redirect: "manual" }),
        Effect.mapError((cause) => new TricketApiError({ status: 0, cause })),
      );
      if (response.status < 200 || response.status >= 300) {
        return yield* new TricketApiError({ status: response.status });
      }
      return yield* HttpClientResponse.schemaBodyJson(schema)(response).pipe(
        Effect.mapError((cause) => new TricketApiError({ status: response.status, cause })),
      );
    },
    Effect.timeout("10 seconds"),
    Effect.catchTags({
      TimeoutError: (cause) => Effect.fail(new TricketApiError({ status: 0, cause })),
    }),
  );

  const ready = Effect.fn("TricketClient.ready")(function* (
    connection: Connection,
    projectId: string,
  ) {
    const items: Array<Issue> = [];
    let cursor: string | null = null;
    do {
      const page: { readonly items: ReadonlyArray<Issue>; readonly next_cursor: string | null } =
        yield* request(
          connection,
          "/issues/query",
          Schema.Struct({ items: Schema.Array(Issue), next_cursor: Schema.NullOr(Schema.String) }),
          {
            method: "POST",
            body: {
              filter: {
                all: [
                  { field: "assignee_id", op: "eq", value: "t3" },
                  { field: "project_id", op: "eq", value: projectId },
                  { field: "blocked", op: "eq", value: false },
                  { field: "status_category", op: "not_in", value: ["completed", "canceled"] },
                ],
              },
              limit: 200,
              ...(cursor === null ? {} : { cursor }),
            },
          },
        );
      items.push(...page.items);
      cursor = page.next_cursor;
    } while (cursor !== null);
    return items;
  });

  const assignment = Effect.fn("TricketClient.assignment")(function* (
    connection: Connection,
    resource: Resource,
    id: string,
    actorId: string,
  ): Effect.fn.Return<HistoryEntry | null, TricketApiError> {
    let after = 0;
    let latest: HistoryEntry | null = null;
    let page: ReadonlyArray<HistoryEntry>;
    do {
      page = yield* request(
        connection,
        `/${resource}s/${encodeURIComponent(id)}/history?after=${after}`,
        Schema.Array(HistoryEntry),
      );
      after = page.at(-1)?.sequence ?? after;
      latest =
        page.findLast(
          ({ event }) =>
            (event.event_type === `${resource}.created` ||
              event.event_type === "issue.assignment_changed" ||
              (resource === "project" && event.changes?.lead_id !== undefined)) &&
            event.data[resource === "issue" ? "assignee_id" : "lead_id"] === actorId,
        ) ?? latest;
    } while (page.length === 200);
    return latest;
  });

  const list = Effect.fn("TricketClient.list")(function* (
    connection: Connection,
    resource: Resource,
    filter?: Schema.JsonObject,
  ) {
    const result: Array<Issue | Project> = [];
    let cursor: string | null = null;
    do {
      const page: {
        readonly items: ReadonlyArray<Issue | Project>;
        readonly next_cursor: string | null;
      } = yield* request(
        connection,
        `/${resource}s/query`,
        Schema.Struct({
          items: Schema.Array(Schema.Union([Issue, Project])),
          next_cursor: Schema.NullOr(Schema.String),
        }),
        {
          method: "POST",
          body: {
            ...(filter === undefined ? {} : { filter }),
            limit: 200,
            ...(cursor === null ? {} : { cursor }),
          },
        },
      );
      result.push(...page.items);
      cursor = page.next_cursor;
    } while (cursor !== null);
    return result;
  });

  return TricketClient.of({
    list,
    assignment,
    resolve: Effect.fn("TricketClient.resolve")(function* (connection, resource, id) {
      if (isUuid(id))
        return yield* request(
          connection,
          `/${resource}s/${encodeURIComponent(id)}`,
          Schema.Union([Issue, Project]),
        );
      const records = yield* list(connection, resource, {
        field: "identifier",
        op: "eq",
        value: id,
      });
      const record = records.find((candidate) => candidate.identifier === id);
      if (record === undefined) return yield* new TricketApiError({ status: 404 });
      return record;
    }),
    project: Effect.fn("TricketClient.project")((connection, id) =>
      request(connection, `/projects/${encodeURIComponent(id)}`, Project),
    ),
    updateResource: Effect.fn("TricketClient.updateResource")(
      (connection, resource, id, revision, patch, commandId) =>
        request(
          connection,
          `/${resource}s/${encodeURIComponent(id)}`,
          Schema.Union([Issue, Project]),
          {
            method: "PATCH",
            body: patch,
            headers: { "if-match": `"${revision}"`, "idempotency-key": commandId },
          },
        ),
    ),
    createIssue: Effect.fn("TricketClient.createIssue")((connection, body, commandId) =>
      request(connection, "/issues", Issue, {
        method: "POST",
        body,
        headers: { "idempotency-key": commandId },
      }),
    ),
    note: Effect.fn("TricketClient.note")((connection, resource, id, body, commandId) =>
      request(connection, "/notes", Schema.JsonObject, {
        method: "POST",
        body: { [`${resource}_id`]: id, kind: "comment", body },
        headers: { "idempotency-key": commandId },
      }),
    ),
    activity: Effect.fn("TricketClient.activity")(function* (connection, after) {
      const entries: Array<HistoryEntry> = [];
      let before: number | undefined;
      do {
        const page = yield* request(
          connection,
          `/activity${before === undefined ? "" : `?before=${before}`}`,
          Schema.Array(HistoryEntry),
        );
        const boundary = page.findIndex((entry) =>
          typeof after === "number" ? entry.sequence <= after : entry.event.event_id === after,
        );
        entries.push(...(boundary < 0 ? page : page.slice(0, boundary)));
        if (boundary >= 0 || (page.length < 200 && typeof after === "number"))
          return entries.reverse();
        if (page.length < 200) return yield* new TricketApiError({ status: 0 });
        before = page.at(-1)?.sequence;
      } while (before !== undefined);
      return entries.reverse();
    }),
    issue: Effect.fn("TricketClient.issue")((connection, id) =>
      request(connection, `/issues/${encodeURIComponent(id)}`, Issue),
    ),
    actors: Effect.fn("TricketClient.actors")((connection) =>
      request(connection, "/actors", Schema.Array(Actor)),
    ),
    issueCredential: Effect.fn("TricketClient.issueCredential")((connection, input) =>
      request(connection, "/actors", Credential, {
        method: "POST",
        body: { thread_ref: input.threadRef, thread_url: input.threadUrl },
      }),
    ),
    renewCredential: Effect.fn("TricketClient.renewCredential")((connection, actorId) =>
      request(connection, `/actors/${encodeURIComponent(actorId)}/credential`, Credential, {
        method: "POST",
        body: {},
      }),
    ),
    patch: Effect.fn("TricketClient.patch")((connection, issue, patch, commandId) =>
      request(connection, `/issues/${encodeURIComponent(issue.id)}`, Issue, {
        method: "PATCH",
        body: patch,
        headers: { "if-match": `"${issue.revision}"`, "idempotency-key": commandId },
      }),
    ),
    comment: Effect.fn("TricketClient.comment")((connection, issueId, body, commandId) =>
      request(connection, "/notes", Schema.Struct({ id: Schema.String }), {
        method: "POST",
        body: { issue_id: issueId, kind: "comment", body },
        headers: { "idempotency-key": commandId },
      }).pipe(Effect.asVoid),
    ),
    statuses: Effect.fn("TricketClient.statuses")((connection) =>
      request(connection, "/statuses", Schema.Array(Status)),
    ),
    ready,
    handoff: Effect.fn("TricketClient.handoff")((connection, id) =>
      assignment(connection, "issue", id, "t3").pipe(
        Effect.map((entry) => entry?.event.event_id ?? null),
      ),
    ),
  });
});

export const layer = Layer.effect(TricketClient, make);
