# Tricket assignments

Connect Tricket to an always-on T3 Code environment to run assigned tickets without
keeping your laptop or browser open. Tricket owns ticket assignment and review;
T3 Code runs ordinary threads in that environment's repositories and worktrees.

## Configure the execution environment

On web or desktop, open **Settings → Tricket** and choose the environment that
should run the work. Configure its Tricket address, administrator token, webhook
signing secret, and one Tricket-project-to-repository mapping. Choose a model,
permissions, base ref, and worker count explicitly. The integration starts disabled.

Create a Tricket webhook subscription for `issue.*`, targeting the chosen
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

Assign an eligible ticket in the mapped project to Tricket's T3 pool. T3 claims it
before starting the agent. Duplicate deliveries and server restarts reuse the same
handoff. Reassigning to the pool requests a fresh identity and thread.

Managed agents can read their assignment, comment, and explicitly request review
through `tricket_issue`. A finished turn does not complete the ticket. Choosing a
reviewer and completing the ticket remain explicit actions in Tricket; there is
no automatic reviewer assignment in this version. Tickets awaiting review release
their worker slot.

Reassigning, archiving, deleting, or closing a ticket stops its managed thread and
delegated work. Webhooks normally trigger this promptly; periodic reconciliation
also checks ownership after missed deliveries or a restart.

Disabling and saving stops managed work but leaves ticket assignment unchanged.
To retry that work, explicitly reassign it to the T3 pool in Tricket. Disable and
save before changing the connection or repository. Changing the Tricket address
clears credentials unless you supply replacements.

Threads are visible and controllable from every client, including mobile. Configure
the integration from web or desktop; native mobile has no Tricket settings form yet.
