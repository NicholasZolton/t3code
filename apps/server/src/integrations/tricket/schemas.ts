import * as Schema from "effect/Schema";

export const Uuid = Schema.String.check(Schema.isUUID());

export const Issue = Schema.Struct({
  id: Uuid,
  identifier: Schema.String,
  title: Schema.String,
  description: Schema.String,
  revision: Schema.Int,
  project_id: Schema.NullOr(Schema.String),
  assignee_id: Schema.NullOr(Schema.String),
  status_id: Schema.String,
  archived_at: Schema.NullOr(Schema.String),
  deleted_at: Schema.NullOr(Schema.String),
});
export type Issue = typeof Issue.Type;

export const Project = Schema.Struct({
  id: Uuid,
  identifier: Schema.String,
  name: Schema.String,
  summary: Schema.String,
  description: Schema.String,
  revision: Schema.Int,
  lead_id: Schema.NullOr(Schema.String),
  status_id: Schema.String,
  archived_at: Schema.NullOr(Schema.String),
  deleted_at: Schema.NullOr(Schema.String),
});
export type Project = typeof Project.Type;
export type Resource = "issue" | "project";

export const Actor = Schema.Struct({
  id: Schema.String,
  thread_ref: Schema.NullOr(Schema.String),
  retired_at: Schema.NullOr(Schema.String),
});
export type Actor = typeof Actor.Type;

export const Credential = Schema.Struct({
  actor: Actor,
  token: Schema.String,
  expires_at: Schema.NullOr(Schema.String),
});
export type Credential = typeof Credential.Type;

export const Event = Schema.Struct({
  schema_version: Schema.Literal(1),
  event_id: Uuid,
  event_type: Schema.String,
  actor: Schema.Struct({ id: Schema.String }),
  subject: Schema.Struct({ resource: Schema.String, id: Schema.String, revision: Schema.Int }),
  data: Schema.JsonObject,
  changes: Schema.optionalKey(Schema.JsonObject),
});
export type Event = typeof Event.Type;

export const HistoryEntry = Schema.Struct({ sequence: Schema.Int, event: Event });
export type HistoryEntry = typeof HistoryEntry.Type;

export const Status = Schema.Struct({
  id: Schema.String,
  resource: Schema.String,
  category: Schema.String,
});
export type Status = typeof Status.Type;
