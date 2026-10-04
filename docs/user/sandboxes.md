# Sandboxes

Run an agent chat inside an isolated Docker sandbox instead of your local
checkout. Each sandbox is a microVM container with its own copy of the
project, every provider CLI T3 Code supports, and its own T3 Code server —
paired back to your app as a remote environment.

## What you need

- Docker Desktop with [Docker Sandboxes](https://docs.docker.com/ai/sandboxes/)
  (the `sbx` CLI) installed on the machine running your T3 Code server.
- The project must be a git repository with at least one commit.

The first time you open a sandbox, T3 Code builds a sandbox image for you.
That image contains Codex, Claude Code, Cursor, Grok Build, OpenCode 2, and a
T3 Code server whose version **always matches the version of the T3 Code app
you are running** — the version is baked in at build time, so you never hit
server/client skew against a sandbox. Whichever provider you pick for a
thread, its CLI is already there; you only need to log in to it inside the
sandbox.

## Opening a sandbox for a chat

1. Open any chat of a project (the sandbox button appears in the top bar
   once the server advertises sandbox support).
2. Click the **sandbox** button in the top bar.
3. Pick a template, or leave the default, and choose
   **Create sandbox for this chat**.
4. Watch the pipeline. Each initialization step — checking Docker, resolving
   the template, building the image, starting the git receiver, creating the
   sandbox, attaching the workspace, publishing the port, booting the t3
   server, waiting for ready — reports as it happens, with the step that
   failed marked if something goes wrong. The first open takes a few minutes
   because of the image build; later opens skip the steps that are already
   done and finish in seconds.
5. Once the sandbox is running, use **Copy pairing link** in the same menu
   and open it (desktop, web, or mobile) to attach the sandbox as a remote
   environment. From there you can chat with agents working inside the
   sandbox exactly like a local thread.

## Reusing a sandbox across chats

Sandboxes belong to a project folder, not to a single chat. When you open the
sandbox menu in a new chat whose folder already has a sandbox, the menu lists
it and offers to join it. Joining is always your choice — T3 Code never
attaches a chat to an existing sandbox on its own, because two chats sharing
one workspace can overwrite each other's uncommitted work.

- **Join an existing sandbox** to continue in the same workspace, with the
  same files and the same running server.
- **Create a new sandbox** to get an independent copy of the project.

The menu shows how many chats share a sandbox. **Detach this chat** leaves
the sandbox running for everyone else still attached; **Stop sandbox** stops
it for all of them.

## The sandboxes panel

The **container icon at the bottom of the sidebar** opens the sandboxes
panel, which slides in beside the sidebar over the main screen. It has two
sections.

**Running** lists every sandbox T3 Code manages with its status, folder,
published address, template, and how many chats are attached, plus stop and
remove controls. Stopping preserves the sandbox workspace; removing deletes
it. Sandboxes left idle are kept alive automatically, and a stopped sandbox
resumes on its next open.

**Templates** is where you decide what a new sandbox contains.

## Templates

A template describes the image a sandbox is built from: the base image, which
provider CLIs to install, whether to run the gortex code-intelligence daemon,
extra environment variables, extra setup commands, and the weContain tooling
below. Three templates ship with T3 Code and cannot be edited or deleted:

| Template            | Contents                                                                                                                                                                                                    |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Plain** (default) | Every provider CLI and the matching T3 Code server. Smallest and fastest to build.                                                                                                                          |
| **Gortex**          | The plain sandbox plus the gortex daemon, tracking the workspace.                                                                                                                                           |
| **weContain**       | The gortex sandbox plus Docker inside the sandbox, dreamfeed, lateral, openspec, the headroom and serena MCP servers (see _weContain tooling_), and the rtk, context-mode and Ponytail tools (see _Tools_). |

From the Templates section you can:

- **Duplicate** a built-in template as the starting point for your own.
- **Create** a template from scratch, choosing CLIs, gortex, environment, and
  setup commands — or switch on **Hand-written Dockerfile** when the form is
  not enough.
- **Set the default**, which is the template preselected for every new
  sandbox. Deleting the default falls back to Plain.
- **Export** any template, including the built-ins, as a `.t3sandbox.tgz`
  bundle, and **import** bundles shared by someone else.

Templates are checked as you edit them and again on import. Errors block
saving and tell you which field is wrong; warnings (like a base image with no
tag, which will drift as the upstream image changes) are shown but do not
block. A hand-written Dockerfile must have a `FROM` instruction and must
install the sandbox entrypoint, since that is what boots the T3 Code server
inside the sandbox.

Editing a template does not disturb running sandboxes. The next sandbox built
from it gets a fresh image; existing ones keep the image they were created
with.

## weContain tooling

Each of these is a switch in the template editor. The **weContain** template
turns them all on.

| Switch            | What the sandbox gets                                                                                                                                                                   |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Docker            | A private `dockerd`, so the agent can `docker build`/`run`/`compose`. Needs a `*-docker` base image (`docker/sandbox-templates:claude-code-docker`).                                    |
| dreamfeed         | Commits the agent did not make (pulls, merges, rebases) are summarized into its next turn, and each session starts with a gortex repo orientation. The agent's own commits are skipped. |
| lateral           | The lateral goal-loop engine as an MCP server (`lateral`), with its knowledge base kept in the sandbox's state directory, not in your repo.                                             |
| openspec          | The `openspec` CLI. Scaffolding writes into the repo, so it only happens when the project opts in (below).                                                                              |
| headroom / serena | The headroom (tool-output compression) and serena (LSP symbol navigation) MCP servers. The headroom proxy is a separate, larger switch and also needs a project opt-in.                 |
| gortex excludes   | Patterns kept out of the gortex index (empty uses a built-in list: `node_modules/`, `dist/`, `target/`, ...). Smaller indexes are what keep gortex from running out of memory.          |

The MCP servers are registered for Claude Code (`~/.claude.json`) and for
OpenCode (`~/.config/opencode/opencode.json`) every time the sandbox boots.

## Tools

The **Tools** section of the template editor adds tools to the image. Each
one is installed when the image is built and wired up for the agents on every
boot: MCP servers for Claude Code and OpenCode, plugins for Claude Code,
Codex and OpenCode, and the hosts the tool needs at runtime, which are
allowed for every sandbox built from the template.

Three curated tools cut token usage:

| Tool                                                   | What it does                                                                                           |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| [rtk](https://github.com/rtk-ai/rtk)                   | Rewrites the agent's shell commands so their output is compact. Only shell commands go through it.     |
| [context-mode](https://github.com/mksglu/context-mode) | Keeps large tool output in a local index and gives the agent short references instead of the raw data. |
| [Ponytail](https://github.com/DietrichGebert/ponytail) | Makes the agent write the least code that solves the problem.                                          |

rtk, context-mode and headroom all shrink tool output. If an agent behaves
oddly with all three on, switch one off per project (below) to find out which.

Switching a curated tool on copies its definition into the template, so a
later T3 Code update never changes the image of an existing template. To add
any other tool, paste its definition as JSON under **Add your own tool**:

```json
{
  "id": "my-tool",
  "name": "My tool",
  "description": "What it does",
  "category": "other",
  "install": ["npm install -g my-tool@1.0.0"],
  "boot": ["my-tool warm-up"],
  "network": ["api.my-tool.dev"],
  "mcp": { "command": "my-tool", "args": ["mcp"] },
  "opencodePlugins": ["my-tool-opencode"]
}
```

`install` runs as the agent when the image is built, `boot` on every start
(a failing boot step only warns). Hosts in `network` that reach your machine
or local network are refused.

### Per-project `.sandbox-config`

A project can commit a `.sandbox-config` next to its code. The template decides
what is installed; this file decides, per project, what is switched on and how
the sandbox is created:

```json
{
  "sandbox": { "memory": "8g", "cpus": 4 },
  "network": { "allow": ["pypi.org"], "deny": ["telemetry.example.com"] },
  "sync": { "ignore": ["*.log", "tmp/"], "skipWorktree": ["config/local.json"] },
  "gortex": { "enabled": true, "warmCache": true, "exclude": ["vendor/"] },
  "dreamfeed": { "enabled": true },
  "lateral": { "enabled": true },
  "openspec": { "enabled": true, "tools": "claude" },
  "headroom": { "enabled": true, "proxy": false, "port": 8787 },
  "serena": { "enabled": true },
  "tools": { "context-mode": { "enabled": false } }
}
```

Installed tooling and tools default to on and can be switched off here; openspec
scaffolding and the headroom proxy default to off and are switched on here.

## Create options

Expand **Options** in the chat's sandbox menu before creating a sandbox. Empty
fields fall back to the project's `.sandbox-config`, then to Docker Sandboxes'
defaults.

- **Memory / CPUs** — resource limits for the sandbox VM. Raise memory for
  large repositories whose gortex index runs out of memory.
- **Outbound network** — every sandbox follows the global Docker Sandboxes
  policy (`sbx policy ls`). **Also allow** and **Block** add rules for this one
  sandbox only; they disappear with the sandbox. A block that cannot be applied
  fails the create. Hosts that reach your machine or local network
  (`127.0.0.1`, `192.168.*`, `host.docker.internal`, `*.local`, …) are never
  taken from here or from `.sandbox-config`; allow them from the network view,
  which asks you to confirm.
- **Reuse the saved gortex index** — the gortex index is saved on your machine
  after each create and before each removal, and restored into the next fresh
  sandbox for the same folder, so big repositories only pay a small catch-up
  index instead of a full one. The copy is checksummed and checked before it
  is unpacked.

`sync.ignore` patterns go into the sandbox clone's `.git/info/exclude` (never
committed); `sync.skipWorktree` freezes tracked files so the agent's edits to
them never come back.

## Syncing work out of the sandbox

All synchronization runs on your machine inside the T3 application — no
ports, firewall rules, or shared folders are involved. Code moves as git
commits over three hops:

1. **Sandbox → host.** In the chat's sandbox menu, choose **Sync sandbox to
   host**. T3 Code fetches the sandbox workspace over git (through the
   sandbox itself, via `git` over stdio) and integrates it into a local
   branch called `sandbox/<sandbox-name>` in your project. Pending
   in-sandbox changes can be committed first with a message you provide.
   The same work is mirrored into the **docker git receiver** — a small
   container (`t3-sandbox-git-receiver`) T3 Code keeps running on your
   machine — so the work survives even if the sandbox is later removed. The
   receiver has no network at all and publishes no port: only T3 Code on the
   host reaches it, through `docker exec`, so no sandbox or local process can
   rewrite what a later push publishes.

   If the new work touches files that tools on your machine act on by
   themselves — agent settings and hooks (`.claude/`, `.mcp.json`,
   `CLAUDE.md`), editor tasks (`.vscode/`), npm scripts (`package.json`),
   `.envrc`, git hook managers, CI workflows, or `.sandbox-config` — T3 Code
   warns you and lists them. Code written in the sandbox can run on your
   machine through those files once the branch is checked out, so read them
   before you check out or merge the sandbox branch.

2. **Receiver → remote.** Choose **Push to remote…** (in the chat's sandbox
   menu, or the upload button beside a sandbox in the sandboxes panel). This
   works even when the sandbox is stopped, because it reads the git receiver,
   not the sandbox. The dialog shows, before anything is pushed:
   - the receiver commit and the target, `<remote>/<branch>` (default
     `origin` and `sandbox/<sandbox-name>`), and whether that is a new
     branch, a fast-forward, already up to date, or **diverged**. A diverged
     branch is only replaced if you tick the force box; the push then uses
     `--force-with-lease` on the exact tip you saw
   - every commit that would be published, with author and date
   - every file that changes, with added and removed lines

   Then you choose **who the pushed commits name as author**:
   - **My git identity** — `user.name` / `user.email` of your project checkout
   - **Custom** — any name and email
   - **Keep sandbox authors** — push the commits unchanged (normally
     `sandbox-agent <agent@sandbox.local>`)

   With a new author, the commits are re-created with the same content, dates
   and messages. Optionally a `Co-authored-by:` trailer credits the sandbox
   author. **Squash into one commit** publishes a single commit with the
   final state instead, with your message or a summary of the commit
   subjects. **Pull latest from sandbox** in the dialog runs step 1 again
   first.

   If the receiver changes between preview and push, the push is refused and
   you review again. Pushes run from your project checkout with your normal git
   credentials. The exact commit published is recorded locally as
   `refs/sandbox-pushed/<sandbox-name>`.

The older one-click path (`sandbox_sync_to_remote`, which pushes the host
`sandbox/<sandbox-name>` branch as is) remains available to agents over MCP.

### The agent asks for a sync: `t3-sync`

The agent inside the sandbox has no network path to the receiver. Instead it
commits and runs `t3-sync`, which only drops a request; T3 Code on your
machine then runs step 1 for exactly that sandbox and writes the outcome back,
which `t3-sync` prints. The sandbox cannot choose what is synced or into
which repository: each sandbox has its own branch and its own bare repository
in the receiver, and the host takes the sandbox from the session the request
arrived on. Requests are serialized and limited to one every 15 seconds per
sandbox. Claude Code in the sandbox is told about `t3-sync` when a session
starts.

This works through a small root-owned script T3 Code keeps running in every
sandbox it has started (the host channel). Images built from a hand-written
Dockerfile without it still run, just without `t3-sync` and the command log.

## Safeguards: sudo and the command log

Two template switches under **Safeguards**:

- **sudo for the agent** — Docker Sandboxes give the agent passwordless sudo.
  Switched off, the image removes it and the host channel removes it again
  every time the sandbox starts, reporting if it came back. Docker inside the
  sandbox stays root-equivalent, so turn docker off too for a sandbox without
  root. The built-in weContain template ships with sudo off.
- **Command log** — every program the sandbox runs (user, working directory,
  full command line), streamed live to your machine and kept per sandbox
  under the T3 data directory, also after the sandbox is removed. It uses
  [snoopy](https://github.com/a2o/snoopy) from Ubuntu's package archive.
  It is a lead, not proof: the lines are written from inside the sandbox, so
  whoever controls it can forge them, and with sudo switch the log off. The
  host channel reports a switched-off log. Kernel auditing (auditd, eBPF) is
  not available: Docker Sandboxes run every command in its own PID namespace
  and their kernel has no BPF tracing support.

## Observatory

**Observatory** in the sandboxes panel shows all sandboxes at once:

- **Graph** — sandboxes around the git receiver they sync into, the remotes
  the receiver's work was pushed to, and the network proxy. Red marks failed
  syncs or pushes, blocked traffic, flagged commands and changed safeguards.
- **Network** — every host the proxy allowed or blocked, per sandbox. Allow a
  blocked host or block an allowed one for that sandbox only or for all
  sandboxes (the global sbx policy); both ask for confirmation, and hosts
  that reach your machine or local network come with an explicit warning.
  Rules you added can be removed here; the sbx defaults cannot.
- **Sync & pushes** — who synced or pushed what, when, and whether it worked.
- **Commands** — the command log, with commands that match simple rules
  flagged: privilege changes, `curl … | sh`, credential files, network
  tools, persistence, package installs, git pushes, privileged containers,
  and anything touching the log itself.

## Controlling sandboxes from agents (MCP)

The T3 server on your host exposes the same sandbox actions as MCP tools on
its `/mcp` endpoint, so an agent you drive through T3 Code can do everything
the UI can:

| Tool                     | Purpose                                                     |
| ------------------------ | ----------------------------------------------------------- |
| `sandbox_list`           | List sandboxes and their status                             |
| `sandbox_create`         | Create a sandbox for a chat thread, or join an existing one |
| `sandbox_attach`         | Attach a chat thread to an existing sandbox                 |
| `sandbox_detach`         | Detach a chat thread from a sandbox                         |
| `sandbox_template_list`  | List templates and the default                              |
| `sandbox_stop`           | Stop a sandbox                                              |
| `sandbox_remove`         | Remove a sandbox and its receiver repo                      |
| `sandbox_sync_to_host`   | Fetch + integrate sandbox work into the host project        |
| `sandbox_sync_to_remote` | Push the integrated branch to a git remote                  |
| `sandbox_remote_preview` | Preview what the git receiver would publish to a remote     |
| `sandbox_remote_push`    | Publish the previewed receiver work, optionally re-authored |

## Complete workflow, end to end

1. Create a chat in your project.
2. Click the sandbox button in the top bar → pick a template →
   **Create sandbox for this chat**, and watch the setup pipeline.
3. Copy the pairing link and open it — the sandbox appears as a remote
   environment and its agent works on the sandbox's copy of the project.
4. Review the agent's work (the sandbox's T3 server shows you diffs and
   messages like any other environment).
5. Click **Sync sandbox to host** — the work lands on the
   `sandbox/<name>` branch in your real checkout and is mirrored to the
   docker git receiver.
6. Click **Push to remote…**, review the commits and files, pick the author,
   and push. The branch is then ready for a pull request.
7. Done with the chat? **Stop** the sandbox from the sandboxes panel, or
   **remove** it once the work is merged. Un-synced sandbox work is lost on
   removal, so sync first.

## Questions and limits

- **Where does my data live?** Workspace copies live inside the sandbox
  containers; the git receiver keeps mirrored branches in the T3 home
  directory (`sandboxes/git-repos`), and your templates live beside them.
  Nothing is mounted into the sandbox — the only bridge is git.
- **Do I have to log in to the CLIs again?** Yes. A sandbox is an isolated
  machine with its own home directory, so provider credentials do not travel
  from your host into it.
- **Which t3 version runs inside the sandbox?** Exactly the version of the
  app that created it. Updating the app changes the image the next time a
  sandbox is built.
- **What happens if I stop a sandbox and keep working?** The sandbox keeps
  its last state; resuming restores it. Changes made on the host after the
  last sync are delivered only by the sandbox's own git operations — sync
  from the chat menu before continuing work there.
- **Windows notes.** All git transports run through process stdio, so no
  inbound ports or firewall rules are needed on your machine.
