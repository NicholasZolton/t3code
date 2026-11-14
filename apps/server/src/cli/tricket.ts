import {
  AuthOrchestrationOperateScope,
  ORCHESTRATION_PROTOCOL_QUERY_PARAM,
  ORCHESTRATION_PROTOCOL_VERSION_TEXT,
  ThreadId,
  TricketCommand,
  TricketError,
  TricketRpcGroup,
} from "@t3tools/contracts";
import * as Config from "effect/Config";
import * as Console from "effect/Console";
import * as Effect from "effect/Effect";
import * as Duration from "effect/Duration";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Redacted from "effect/Redacted";
import * as References from "effect/References";
import * as Schema from "effect/Schema";
import * as Stdio from "effect/Stdio";
import * as Stream from "effect/Stream";
import * as SecureRandom from "effect/crypto/SecureRandom";
import { Argument, Command, Flag, GlobalFlag } from "effect/cli";
import * as CliError from "effect/cli/CliError";
import * as RpcClient from "effect/rpc/RpcClient";
import * as RpcSerialization from "effect/rpc/RpcSerialization";
import * as Socket from "effect/socket/Socket";

import * as EnvironmentAuth from "../auth/EnvironmentAuth.ts";
import * as ServerConfig from "../config.ts";
import { readLiveServerRuntimeState } from "../serverRuntimeState.ts";
import { baseDirFlag, resolveCliAuthConfig } from "./config.ts";

const location = {
  baseDir: baseDirFlag,
  thread: Flag.String("thread").pipe(
    Flag.withDescription(
      "Existing local T3 thread ID. Defaults to T3CODE_THREAD_ID; never inferred from a shared directory.",
    ),
    Flag.optional,
  ),
};
type Location = { readonly baseDir: Option.Option<string>; readonly thread: Option.Option<string> };
const resource = Argument.Literals("resource", ["issue", "project"]);
const id = Argument.String("id").pipe(
  Argument.withDescription("Display identifier (P-1, TRI-2) or UUID."),
);
const commandId = Flag.String("command-id").pipe(
  Flag.withDescription("Reuse this key when retrying the same write. Defaults to a fresh UUID."),
  Flag.optional,
);
const text = Flag.String("body").pipe(Flag.withDescription("Comment body. Use - to read stdin."));
const json = Schema.encodeSync(Schema.fromJsonString(Schema.Json));
const decodeThreadId = Schema.decodeEffect(ThreadId);
const decodePatch = Schema.decodeEffect(Schema.fromJsonString(Schema.JsonObject));
const isTricketError = Schema.is(TricketError);
const isUserError = Schema.is(CliError.UserError);

const readText = Effect.fn("cli.tricket.readText")((value: string) =>
  value === "-"
    ? Stdio.Stdio.pipe(
        Effect.flatMap((stdio) => stdio.stdin.pipe(Stream.decodeText(), Stream.mkString)),
      )
    : Effect.succeed(value),
);
const writeId = Effect.fn("cli.tricket.writeId")((value: Option.Option<string>) =>
  Option.isSome(value)
    ? Effect.succeed(value.value)
    : SecureRandom.SecureRandom.pipe(Effect.flatMap((random) => random.uuidV4())),
);

// Like the thread CLI, this is an owner-local client; its short-lived T3 session never leaves this process.
const execute = Effect.fn("cli.tricket.execute")(
  function* (flags: Location, command: TricketCommand) {
    const thread =
      Option.getOrUndefined(flags.thread) ??
      Option.getOrUndefined(yield* Config.String("T3CODE_THREAD_ID").pipe(Config.option));
    if (!thread?.trim())
      return yield* new CliError.UserError({
        cause:
          "Pass --thread with this existing T3 thread's ID, or set T3CODE_THREAD_ID. No thread will be created for you.",
      });
    const threadId = yield* decodeThreadId(thread);
    const config = yield* resolveCliAuthConfig(flags, yield* GlobalFlag.LogLevel, {
      quietLogs: true,
    });
    return yield* Effect.gen(function* () {
      const runtime = yield* readLiveServerRuntimeState(config.serverRuntimeStatePath);
      if (Option.isNone(runtime))
        return yield* new CliError.UserError({
          cause: "Start the configured local T3 server before using Tricket.",
        });
      const auth = yield* EnvironmentAuth.EnvironmentAuth;
      const session = yield* Effect.acquireRelease(
        auth.issueSession({
          scopes: [AuthOrchestrationOperateScope],
          label: "t3 tricket cli",
          ttl: Duration.minutes(5),
        }),
        (issued) => auth.revokeSession(issued.sessionId).pipe(Effect.ignore),
      );
      const ticket = yield* auth.issueWebSocketTicket(session);
      const url = new URL("/ws", runtime.value.origin);
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      url.searchParams.set("wsTicket", Redacted.value(ticket.ticket));
      url.searchParams.set(ORCHESTRATION_PROTOCOL_QUERY_PARAM, ORCHESTRATION_PROTOCOL_VERSION_TEXT);
      const protocol = RpcClient.layerProtocolSocket({ retryTransientErrors: false }).pipe(
        Layer.provide(
          Socket.layerWebSocket(url.href).pipe(
            Layer.provide(Socket.layerWebSocketConstructorGlobal),
          ),
        ),
        Layer.provide(RpcSerialization.layerJson),
      );
      const result = yield* Effect.gen(function* () {
        const client = yield* RpcClient.make(TricketRpcGroup);
        return yield* client["tricket.execute"]({ threadId, command });
      }).pipe(Effect.provide(protocol));
      yield* Console.log(json(result));
    }).pipe(
      Effect.scoped,
      Effect.provide(
        EnvironmentAuth.layerRuntime.pipe(
          Layer.provide(ServerConfig.layer(config)),
          Layer.provide(Layer.succeed(References.MinimumLogLevel, "Error")),
        ),
      ),
    );
  },
  Effect.mapError((error) =>
    isUserError(error)
      ? error
      : new CliError.UserError({
          cause: isTricketError(error)
            ? error.message
            : "Could not execute the Tricket command against the local T3 server.",
        }),
  ),
);

const join = Command.make("join", location).pipe(
  Command.withDescription(
    "Register this existing thread as a Tricket agent; print public identity only. Does not claim or launch work.",
  ),
  Command.withHandler((flags) => execute(flags, { action: "join" })),
);
const list = Command.make("list", { ...location, resource }).pipe(
  Command.withDescription("List projects or issues. Results are JSON; this does not claim work."),
  Command.withHandler((flags) => execute(flags, { action: "list", resource: flags.resource })),
);
const show = Command.make("show", { ...location, resource, id }).pipe(
  Command.withDescription("Read a project brief or ticket."),
  Command.withHandler((flags) =>
    execute(flags, { action: "show", resource: flags.resource, id: flags.id }),
  ),
);
const ownership = (["lead", "claim", "review"] as const).map((action) =>
  Command.make(action, { ...location, id, commandId }).pipe(
    Command.withDescription(
      action === "lead"
        ? "Take a project lead in this thread. Execute its brief if instructed; otherwise wait for the user."
        : action === "claim"
          ? "Take an available ticket in this thread, without launching a replacement."
          : "Explicitly request review for an owned ticket; does not complete it.",
    ),
    Command.withHandler((flags) =>
      Effect.gen(function* () {
        yield* execute(flags, { action, id: flags.id, commandId: yield* writeId(flags.commandId) });
      }),
    ),
  ),
);
const create = Command.make("create-issue", {
  ...location,
  commandId,
  project: Flag.String("project"),
  title: Flag.String("title"),
  description: Flag.String("description").pipe(
    Flag.withDescription("Ticket description; - reads stdin."),
    Flag.withDefault(""),
  ),
  assignee: Flag.Literals("assignee", ["t3", "self", "none"]).pipe(Flag.withDefault("none")),
}).pipe(
  Command.withDescription(
    "Create a ticket in the configured project. Assign t3 to request a new worker, self to retain this thread, or none.",
  ),
  Command.withHandler((flags) =>
    Effect.gen(function* () {
      yield* execute(flags, {
        action: "create_issue",
        project: flags.project,
        title: flags.title,
        description: yield* readText(flags.description),
        assignee: flags.assignee === "none" ? null : flags.assignee,
        commandId: yield* writeId(flags.commandId),
      });
    }),
  ),
);
const update = Command.make("update", {
  ...location,
  resource,
  id,
  commandId,
  revision: Flag.Int("revision"),
  data: Flag.String("data").pipe(
    Flag.withDescription(
      "JSON patch object; - reads stdin. Requires the revision returned by show.",
    ),
  ),
}).pipe(
  Command.withDescription("Update an owned project or ticket with optimistic concurrency."),
  Command.withHandler((flags) =>
    Effect.gen(function* () {
      const patch = yield* decodePatch(yield* readText(flags.data));
      yield* execute(flags, {
        action: "update",
        resource: flags.resource,
        id: flags.id,
        revision: flags.revision,
        patch,
        commandId: yield* writeId(flags.commandId),
      });
    }),
  ),
);
const comment = Command.make("comment", { ...location, resource, id, commandId, body: text }).pipe(
  Command.withDescription(
    "Comment on a project or ticket as this thread's agent, including someone else's assignment.",
  ),
  Command.withHandler((flags) =>
    Effect.gen(function* () {
      yield* execute(flags, {
        action: "comment",
        resource: flags.resource,
        id: flags.id,
        body: yield* readText(flags.body),
        commandId: yield* writeId(flags.commandId),
      });
    }),
  ),
);

export const tricketCommand = Command.make("tricket").pipe(
  Command.withDescription(
    "Use this environment's Tricket connection from an existing local thread, without API tokens or additional MCP tools. Run a subcommand with --help for flags. Outside T3's thread-aware shells, pass --thread explicitly. Lead assignment alone is not an instruction to invent work.",
  ),
  Command.withSubcommands([join, list, show, ...ownership, create, update, comment]),
);
