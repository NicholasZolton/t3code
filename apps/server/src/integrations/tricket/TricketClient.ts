import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schema from "effect/Schema";
import * as HttpClient from "effect/http/HttpClient";
import * as HttpClientRequest from "effect/http/HttpClientRequest";
import * as HttpClientResponse from "effect/http/HttpClientResponse";
import * as FetchHttpClient from "effect/http/FetchHttpClient";

import { Actor, Credential, HistoryEntry, Issue, Status } from "./schemas.ts";

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
    readonly ready: (
      connection: Connection,
      projectId: string,
    ) => Effect.Effect<ReadonlyArray<Issue>, TricketApiError>;
    readonly handoff: (
      connection: Connection,
      issueId: string,
    ) => Effect.Effect<string | null, TricketApiError>;
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

  const handoff = Effect.fn("TricketClient.handoff")(function* (
    connection: Connection,
    issueId: string,
  ) {
    let after = 0;
    let latest: string | null = null;
    let page: ReadonlyArray<HistoryEntry>;
    do {
      page = yield* request(
        connection,
        `/issues/${encodeURIComponent(issueId)}/history?after=${after}`,
        Schema.Array(HistoryEntry),
      );
      page.forEach(({ sequence, event }) => {
        after = sequence;
        if (
          (event.event_type === "issue.created" ||
            event.event_type === "issue.assignment_changed") &&
          event.data.assignee_id === "t3"
        )
          latest = event.event_id;
      });
    } while (page.length === 200);
    return latest;
  });

  return TricketClient.of({
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
    handoff,
  });
});

export const layer = Layer.effect(TricketClient, make);
