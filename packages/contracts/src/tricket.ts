import * as Schema from "effect/Schema";
import * as Rpc from "effect/rpc/Rpc";
import * as RpcGroup from "effect/rpc/RpcGroup";
import {
  EnvironmentAuthorizationError,
  AuthSettingsWriteScope,
  AuthOrchestrationOperateScope,
} from "./auth.ts";
import { ProjectId, ThreadId } from "./baseSchemas.ts";
import { ModelSelection } from "./modelSelection.ts";
import { RuntimeMode } from "./providerPolicy.ts";

export const TRICKET_WEBHOOK_PATH = "/api/integrations/tricket/webhook";

export const TricketSettings = Schema.Struct({
  enabled: Schema.Boolean,
  apiUrl: Schema.String.check(Schema.isMaxLength(2048)),
  tricketProjectId: Schema.String.check(Schema.isMaxLength(128)),
  projectId: Schema.NullOr(ProjectId),
  modelSelection: Schema.NullOr(ModelSelection),
  baseRef: Schema.String.check(Schema.isMaxLength(256)),
  runtimeMode: RuntimeMode,
  maxWorkers: Schema.Number.check(Schema.isInt(), Schema.isBetween({ minimum: 1, maximum: 8 })),
});
export type TricketSettings = typeof TricketSettings.Type;

export const DEFAULT_TRICKET_SETTINGS: TricketSettings = {
  enabled: false,
  apiUrl: "",
  tricketProjectId: "",
  projectId: null,
  modelSelection: null,
  baseRef: "origin/main",
  runtimeMode: "full-access",
  maxWorkers: 2,
};

export const TricketUpdateInput = Schema.Struct({
  settings: TricketSettings,
  adminToken: Schema.optional(Schema.NullOr(Schema.String.check(Schema.isMaxLength(4096)))),
  signingSecret: Schema.optional(Schema.NullOr(Schema.String.check(Schema.isMaxLength(4096)))),
});
export type TricketUpdateInput = typeof TricketUpdateInput.Type;

const Resource = Schema.Literals(["issue", "project"]);
const Id = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(256));
const Write = { commandId: Id };
export const TricketCommand = Schema.Union([
  Schema.Struct({ action: Schema.Literal("join") }),
  Schema.Struct({ action: Schema.Literal("list"), resource: Resource }),
  Schema.Struct({ action: Schema.Literal("show"), resource: Resource, id: Id }),
  Schema.Struct({ action: Schema.Literals(["lead", "claim", "review"]), id: Id, ...Write }),
  Schema.Struct({
    action: Schema.Literal("create_issue"),
    project: Id,
    title: Schema.String.check(Schema.isMinLength(1)),
    description: Schema.String,
    assignee: Schema.NullOr(Schema.Literals(["t3", "self"])),
    ...Write,
  }),
  Schema.Struct({
    action: Schema.Literal("update"),
    resource: Resource,
    id: Id,
    revision: Schema.Int,
    patch: Schema.JsonObject,
    ...Write,
  }),
  Schema.Struct({
    action: Schema.Literal("comment"),
    resource: Resource,
    id: Id,
    body: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(20_000)),
    ...Write,
  }),
]);
export type TricketCommand = typeof TricketCommand.Type;

export class TricketError extends Schema.TaggedError<TricketError>()("TricketError", {
  reason: Schema.Literals([
    "configuration",
    "storage",
    "connection",
    "conflict",
    "unmanaged_thread",
    "assignment_conflict",
    "identity_retired",
  ]),
  cause: Schema.optional(Schema.Defect()),
}) {
  override get message(): string {
    switch (this.reason) {
      case "configuration":
        return "Configure a Tricket origin, project, local repository, model, base ref, and credentials before enabling.";
      case "storage":
        return "Tricket state could not be saved or read.";
      case "connection":
        return "Tricket could not be reached or refused the request. Check the address and credentials.";
      case "conflict":
        return "Disable Tricket and stop its managed work before changing its connection or repository.";
      case "unmanaged_thread":
        return "This thread does not own an active Tricket assignment.";
      case "assignment_conflict":
        return "This assignment is unavailable, belongs to someone else, or is outside the configured Tricket project.";
      case "identity_retired":
        return "This thread's Tricket identity was retired. Use another thread; a retired identity will not be replaced automatically.";
    }
  }
}

export const TricketHandoffStatus = Schema.Literals(["reserved", "running", "review", "stopped"]);
export type TricketHandoffStatus = typeof TricketHandoffStatus.Type;

export const TricketState = Schema.Struct({
  settings: TricketSettings,
  hasAdminToken: Schema.Boolean,
  hasSigningSecret: Schema.Boolean,
  pendingDeliveries: Schema.Number,
  lastError: Schema.NullOr(Schema.String),
  handoffs: Schema.Array(
    Schema.Struct({
      issueId: Schema.String,
      identifier: Schema.String,
      threadId: ThreadId,
      status: TricketHandoffStatus,
    }),
  ),
});
export type TricketState = typeof TricketState.Type;

export const TRICKET_RPC_METHODS = {
  get: "tricket.get",
  update: "tricket.update",
  reconcile: "tricket.reconcile",
  execute: "tricket.execute",
} as const;

export const TRICKET_RPC_SCOPES = {
  [TRICKET_RPC_METHODS.get]: AuthSettingsWriteScope,
  [TRICKET_RPC_METHODS.update]: AuthSettingsWriteScope,
  [TRICKET_RPC_METHODS.reconcile]: AuthSettingsWriteScope,
  [TRICKET_RPC_METHODS.execute]: AuthOrchestrationOperateScope,
} as const;

const error = Schema.Union([TricketError, EnvironmentAuthorizationError]);
export const TricketRpcGroup = RpcGroup.make(
  Rpc.make(TRICKET_RPC_METHODS.get, { payload: Schema.Struct({}), success: TricketState, error }),
  Rpc.make(TRICKET_RPC_METHODS.update, {
    payload: TricketUpdateInput,
    success: TricketState,
    error,
  }),
  Rpc.make(TRICKET_RPC_METHODS.reconcile, {
    payload: Schema.Struct({}),
    success: TricketState,
    error,
  }),
  Rpc.make(TRICKET_RPC_METHODS.execute, {
    payload: Schema.Struct({ threadId: ThreadId, command: TricketCommand }),
    success: Schema.Json,
    error,
  }),
);
