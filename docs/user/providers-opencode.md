# OpenCode

Install and authenticate OpenCode on the machine running your environment, then
enable it in **Settings > Providers**. See [provider setup](./install.md#providers).
OpenCode 2 requires version 2.0.18 or newer, including when you connect an existing
OpenCode server.

## OpenCode 2

T3 Code supports OpenCode 2.0.18 and newer. It detects the version on its own, so
the same provider settings work for OpenCode 1.x and 2.x. OpenCode 1.x shows
**Limited support** in its provider settings.

OpenCode 2 is a separate package, `@opencode/cli`. To move from 1.x, install it
yourself, for example `npm install -g @opencode/cli`. Then refresh provider status.
T3 Code's update button updates whichever package you have installed. It never
switches a 1.x install to 2.x.

OpenCode 2 converts the shared OpenCode database to its own format the first time it
runs. Don't run OpenCode 1.x and 2.x side by side on the same machine. Threads you
started on 1.x continue on 2.x.

Plan mode uses OpenCode's `plan` agent.

## Local or external server

Leave **Server URL** empty to use OpenCode's local background service and its
connected accounts. T3 Code starts the service if needed. A custom provider
environment or server password uses a separate local process instead; that
process must have its own provider connection. For a separate process, a password
in provider settings applies to both it and T3 Code's connection. Without one,
it uses `OPENCODE_PASSWORD` (or `OPENCODE_SERVER_PASSWORD`) from its environment,
or generates a private password.

To use an existing OpenCode server, set **Server URL** and its password in provider
settings. T3 Code uses only that configured password for an external server; it
does not forward local password environment variables. If connection or version checks
fail, check the URL, credentials, and OpenCode version, then refresh provider status.

After a lost connection, send another prompt to reconnect to the same OpenCode
session.

## Approvals

By default, OpenCode follows the shared [permission modes](./permission-modes.md). **Auto** has
the same rules as **Supervised** because OpenCode has no AI approval reviewer.
Environment files such as `.env` and `.env.local` need approval in restricted
modes even though normal file reads do not; `.env.example` is allowed.

To keep the permissions you configured in `opencode.json(c)`, set **Permissions →
Provider settings** for your OpenCode instance in **Settings → Providers**, then
reconnect its sessions. This overrides the thread's permission mode, including
**Full access**, so your configured denies and approval requests still apply.
Choose **T3 Code modes** to return to thread-controlled permissions.

**Allow for workspace** applies to matching requests in other OpenCode sessions
using the same workspace. It is broader than the current thread, especially on a
shared external server. Use **Allow once** for a single request. Denying an action
does not stop the whole turn.

## Refresh models, commands, and skills

After changing an OpenCode login or configuration, use **Refresh provider status**
in **Settings > Providers** for that environment. On mobile, use **Refresh models**
in the thread settings. Reconnecting also refreshes the catalog; periodic provider
health checks do not.

Credential changes are read on refresh. Native OpenCode configuration can remain
cached while the local helper is running. Let it sit for 30 seconds without model
refreshes or text-generation work, then refresh again to reload the files. Repeated
refreshes keep the helper alive. An external server may need its own reload or
restart before T3 Code can see configuration changes.

Existing threads keep their selected model and options even when it disappears
from the catalog. If OpenCode rejects that model, select an available one and retry.
