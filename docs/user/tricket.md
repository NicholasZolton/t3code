# Tricket assignments

Connect Tricket to an always-on T3 Code environment to run assigned tickets without
keeping your laptop or browser open. Tricket owns ticket assignment and review;
T3 Code runs ordinary threads in that environment's repositories and worktrees.

## Configure the execution environment

On web or desktop, open **Settings → Tricket** and choose the environment that
should run the work. Configure its Tricket address, administrator token, webhook
signing secret, and one Tricket-project-to-repository mapping. Choose a model,
permissions, base ref, and worker count explicitly. New configurations default to
full access so native leads and workers can run unattended; select a supervised
mode if you want interactive approvals. The integration starts disabled. Existing
thread enrollment never changes that thread's permissions.

Create a Tricket webhook subscription for `issue.*`, `project.*`, and `note.*`, targeting the chosen
environment's private origin plus `/api/integrations/tricket/webhook`. Copy the
subscription's one-time `whsec_` signing secret into Settings. Allowlist the exact
receiver origin in Tricket's `TRICKET_WEBHOOK_ORIGINS`; private destinations also
require `TRICKET_WEBHOOK_ALLOW_PRIVATE=true`.

The Tricket server must be able to reach the receiver. A URL that works from your
laptop or Docker host may not work from a container. Keep ingress private rather
than exposing the backend publicly. Connecting the client through T3 Connect does
not by itself configure this webhook route.

Enable and save when ready. Enabling also discovers existing ready pool tickets in
the mapped project; it does not wait for another webhook. Credentials stay on the
selected environment. Each managed thread gets a separate, renewable Tricket agent
credential; the administrator token is never included in its prompt.

## Work and review

### Project leads

Assign the configured project's lead to the T3 pool to create a lead thread in the
same environment and repository. The lead follows the project brief when it gives
instructions; otherwise it waits for you to ask for work. A blank brief creates an
idle thread without running the model. The lead role alone does not trigger planning,
ticket creation, or delegation. Repeated deliveries and restarts reuse that handoff.

Native leads use the thread-bound `tricket` MCP tool to read projects and tickets,
create tickets for the T3 pool, update owned records, and comment. They do not need
the CLI, an explicit thread ID, enrollment, or an API token. This tool is not added
to ordinary threads or delegated children.

Assigning an enrolled agent as lead uses its existing thread instead. Project edits
and project notes reach that owner, excluding its own writes. Clearing or changing
the lead cancels a pool-created lead thread. For an enrolled existing thread, it
removes the assignment binding without stopping unrelated work in that thread.

### Tickets

Assign an eligible ticket in the mapped project to Tricket's T3 pool. T3 claims it
before starting the agent. Duplicate deliveries and server restarts reuse the same
handoff. Reassigning to the pool requests a fresh identity and thread.

Native ticket workers use the same `tricket` MCP tool; `tricket_issue` remains
available for existing ticket conversations. A finished turn does not complete the ticket. Choosing a
reviewer and completing the ticket remain explicit actions in Tricket; there is
no automatic reviewer assignment in this version. The worker limit counts active
turns, including turns finishing a review request; idle owners release their slot
without completing the ticket.

Comments and ticket edits from anyone except the owning agent continue its existing
thread. This includes changes made by other agents. Updates queue behind a busy
turn; an idle owner waits for a worker slot. Missed updates are recovered after a
restart, and repeated deliveries do not create duplicate turns. Automatic updates
preserve the thread's snooze setting.

Reassigning, archiving, deleting, or closing a ticket stops its managed thread and
delegated work. Webhooks normally trigger this promptly; periodic reconciliation
also checks ownership after missed deliveries or a restart.

Disabling and saving stops managed work but leaves ticket assignment unchanged.
To retry that work, explicitly reassign it to the T3 pool in Tricket. Disable and
save before changing the connection or repository. Changing the Tricket address
clears credentials unless you supply replacements.

Threads are visible and controllable from every client, including mobile. Configure
the integration from web or desktop; native mobile has no Tricket settings form yet.

## Use Tricket from an existing thread

Tell an agent running on the configured environment to use `t3 tricket --help`.
Ordinary threads do not receive additional MCP tools or a copy of the administrator
credential. Commands use T3's local connection, provision a separate thread-bound
Tricket identity, and return public data only. Enrollment does not claim work,
start a replacement thread, change the workspace, or increase permissions.

The CLI uses `T3CODE_THREAD_ID` when available. Otherwise pass the existing T3 thread
ID with `--thread`; it never guesses from a shared working directory. The examples
use a placeholder thread ID:

```sh
t3 tricket join --thread <thread-id>
t3 tricket show project P-1 --thread <thread-id>
t3 tricket lead P-1 --thread <thread-id>
t3 tricket create-issue --project P-1 --title "Improve navigation" --assignee t3 --thread <thread-id>
t3 tricket claim TRI-3 --thread <thread-id>
t3 tricket comment issue TRI-3 --body "Ready for review" --thread <thread-id>
t3 tricket review TRI-3 --thread <thread-id>
```

Use `list issue` or `list project` to discover records. Display identifiers and UUIDs
are accepted. `update` requires the revision from `show` and a JSON `--data` object.
Description, patch, and comment inputs accept `-` to read stdin. For retryable writes,
provide a unique `--command-id` and reuse it only for the exact same operation.

Taking ownership is explicit and refuses another owner's assignment, unavailable
work, or a resource outside the configured project. Updates require ownership;
comments may target someone else's assignment. Agents still cannot bypass Tricket's
independent-review policy. Retired identities remain revoked rather than being
silently replaced.

This version supports threads hosted by the configured environment, even when you
open them from another client. It does not route enrollment or notifications to a
thread running on a different environment. Project lead threads are visible through
their Tricket actor's thread link and in T3's thread list.
