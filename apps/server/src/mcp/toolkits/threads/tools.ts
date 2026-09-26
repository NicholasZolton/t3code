import {
  ApprovalRequestId,
  McpCapabilityUnavailableError,
  MessageId,
  ModelSelection,
  NonNegativeInt,
  OrchestrationLatestTurn,
  OrchestrationSessionStatus,
  PositiveInt,
  ProjectId,
  ProviderApprovalDecision,
  ProviderApprovalOption,
  ProviderRequestKind,
  ThreadId,
  TrimmedNonEmptyString,
  UserInputQuestion,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import * as Tool from "effect/unstable/ai/Tool";
import * as Toolkit from "effect/unstable/ai/Toolkit";

import * as McpInvocationContext from "../../McpInvocationContext.ts";
import * as OrchestrationEngine from "../../../orchestration/Services/OrchestrationEngine.ts";
import * as ProjectionSnapshotQuery from "../../../orchestration/Services/ProjectionSnapshotQuery.ts";
import * as ThreadDeletionReactor from "../../../orchestration/Services/ThreadDeletionReactor.ts";
import * as ServerRuntimeStartup from "../../../serverRuntimeStartup.ts";
import * as ServerSettings from "../../../serverSettings.ts";
import * as ProjectSetupScriptRunner from "../../../project/ProjectSetupScriptRunner.ts";
import * as ProjectCloneTracker from "../../../project/ProjectCloneTracker.ts";
import * as WorktreeSetupTracker from "../../../project/WorktreeSetupTracker.ts";
import * as TerminalManager from "../../../terminal/Manager.ts";
import * as GitWorkflowService from "../../../git/GitWorkflowService.ts";
import * as VcsStatusBroadcaster from "../../../vcs/VcsStatusBroadcaster.ts";

const dependencies = [
  McpInvocationContext.McpInvocationContext,
  OrchestrationEngine.OrchestrationEngineService,
  ProjectionSnapshotQuery.ProjectionSnapshotQuery,
  ThreadDeletionReactor.ThreadDeletionReactor,
  ServerRuntimeStartup.ServerRuntimeStartup,
  ServerSettings.ServerSettingsService,
  ProjectSetupScriptRunner.ProjectSetupScriptRunner,
  ProjectCloneTracker.ProjectCloneTracker,
  WorktreeSetupTracker.WorktreeSetupTracker,
  TerminalManager.TerminalManager,
  GitWorkflowService.GitWorkflowService,
  VcsStatusBroadcaster.VcsStatusBroadcaster,
];

export class ThreadToolOperationError extends Schema.TaggedError<ThreadToolOperationError>()(
  "ThreadToolOperationError",
  { message: Schema.String },
) {}

const failure = Schema.Union([McpCapabilityUnavailableError, ThreadToolOperationError]);

const target = Schema.Struct({
  threadId: ThreadId.annotate({
    description: "Target thread ID, returned by threads_start or threads_list.",
  }),
});

const threadSummary = Schema.Struct({
  threadId: ThreadId,
  projectId: ProjectId,
  title: Schema.String,
  branch: Schema.NullOr(Schema.String),
  worktreePath: Schema.NullOr(Schema.String),
  sessionStatus: Schema.NullOr(OrchestrationSessionStatus),
  sessionError: Schema.NullOr(Schema.String),
  needsInput: Schema.Boolean,
  latestTurn: Schema.NullOr(OrchestrationLatestTurn),
});

const message = Schema.Struct({
  messageId: MessageId,
  role: Schema.Literals(["user", "assistant"]),
  text: Schema.String,
  createdAt: Schema.String,
  nextTextOffset: Schema.NullOr(NonNegativeInt),
});

// Native question IDs and option labels can be answer keys, including whitespace.
const requestQuestion = Schema.Struct({
  ...UserInputQuestion.fields,
  id: Schema.String,
  header: Schema.String,
  question: Schema.String,
  options: Schema.Array(
    Schema.Struct({ ...UserInputQuestion.fields.options.value.fields, label: Schema.String }),
  ),
});

const pendingApproval = Schema.Struct({
  requestId: ApprovalRequestId,
  requestKind: ProviderRequestKind,
  createdAt: Schema.String,
  detail: Schema.optional(Schema.String),
  appName: Schema.optional(Schema.String),
  options: Schema.optional(Schema.Array(ProviderApprovalOption)),
});

const pendingQuestion = Schema.Struct({
  requestId: ApprovalRequestId,
  createdAt: Schema.String,
  questions: Schema.Array(requestQuestion),
  dismissible: Schema.Boolean,
});

const list = Tool.make("threads_list", {
  description:
    "List accessible projects and threads, most recently updated first, including status and worktree paths. Access is configured in T3 Code Settings. Use offset to see older threads.",
  parameters: Schema.Struct({
    offset: Schema.optional(NonNegativeInt),
    limit: Schema.optional(PositiveInt.check(Schema.isLessThanOrEqualTo(50))),
  }),
  success: Schema.Struct({
    projects: Schema.Array(
      Schema.Struct({ projectId: ProjectId, title: Schema.String, workspaceRoot: Schema.String }),
    ),
    threads: Schema.Array(threadSummary),
    total: NonNegativeInt,
    offset: NonNegativeInt,
  }),
  failure,
  dependencies,
})
  .annotate(Tool.Title, "List project threads")
  .annotate(Tool.Readonly, true)
  .annotate(Tool.OpenWorld, false);

const start = Tool.make("threads_start", {
  description:
    "Start another T3 Code thread with a prompt in an accessible project. Defaults to this thread's project. A separate Git worktree is used by default; uncommitted files in this thread are not copied. Pass worktree=false to use the shared project checkout (including non-Git projects). Returns a messageId for threads_wait. The new thread appears in every T3 Code client.",
  parameters: Schema.Struct({
    prompt: TrimmedNonEmptyString,
    projectId: Schema.optional(ProjectId).annotate({
      description: "Project to create the thread in. Defaults to the calling thread's project.",
    }),
    title: Schema.optional(TrimmedNonEmptyString),
    worktree: Schema.optional(Schema.Boolean),
    baseBranch: Schema.optional(TrimmedNonEmptyString),
    modelSelection: Schema.optional(ModelSelection),
  }),
  success: Schema.Struct({ threadId: ThreadId, messageId: MessageId }),
  failure,
  dependencies,
})
  .annotate(Tool.Title, "Start thread")
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.OpenWorld, false);

const send = Tool.make("threads_send", {
  description:
    "Send a follow-up to an accessible thread. Returns the messageId to use with threads_wait. Inspect a thread's status before sending while it is busy or awaiting input.",
  parameters: Schema.Struct({ ...target.fields, prompt: TrimmedNonEmptyString }),
  success: Schema.Struct({ threadId: ThreadId, messageId: MessageId }),
  failure,
  dependencies,
})
  .annotate(Tool.Title, "Send to thread")
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.OpenWorld, false);

const interrupt = Tool.make("threads_interrupt", {
  description:
    "Stop the running turn on an accessible thread, like Stop generation in T3 Code. Does not send a replacement prompt. Returns when the interrupt command is submitted; use threads_read to observe the result.",
  parameters: target,
  success: Schema.Struct({ threadId: ThreadId, submitted: Schema.Boolean }),
  failure,
  dependencies,
})
  .annotate(Tool.Title, "Interrupt thread")
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, true)
  .annotate(Tool.OpenWorld, false);

const read = Tool.make("threads_read", {
  description:
    "Read an accessible thread's status, messages, pending approvals and questions. Use nextMessageId as beforeMessageId to page older messages. Message text is bounded; pass its messageId and nextTextOffset to read the next segment in expandedMessage. Use request IDs with threads_approve or threads_answer.",
  parameters: Schema.Struct({
    ...target.fields,
    beforeMessageId: Schema.optional(MessageId),
    messageId: Schema.optional(MessageId),
    textOffset: Schema.optional(NonNegativeInt),
  }),
  success: Schema.Struct({
    ...threadSummary.fields,
    messages: Schema.Array(message),
    nextMessageId: Schema.NullOr(MessageId),
    expandedMessage: Schema.NullOr(message),
    approvals: Schema.Array(pendingApproval),
    questions: Schema.Array(pendingQuestion),
  }),
  failure,
  dependencies,
})
  .annotate(Tool.Title, "Read thread")
  .annotate(Tool.Readonly, true)
  .annotate(Tool.OpenWorld, false);

const wait = Tool.make("threads_wait", {
  description:
    "Wait for the turn requested by threads_start or threads_send to finish or require input. Subscribes to thread events; a timeout returns state=timeout without stopping the agent. Use threads_read for pending requests or the result.",
  parameters: Schema.Struct({
    ...target.fields,
    messageId: MessageId,
    timeoutMs: Schema.optional(PositiveInt.check(Schema.isLessThanOrEqualTo(120_000))),
  }),
  success: Schema.Struct({
    threadId: ThreadId,
    messageId: MessageId,
    state: Schema.Literals(["completed", "interrupted", "error", "needs-input", "timeout"]),
    turnId: Schema.NullOr(Schema.String),
  }),
  failure,
  dependencies,
})
  .annotate(Tool.Title, "Wait for thread")
  .annotate(Tool.Readonly, true)
  .annotate(Tool.OpenWorld, false);

const approve = Tool.make("threads_approve", {
  description:
    "Respond to a pending permission approval on an accessible thread. Use threads_read to inspect the request and its offered decisions first. Submits the decision; provider resolution may follow asynchronously.",
  parameters: Schema.Struct({
    ...target.fields,
    requestId: ApprovalRequestId,
    decision: ProviderApprovalDecision,
  }),
  success: Schema.Struct({
    threadId: ThreadId,
    requestId: ApprovalRequestId,
    submitted: Schema.Boolean,
  }),
  failure,
  dependencies,
})
  .annotate(Tool.Title, "Respond to thread approval")
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.OpenWorld, false);

const answer = Tool.make("threads_answer", {
  description:
    "Answer a pending question on an accessible thread. Use threads_read for the question IDs and options. Supply every question ID with a nonempty answer: a string for a single answer or an array of strings for multi-select. Submits the answer; provider resolution may follow asynchronously.",
  parameters: Schema.Struct({
    ...target.fields,
    requestId: ApprovalRequestId,
    answers: Schema.Record(
      Schema.String,
      Schema.Union([Schema.String, Schema.Array(Schema.String)]),
    ),
  }),
  success: Schema.Struct({
    threadId: ThreadId,
    requestId: ApprovalRequestId,
    submitted: Schema.Boolean,
  }),
  failure,
  dependencies,
})
  .annotate(Tool.Title, "Answer thread question")
  .annotate(Tool.Readonly, false)
  .annotate(Tool.Destructive, false)
  .annotate(Tool.OpenWorld, false);

export const ThreadsToolkit = Toolkit.make(
  list,
  start,
  send,
  interrupt,
  read,
  wait,
  approve,
  answer,
);
