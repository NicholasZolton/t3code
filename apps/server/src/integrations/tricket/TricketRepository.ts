import {
  DEFAULT_TRICKET_SETTINGS,
  ThreadId,
  TricketError,
  TricketHandoffStatus,
  TricketSettings,
} from "@t3tools/contracts";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as SqlClient from "effect/sql/SqlClient";

import * as ServerConfig from "../../config.ts";

export const Handoff = Schema.Struct({
  id: Schema.String,
  issueId: Schema.String,
  identifier: Schema.String,
  threadId: ThreadId,
  actorId: Schema.NullOr(Schema.String),
  status: TricketHandoffStatus,
  settings: TricketSettings,
});
export type Handoff = typeof Handoff.Type;

const decodeSettings = Schema.decodeEffect(Schema.fromJsonString(TricketSettings));
const encodeSettings = Schema.encodeEffect(Schema.fromJsonString(TricketSettings));
const decodeHandoff = Schema.decodeEffect(Schema.fromJsonString(Handoff));
const encodeHandoff = Schema.encodeEffect(Schema.fromJsonString(Handoff));

export class TricketRepository extends Context.Service<
  TricketRepository,
  {
    readonly settings: Effect.Effect<TricketSettings, TricketError>;
    readonly saveSettings: (settings: TricketSettings) => Effect.Effect<void, TricketError>;
    readonly accept: (
      apiUrl: string,
      eventId: string,
      issueId: string,
    ) => Effect.Effect<void, TricketError>;
    readonly pending: (
      apiUrl: string,
    ) => Effect.Effect<
      ReadonlyArray<{ readonly eventId: string; readonly issueId: string }>,
      TricketError
    >;
    readonly complete: (apiUrl: string, issueId: string) => Effect.Effect<void, TricketError>;
    readonly handoffs: Effect.Effect<ReadonlyArray<Handoff>, TricketError>;
    readonly saveHandoff: (handoff: Handoff) => Effect.Effect<void, TricketError>;
  }
>()("t3/integrations/tricket/TricketRepository") {}

const storageError = <A, E, R>(effect: Effect.Effect<A, E, R>): Effect.Effect<A, TricketError, R> =>
  effect.pipe(Effect.mapError((cause) => new TricketError({ reason: "storage", cause })));

const make = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  yield* sql`PRAGMA journal_mode = WAL`;
  yield* sql`PRAGMA synchronous = FULL`;
  // This integration owns its database; upstream's numbered migrations never touch it.
  yield* sql`CREATE TABLE IF NOT EXISTS tricket_settings (id INTEGER PRIMARY KEY CHECK (id = 1), value TEXT NOT NULL)`;
  yield* sql`CREATE TABLE IF NOT EXISTS tricket_inbox (
    api_url TEXT NOT NULL, event_id TEXT NOT NULL, issue_id TEXT NOT NULL, completed INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (api_url, event_id)
  )`;
  yield* sql`CREATE INDEX IF NOT EXISTS tricket_inbox_pending ON tricket_inbox(api_url, completed, issue_id)`;
  yield* sql`CREATE TABLE IF NOT EXISTS tricket_handoffs (id TEXT PRIMARY KEY, value TEXT NOT NULL)`;

  return TricketRepository.of({
    settings: Effect.gen(function* () {
      const rows = yield* sql<{
        readonly value: string;
      }>`SELECT value FROM tricket_settings WHERE id = 1`;
      return rows[0] === undefined
        ? DEFAULT_TRICKET_SETTINGS
        : yield* decodeSettings(rows[0].value);
    }).pipe(storageError),
    saveSettings: Effect.fn("TricketRepository.saveSettings")(function* (
      settings: TricketSettings,
    ) {
      const value = yield* encodeSettings(settings);
      yield* sql`INSERT INTO tricket_settings (id, value) VALUES (1, ${value}) ON CONFLICT(id) DO UPDATE SET value = excluded.value`;
    }, storageError),
    accept: Effect.fn("TricketRepository.accept")(
      (apiUrl: string, eventId: string, issueId: string) =>
        sql`INSERT INTO tricket_inbox (api_url, event_id, issue_id) VALUES (${apiUrl}, ${eventId}, ${issueId}) ON CONFLICT DO NOTHING`.pipe(
          Effect.asVoid,
          storageError,
        ),
    ),
    pending: Effect.fn("TricketRepository.pending")((apiUrl: string) =>
      sql<{
        readonly eventId: string;
        readonly issueId: string;
      }>`SELECT event_id AS eventId, issue_id AS issueId FROM tricket_inbox WHERE api_url = ${apiUrl} AND completed = 0 LIMIT 1000`.pipe(
        storageError,
      ),
    ),
    complete: Effect.fn("TricketRepository.complete")((apiUrl: string, issueId: string) =>
      sql`UPDATE tricket_inbox SET completed = 1 WHERE api_url = ${apiUrl} AND issue_id = ${issueId}`.pipe(
        Effect.asVoid,
        storageError,
      ),
    ),
    handoffs: sql<{
      readonly value: string;
    }>`SELECT value FROM tricket_handoffs ORDER BY rowid DESC`.pipe(
      Effect.flatMap((rows) => Effect.forEach(rows, (row) => decodeHandoff(row.value))),
      storageError,
    ),
    saveHandoff: Effect.fn("TricketRepository.saveHandoff")(function* (handoff: Handoff) {
      const value = yield* encodeHandoff(handoff);
      yield* sql`INSERT INTO tricket_handoffs (id, value) VALUES (${handoff.id}, ${value}) ON CONFLICT(id) DO UPDATE SET value = excluded.value`;
    }, storageError),
  });
});

// Supplying a SQL client here keeps fixture databases separate from the application's database.
export const layer = Layer.effect(TricketRepository, make);

export const layerConfig = Layer.unwrap(
  Effect.gen(function* () {
    const config = yield* ServerConfig.ServerConfig;
    const path = yield* Path.Path;
    const fs = yield* FileSystem.FileSystem;
    const directory = path.join(config.stateDir, "integrations");
    yield* fs.makeDirectory(directory, { recursive: true, mode: 0o700 });
    return layer.pipe(
      Layer.provide(
        NodeSqliteClient.layer({
          filename: path.join(directory, "tricket.sqlite"),
          writerWorker: true,
        }),
      ),
    );
  }),
);
