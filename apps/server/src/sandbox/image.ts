/**
 * Sandbox image rendering.
 *
 * A template is data: a base image, a set of provider CLIs, an optional gortex
 * daemon, the weContain guest tooling, extra env, and extra setup commands. The
 * Dockerfile and the guest entrypoint are rendered from that data at build time
 * and written to a build cache directory, so no bundler asset-copy wiring is
 * needed and the image definition travels with the server bundle. Templates
 * that need more than the data model allows ship their own Dockerfile instead,
 * which wins verbatim.
 */

import type { SandboxCliId, SandboxTemplateManifest } from "@t3tools/contracts";

import { DREAMFEED_SCRIPT, LATERAL_BUNDLE_BASE64 } from "./guestAssets.generated.ts";
import {
  CHANNEL_FILE,
  GUEST_CHANNEL_PATH,
  GUEST_FEATURES_FILE,
  GUEST_SYNC_COMMAND_PATH,
  HOST_CHANNEL_SCRIPT,
  SNOOPY_INI,
  SNOOPY_VERSION,
  SYNC_COMMAND_FILE,
  SYNC_COMMAND_SCRIPT,
} from "./guestChannel.ts";

export const SANDBOX_IMAGE_NAME = "t3-sandbox";

/**
 * The docker git receiver: a durable mirror of each sandbox's work, reached by
 * the host only through `docker exec` stdio. It has no network at all — an
 * unauthenticated, writable git daemon on a published port would let any local
 * process, or a sandbox that can reach host ports, rewrite another sandbox's
 * mirror and so what a later push publishes. Named apart from weContain's own
 * `sbx-git-receiver`, which publishes a port for its in-sandbox `sbx-sync`.
 */
export const SANDBOX_RECEIVER_CONTAINER = "t3-sandbox-git-receiver";
export const SANDBOX_RECEIVER_IMAGE =
  "alpine/git:2.49.1@sha256:c0280cf9572316299b08544065d3bf35db65043d5e3963982ec50647d2746e26";
export const SANDBOX_GIT_USER_NAME = "sandbox-agent";
export const SANDBOX_GIT_USER_EMAIL = "agent@sandbox.local";

export const SANDBOX_DEFAULT_BASE_IMAGE =
  "docker/sandbox-templates:claude-code@sha256:81514bdb1e9db93c00f4bcd5facc4e28be2714dd6300e9ff01028dbbe9421713";

/**
 * The `*-docker` variant of the base: identical userland plus docker-ce and the
 * label that makes sbx start a private dockerd at boot. Every sandbox is its own
 * microVM, so the agent gets `docker build`/`run` with no host socket and no
 * `--privileged`.
 */
export const SANDBOX_DOCKER_BASE_IMAGE =
  "docker/sandbox-templates:claude-code-docker@sha256:94670d5b2a2479e182806a7cfd9b4d414ca4050c77281973cd283785e9a5f9d2";

export const GUEST_HOME = "/home/agent";
export const GUEST_WORKSPACE_DIR = `${GUEST_HOME}/workspace`;
export const GUEST_STATE_DIR = `${GUEST_HOME}/.local/state/t3-sandbox`;
/** Written by start-t3 once gortex's first index has finished. */
export const GUEST_GORTEX_READY_FILE = `${GUEST_STATE_DIR}/gortex-ready`;
/** Where the host drops the project's current `.sandbox-config` before each boot. */
export const GUEST_HOST_CONFIG_FILE = `${GUEST_STATE_DIR}/host-sandbox-config.json`;

/**
 * gortex's MCP server reports the workspace as untracked until the first index
 * finishes, and a Claude session keeps that view until it reconnects. The boot
 * gives the index this long a head start before the pairing link goes out.
 */
const GORTEX_BOOT_WAIT_DEFAULT_SECONDS = 300;
const GORTEX_BOOT_WAIT_MAX_SECONDS = 480;

/** Versions pinned exactly; bump deliberately after reading release notes. */
const OPENSPEC_VERSION = "1.10.0";
const HEADROOM_VERSION = "0.37.0";
const SERENA_VERSION = "1.7.0";

/**
 * Heavyweight vendored/build trees kept out of the gortex index. On big repos
 * the indexer's working set is what OOMs the daemon, so shrinking the file set
 * is the real memory lever.
 */
export const DEFAULT_GORTEX_EXCLUDE: ReadonlyArray<string> = [
  "node_modules/",
  "vendor/",
  "dist/",
  "build/",
  ".next/",
  "out/",
  "target/",
  ".venv/",
  ".gradle/",
  ".terraform/",
  ".mypy_cache/",
  ".pytest_cache/",
  "coverage/",
  ".cache/",
];

/**
 * The guest env var `sbx create --env` gets per create. The guest folder named
 * after the project (instead of a generic "workspace") makes the sandbox look
 * like the host project rather than an anonymous clone dir; the start script
 * and every guest-side path resolve through this override at runtime.
 */
export const SANDBOX_WORKSPACE_ENV = "T3_SANDBOX_WORKSPACE";

export function guestWorkspaceDir(projectCwd: string): string {
  return `/home/agent/${sanitizeWorkspaceName(projectCwd)}`;
}

function sanitizeWorkspaceName(projectCwd: string): string {
  const base = projectCwd.split(/[\\/]/).at(-1) ?? "";
  const sanitized = base.replace(/[^a-zA-Z0-9._-]/g, "-").replace(/^-+|-+$/g, "");
  return sanitized.length > 0 ? sanitized : "workspace";
}

/**
 * How each provider CLI is installed inside the image, and the binary T3 Code
 * looks for afterwards. The npm package names are the ones the host drivers
 * install (`ClaudeDriver`, `CodexDriver`, `OpenCodeDriver`); Cursor and Grok
 * ship their own installers.
 */
export const SANDBOX_CLI_INSTALL: Record<
  SandboxCliId,
  { readonly label: string; readonly binary: string; readonly install: ReadonlyArray<string> }
> = {
  codex: {
    label: "Codex",
    binary: "codex",
    install: ["npm install -g @openai/codex"],
  },
  claude: {
    label: "Claude Code",
    binary: "claude",
    install: ["npm install -g @anthropic-ai/claude-code"],
  },
  cursor: {
    label: "Cursor",
    binary: "cursor-agent",
    // The installer drops `agent` (and usually `cursor-agent`) into
    // ~/.local/bin. T3 Code looks for `cursor-agent`, so link it when the
    // installer only left the short name behind.
    install: [
      "curl https://cursor.com/install -fsS | bash",
      `if [ ! -x "${GUEST_HOME}/.local/bin/cursor-agent" ] && [ -x "${GUEST_HOME}/.local/bin/agent" ]; then ln -s agent "${GUEST_HOME}/.local/bin/cursor-agent"; fi`,
    ],
  },
  grok: {
    label: "Grok Build",
    binary: "grok",
    install: ["curl -fsSL https://x.ai/cli/install.sh | bash"],
  },
  opencode: {
    label: "OpenCode",
    binary: "opencode",
    install: ["npm install -g opencode-ai"],
  },
};

/**
 * gortex is pinned twice: the installer script by checksum (a changed script
 * fails the build instead of running), and the release it installs by tag
 * (the installer verifies that tarball against the release's checksums.txt).
 * Bump both deliberately: read the new installer, then update the two values.
 */
export const GORTEX_VERSION = "v0.64.4";
export const GORTEX_INSTALLER_SHA256 =
  "52395c3d9b31287c7d1c50027123207f85905a665e28f9c33049e1a578ec43c5";

const GORTEX_INSTALL = [
  "curl -fsSL https://get.gortex.dev -o /tmp/gortex-install.sh",
  `echo "${GORTEX_INSTALLER_SHA256}  /tmp/gortex-install.sh" | sha256sum -c -`,
  `GORTEX_VERSION=${GORTEX_VERSION} sh /tmp/gortex-install.sh`,
  "rm -f /tmp/gortex-install.sh",
  `gortex version | grep -qF "${GORTEX_VERSION}"`,
  "gortex install",
];

/** Files the generated build context carries next to the Dockerfile. */
export const DREAMFEED_FILE = "dreamfeed";
export const LATERAL_BUNDLE_FILE = "lateral.tar.gz";

/** Resolved on/off state of every optional part of a template. */
export interface SandboxTemplateFeatures {
  readonly gortex: boolean;
  readonly docker: boolean;
  readonly dreamfeed: boolean;
  readonly lateral: boolean;
  readonly openspec: boolean;
  readonly headroom: boolean;
  readonly headroomProxy: boolean;
  readonly serena: boolean;
  readonly gortexExclude: ReadonlyArray<string>;
  readonly commandLog: boolean;
  readonly sudo: boolean;
}

export function templateFeatures(manifest: SandboxTemplateManifest): SandboxTemplateFeatures {
  const headroom = manifest.headroom === true || manifest.headroomProxy === true;
  return {
    gortex: manifest.gortex,
    docker: manifest.docker === true,
    dreamfeed: manifest.dreamfeed === true,
    lateral: manifest.lateral === true,
    openspec: manifest.openspec === true,
    headroom,
    headroomProxy: manifest.headroomProxy === true,
    serena: manifest.serena === true,
    gortexExclude: manifest.gortexExclude ?? DEFAULT_GORTEX_EXCLUDE,
    commandLog: manifest.commandLog === true,
    sudo: manifest.sudo !== false,
  };
}

/**
 * Guest service files a generated image needs in its build context. Custom
 * Dockerfiles get them too, so a hand-written template can COPY them.
 */
export function guestBuildFiles(manifest: SandboxTemplateManifest): Map<string, Uint8Array> {
  const features = templateFeatures(manifest);
  const files = new Map<string, Uint8Array>([
    [CHANNEL_FILE, Buffer.from(HOST_CHANNEL_SCRIPT, "utf8")],
    [SYNC_COMMAND_FILE, Buffer.from(SYNC_COMMAND_SCRIPT, "utf8")],
  ]);
  if (features.dreamfeed) {
    files.set(DREAMFEED_FILE, Buffer.from(DREAMFEED_SCRIPT, "utf8"));
  }
  if (features.lateral) {
    files.set(LATERAL_BUNDLE_FILE, Buffer.from(LATERAL_BUNDLE_BASE64, "base64"));
  }
  return files;
}

/**
 * Resolves the docker image tag for a template and host server version. The t3
 * server installed inside the image always matches the version of the t3
 * application that builds/uses it, so clients never hit server-skew against a
 * sandbox. The content hash keeps edited templates from reusing a stale image.
 * Docker tags reject `+`; nightly versions carry only `.-` anyway.
 */
export function sandboxImageTag(input: {
  readonly templateId: string;
  readonly version: string;
  readonly contentHash: string;
}): string {
  const sanitize = (value: string) => value.replace(/[^a-zA-Z0-9._-]/g, "-");
  return `${SANDBOX_IMAGE_NAME}:${sanitize(input.templateId)}-v${sanitize(input.version)}-${input.contentHash.slice(0, 12)}`;
}

/** Shell-quotes a value for a single-quoted POSIX context. */
function singleQuote(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

/** Joins shell commands into one RUN layer, failing the build on any step. */
function runLayer(commands: ReadonlyArray<string>): string {
  if (commands.length === 1) {
    return `RUN ${commands[0]}`;
  }
  return `RUN ${commands.join(" \\\n && ")}`;
}

/**
 * Copies a guest script in as the agent (so the later RUN may touch it), strips
 * CRLF — a Windows checkout turns `#!/usr/bin/env bash` into `bash\r`, which dies
 * at exec time looking like a missing interpreter — and marks it executable.
 */
function copyGuestScript(source: string, target: string): ReadonlyArray<string> {
  return [
    `COPY --chown=agent:agent ${source} ${target}`,
    `RUN sed -i 's/\\r$//' ${target} && chmod +x ${target}`,
  ];
}

/**
 * Root-owned parts: the host channel and `t3-sync`, the optional command log
 * and the sudo switch. Last in the file so the command log's preload does not
 * log the build itself, and so the agent never owns anything here.
 */
function hostChannelLayers(features: SandboxTemplateFeatures): ReadonlyArray<string> {
  const lines = [
    "# T3 host channel (root) and t3-sync (agent-triggered git sync via the host)",
    "USER root",
    `COPY ${CHANNEL_FILE} ${GUEST_CHANNEL_PATH}`,
    `COPY ${SYNC_COMMAND_FILE} ${GUEST_SYNC_COMMAND_PATH}`,
    runLayer([
      `sed -i 's/\\r$//' ${GUEST_CHANNEL_PATH} ${GUEST_SYNC_COMMAND_PATH}`,
      `chown root:root ${GUEST_CHANNEL_PATH} ${GUEST_SYNC_COMMAND_PATH}`,
      `chmod 0755 ${GUEST_CHANNEL_PATH} ${GUEST_SYNC_COMMAND_PATH}`,
      `mkdir -p ${GUEST_FEATURES_FILE.slice(0, GUEST_FEATURES_FILE.lastIndexOf("/"))}`,
      `printf 'sudo=%s\\ncommandLog=%s\\n' ${features.sudo ? 1 : 0} ${features.commandLog ? 1 : 0} > ${GUEST_FEATURES_FILE}`,
      `chmod 0644 ${GUEST_FEATURES_FILE}`,
      `${GUEST_CHANNEL_PATH} --harden`,
    ]),
  ];
  if (features.commandLog) {
    lines.push(
      "# Command log: snoopy logs every exec; the host channel streams it out",
      runLayer([
        "apt-get update",
        // The package would otherwise enable its preload during the build.
        "echo 'snoopy snoopy/install-ld-preload boolean false' | debconf-set-selections",
        `DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends snoopy=${SNOOPY_VERSION}`,
        "rm -rf /var/lib/apt/lists/*",
        // One printf argument per line: a Dockerfile RUN cannot span raw newlines.
        `printf '%s\\n' ${SNOOPY_INI.trimEnd()
          .split("\n")
          .map((line) => singleQuote(line))
          .join(" ")} > /etc/snoopy.ini`,
        "chmod 0644 /etc/snoopy.ini",
        "dpkg -L snoopy | grep -E '/libsnoopy[.]so$' | head -n 1 > /etc/ld.so.preload",
        "grep -q libsnoopy /etc/ld.so.preload",
      ]),
    );
  }
  if (!features.sudo) {
    lines.push(
      "# No sudo for the agent (the host channel also re-checks this at runtime)",
      runLayer(["rm -f /etc/sudoers.d/agent", "(gpasswd -d agent sudo || true)"]),
    );
  }
  lines.push("USER agent");
  return lines;
}

export function renderDockerfile(
  manifest: SandboxTemplateManifest,
  options: { readonly baseImage?: string } = {},
): string {
  const features = templateFeatures(manifest);
  const baseImage = options.baseImage ?? manifest.baseImage;
  const lines: string[] = [
    "# syntax=docker/dockerfile:1",
    `# ${manifest.name} — generated by T3 Code from template ${manifest.id}.`,
    "# Edit the template, not this file: it is re-rendered on every build.",
    "",
    `ARG BASE_IMAGE=${baseImage}`,
    "",
    "# Stage one installs the host-matched t3 server into the base image's global",
    "# npm prefix, so the sandbox never runs a different t3 version than the app.",
    "FROM ${BASE_IMAGE} AS t3-builder",
    "USER root",
    runLayer([
      "apt-get update",
      "apt-get install -y --no-install-recommends build-essential python3",
      "rm -rf /var/lib/apt/lists/*",
    ]),
    "ARG T3_VERSION",
    'RUN npm install -g "t3@${T3_VERSION}"',
    "",
    "FROM ${BASE_IMAGE}",
    "USER agent",
  ];

  if (features.docker) {
    // Restated rather than inherited from a `*-docker` base: this label is the
    // switch that makes sbx start the in-sandbox dockerd, and a base bump that
    // dropped it would otherwise silently lose `docker run`.
    lines.push('LABEL com.docker.sandboxes.start-docker="true"');
  }

  const env: Record<string, string> = {
    T3CODE_TELEMETRY_ENABLED: "false",
    ...(manifest.gortex || features.openspec ? { OPENSPEC_TELEMETRY: "0" } : {}),
    ...manifest.env,
  };
  for (const [key, value] of Object.entries(env)) {
    lines.push(`ENV ${key}=${singleQuote(value)}`);
  }
  lines.push(
    // NPM_CONFIG_PREFIX, not `npm config set prefix`: the base image exports a
    // prefix of its own, and an environment variable outranks the .npmrc that
    // `npm config set` writes. Without this, installs run as `agent` against
    // the image's root-owned global prefix and fail with EACCES.
    `ENV NPM_CONFIG_PREFIX="${GUEST_HOME}/.npm-global"`,
    `ENV PATH="${GUEST_HOME}/.npm-global/bin:${GUEST_HOME}/.local/bin:\${PATH}"`,
    "",
    runLayer([`mkdir -p ${GUEST_HOME}/.npm-global/bin ${GUEST_HOME}/.local/bin`]),
    "COPY --from=t3-builder /usr/local/share/npm-global /usr/local/share/npm-global",
  );

  // One layer per CLI: a failing installer names the CLI that broke, and
  // editing the CLI set only rebuilds from the first one that changed.
  for (const cli of manifest.clis) {
    const definition = SANDBOX_CLI_INSTALL[cli];
    lines.push("", `# ${definition.label}`, runLayer(definition.install));
  }

  if (manifest.gortex) {
    lines.push("", "# gortex code intelligence", runLayer(GORTEX_INSTALL));
  }

  if (features.openspec) {
    lines.push(
      "",
      "# openspec — spec-driven development; scaffolding is opt-in per project",
      runLayer([`npm install -g "@fission-ai/openspec@${OPENSPEC_VERSION}"`]),
    );
  }

  if (features.headroom || features.serena) {
    // Isolated uv tool venvs pinned to the base image's own python3:
    // UV_PYTHON_DOWNLOADS=never stops uv fetching an interpreter from the
    // internet. On Python >= 3.14 headroom's requirements exclude litellm.
    const installs: string[] = ["export UV_PYTHON_DOWNLOADS=never UV_LINK_MODE=copy"];
    if (features.headroom) {
      const extras = features.headroomProxy ? "mcp,proxy" : "mcp";
      installs.push(
        `uv tool install --python /usr/bin/python3 "headroom-ai[${extras}]==${HEADROOM_VERSION}"`,
        "headroom --version",
      );
    }
    if (features.serena) {
      installs.push(
        `uv tool install --python /usr/bin/python3 "serena-agent==${SERENA_VERSION}"`,
        "serena --help >/dev/null",
      );
    }
    lines.push("", "# headroom / serena MCP servers", runLayer(installs));
  }

  if (features.dreamfeed) {
    lines.push(
      "",
      "# dreamfeed — ambient repo-change feed injected into each agent turn",
      ...copyGuestScript(DREAMFEED_FILE, `${GUEST_HOME}/.local/bin/dreamfeed`),
    );
  }

  if (features.lateral) {
    lines.push(
      "",
      "# lateral — goal loops with orthogonal rethinking (MCP server, zero deps)",
      `COPY --chown=agent:agent ${LATERAL_BUNDLE_FILE} ${GUEST_HOME}/.cache/${LATERAL_BUNDLE_FILE}`,
      runLayer([
        `mkdir -p ${GUEST_HOME}/.local/share`,
        `tar xzf ${GUEST_HOME}/.cache/${LATERAL_BUNDLE_FILE} -C ${GUEST_HOME}/.local/share`,
        `rm -f ${GUEST_HOME}/.cache/${LATERAL_BUNDLE_FILE}`,
        `ln -sf ${GUEST_HOME}/.local/share/lateral/bin/lateral.js ${GUEST_HOME}/.local/bin/lateral`,
        "lateral status --data /tmp/lateral-smoke >/dev/null",
        "rm -rf /tmp/lateral-smoke",
      ]),
    );
  }

  if (manifest.setupCommands.length > 0) {
    lines.push("", "# Template setup commands", runLayer(manifest.setupCommands));
  }

  lines.push(
    "",
    ...copyGuestScript("start-t3", `${GUEST_HOME}/.local/bin/start-t3`),
    "",
    ...hostChannelLayers(features),
    `WORKDIR ${GUEST_WORKSPACE_DIR}`,
    "",
  );

  return lines.join("\n");
}

const bashBool = (value: boolean) => (value ? "1" : "0");

/**
 * Guest entrypoint, ported from weContain's `start-t3.sh`: boots a headless t3
 * server on 0.0.0.0:3773 and, per template, the gortex daemon, dreamfeed hooks,
 * MCP wiring for gortex/headroom/serena/lateral, openspec scaffolding and the
 * headroom proxy. Idempotent — safe to run on every attach.
 *
 * The template decides what is installed; a `.sandbox-config` committed in the
 * project can switch installed tooling off at runtime (and opts into openspec
 * scaffolding and the headroom proxy, which are off by default).
 */
export function renderStartScript(manifest: SandboxTemplateManifest): string {
  const features = templateFeatures(manifest);
  const defaultExclude = features.gortexExclude.map((pattern) => singleQuote(pattern)).join(" ");

  return `#!/usr/bin/env bash
# Generated by T3 Code from sandbox template ${manifest.id}.
set -uo pipefail

STATE_DIR="$HOME/.local/state/t3-sandbox"
mkdir -p "$STATE_DIR"
WS="\${T3_SANDBOX_WORKSPACE:-$HOME/workspace}"

T3_PORT=3773
T3_PID_FILE="$STATE_DIR/t3-serve.pid"
T3_LOG="$STATE_DIR/t3-serve.log"
GORTEX_LOG="$STATE_DIR/gortex-setup.log"
TOOLS_LOG="$STATE_DIR/workspace-tools.log"
HEADROOM_LOG="$STATE_DIR/headroom-proxy.log"

# --- .sandbox-config (optional, committed in the project) --------------------
# The host copies the project's current file in before every boot, so edits
# apply before they are committed; otherwise the clone's own copy is used.
HOST_CONFIG_FILE="$STATE_DIR/host-sandbox-config.json"
if [ -r "$HOST_CONFIG_FILE" ]; then CONFIG_FILE="$HOST_CONFIG_FILE"; else CONFIG_FILE="$WS/.sandbox-config"; fi
# cfg <dotted.key> <default>: scalar as text, arrays one item per line.
cfg() {
  if [ ! -r "$CONFIG_FILE" ]; then printf '%s' "$2"; return; fi
  node -e '
    const [file, key, fallback] = process.argv.slice(1);
    let value;
    try {
      value = key.split(".").reduce((o, k) => (o == null ? undefined : o[k]),
        JSON.parse(require("fs").readFileSync(file, "utf8")));
    } catch { value = undefined; }
    if (value === undefined || value === null) process.stdout.write(fallback);
    else if (Array.isArray(value)) process.stdout.write(value.join("\\n"));
    else process.stdout.write(String(value));
  ' "$CONFIG_FILE" "$1" "$2" 2>/dev/null || printf '%s' "$2"
}
# Installed tooling defaults on; the project may only switch it off.
feature() { [ "$1" = 1 ] && [ "$(cfg "$2" "$3")" = "true" ] && echo 1 || echo 0; }

GORTEX_ENABLED=$(feature ${bashBool(features.gortex)} gortex.enabled true)
DREAMFEED_ENABLED=$(feature ${bashBool(features.dreamfeed)} dreamfeed.enabled true)
LATERAL_ENABLED=$(feature ${bashBool(features.lateral)} lateral.enabled true)
HEADROOM_ENABLED=$(feature ${bashBool(features.headroom)} headroom.enabled true)
SERENA_ENABLED=$(feature ${bashBool(features.serena)} serena.enabled true)
# Writes into the workspace, and the git bridge carries it home: opt-in only.
OPENSPEC_ENABLED=$(feature ${bashBool(features.openspec)} openspec.enabled false)
OPENSPEC_TOOLS="$(cfg openspec.tools claude)"
# Sits in the path of every model call: opt-in only.
HEADROOM_PROXY=$(feature ${bashBool(features.headroomProxy)} headroom.proxy false)
HEADROOM_PORT="$(cfg headroom.port 8787)"
GORTEX_EXCLUDE="$(cfg gortex.exclude "")"
DEFAULT_GORTEX_EXCLUDE=(${defaultExclude})
# Head start for gortex's first index (seconds). Capped below the host's
# ten-minute boot timeout.
GORTEX_BOOT_WAIT="$(cfg gortex.bootWaitSeconds ${GORTEX_BOOT_WAIT_DEFAULT_SECONDS})"
case "$GORTEX_BOOT_WAIT" in ''|*[!0-9]*) GORTEX_BOOT_WAIT=${GORTEX_BOOT_WAIT_DEFAULT_SECONDS} ;; esac
[ "$GORTEX_BOOT_WAIT" -le ${GORTEX_BOOT_WAIT_MAX_SECONDS} ] || GORTEX_BOOT_WAIT=${GORTEX_BOOT_WAIT_MAX_SECONDS}

# Serialize invocations. Every long-lived process below is started with 9>&-:
# otherwise it inherits this fd, holds the flock for its whole lifetime, and
# every later run -- the documented way to re-mint a pairing link -- exits here.
exec 9>"$STATE_DIR/.lock"
if ! flock -n 9; then
  echo "another start-t3 invocation is already running; exiting." >&2
  exit 0
fi

# --- agent hooks (dreamfeed) ---------------------------------------------------
# Appends entry-by-entry keyed on the exact command string, never overwriting a
# file or an event someone else (gortex install, the user) already owns.
wire_agent_hooks() (
  set -euo pipefail
  settings="$HOME/.claude/settings.json"
  mkdir -p "$(dirname "$settings")"
  [ -s "$settings" ] || printf '{}\\n' > "$settings"
  add_hook() {
    local event="$1" command="$2" tmp
    if ! jq -e --arg ev "$event" --arg c "$command" \\
        '[.hooks[$ev] // [] | .[] | (.hooks // []) | .[] | .command] | index($c) != null' \\
        "$settings" >/dev/null 2>&1; then
      tmp="$(mktemp)"
      jq --arg ev "$event" --arg c "$command" \\
        '.hooks //= {} | .hooks[$ev] //= [] | .hooks[$ev] += [{hooks:[{type:"command",command:$c}]}]' \\
        "$settings" > "$tmp" && mv "$tmp" "$settings"
    fi
  }
  remove_hook() {
    local event="$1" command="$2" tmp
    tmp="$(mktemp)"
    jq --arg ev "$event" --arg c "$command" \\
      'if .hooks[$ev] then .hooks[$ev] |= map(select(([(.hooks // [])[] | .command] | index($c)) == null)) else . end' \\
      "$settings" > "$tmp" && mv "$tmp" "$settings"
  }
  if [ "$GORTEX_ENABLED" = 1 ]; then
    add_hook SessionStart "t3-sandbox-gortex-hint"
  else
    remove_hook SessionStart "t3-sandbox-gortex-hint"
  fi
  if command -v t3-sync >/dev/null 2>&1; then
    add_hook SessionStart "t3-sandbox-sync-hint"
  fi
  if [ "$DREAMFEED_ENABLED" = 1 ]; then
    add_hook SessionStart "dreamfeed orient"
    add_hook UserPromptSubmit "dreamfeed digest"
  else
    remove_hook SessionStart "dreamfeed orient"
    remove_hook UserPromptSubmit "dreamfeed digest"
  fi
)

# --- MCP servers ------------------------------------------------------------------
# Claude Code user scope (~/.claude.json .mcpServers) covers every project in
# the box. gortex is re-added here because sbx rewrites ~/.claude.json at boot
# and the entry \`gortex install\` wrote at build time does not survive.
wire_mcp_servers() (
  set -euo pipefail
  claude_json="$HOME/.claude.json"
  [ -s "$claude_json" ] || printf '{}\\n' > "$claude_json"
  set_server() {
    local name="$1" enabled="$2" spec="$3" tmp
    tmp="$(mktemp)"
    if [ "$enabled" = 1 ]; then
      jq --arg n "$name" --argjson s "$spec" '.mcpServers //= {} | .mcpServers[$n] //= $s' \\
        "$claude_json" > "$tmp"
    else
      # Only remove an entry this script would have written.
      jq --arg n "$name" --argjson s "$spec" \\
        'if (.mcpServers[$n] // null) == $s then del(.mcpServers[$n]) else . end' \\
        "$claude_json" > "$tmp"
    fi
    mv "$tmp" "$claude_json"
  }
  set_server gortex "$GORTEX_ENABLED" \\
    '{"type":"stdio","command":"gortex","args":["mcp"],"env":{"GORTEX_INDEX_WORKERS":"8"}}'
  set_server headroom "$HEADROOM_ENABLED" \\
    '{"type":"stdio","command":"headroom","args":["mcp","serve"],"env":{}}'
  set_server serena "$SERENA_ENABLED" \\
    '{"type":"stdio","command":"serena","args":["start-mcp-server","--project-from-cwd","--context","claude-code","--enable-web-dashboard","False","--open-web-dashboard","False"],"env":{}}'
  lateral_spec="$(jq -cn --arg d "$STATE_DIR/lateral" \\
    '{type:"stdio",command:"lateral",args:["mcp","--data",$d],env:{}}')"
  set_server lateral "$LATERAL_ENABLED" "$lateral_spec"

  # opencode reads ~/.config/opencode/opencode.json when run directly
  # (\`sbx exec -it <box> opencode\`); T3-launched sessions pass their own config.
  if command -v opencode >/dev/null 2>&1; then
    oc="$HOME/.config/opencode/opencode.json"
    mkdir -p "$(dirname "$oc")"
    [ -s "$oc" ] || printf '{"$schema":"https://opencode.ai/config.json"}\\n' > "$oc"
    tmp="$(mktemp)"
    jq --argjson g "$GORTEX_ENABLED" --argjson h "$HEADROOM_ENABLED" \\
       --argjson s "$SERENA_ENABLED" --argjson l "$LATERAL_ENABLED" --arg d "$STATE_DIR/lateral" '
      .mcp //= {}
      | .mcp.gortex //= {type:"local",command:["gortex","mcp"],environment:{GORTEX_INDEX_WORKERS:"8"}}
      | .mcp.headroom //= {type:"local",command:["headroom","mcp","serve"]}
      | .mcp.serena //= {type:"local",command:["serena","start-mcp-server","--project-from-cwd","--enable-web-dashboard","False","--open-web-dashboard","False"]}
      | .mcp.lateral //= {type:"local",command:["lateral","mcp","--data",$d]}
      | .mcp.gortex.enabled = ($g == 1) | .mcp.headroom.enabled = ($h == 1)
      | .mcp.serena.enabled = ($s == 1) | .mcp.lateral.enabled = ($l == 1)' \\
      "$oc" > "$tmp" && mv "$tmp" "$oc"
  fi
)

# --- headroom proxy (opt-in) ------------------------------------------------------
# Claude Code is pointed at the proxy only after it answered its health probe: a
# dead proxy must never leave the agent unable to reach the model. Upstream
# traffic still leaves through the sandbox egress proxy, which is where sbx
# injects the provider credential; headroom never holds a real key.
setup_headroom_proxy() (
  set -uo pipefail
  settings="$HOME/.claude/settings.json"
  mkdir -p "$(dirname "$settings")"
  [ -s "$settings" ] || printf '{}\\n' > "$settings"
  url="http://127.0.0.1:$HEADROOM_PORT"
  set_base_url() {
    local tmp
    tmp="$(mktemp)"
    if [ -n "$1" ]; then
      jq --arg u "$1" '.env //= {} | .env.ANTHROPIC_BASE_URL = $u' "$settings" > "$tmp"
    else
      jq --arg u "$url" 'if (.env.ANTHROPIC_BASE_URL // "") == $u then del(.env.ANTHROPIC_BASE_URL) else . end' \\
        "$settings" > "$tmp"
    fi
    mv "$tmp" "$settings"
  }
  if [ "$HEADROOM_PROXY" != 1 ] || [ "$HEADROOM_ENABLED" != 1 ]; then
    set_base_url ""
    return 0
  fi
  if ! curl -fsS --max-time 2 "$url/health" >/dev/null 2>&1; then
    nohup env SSL_CERT_FILE=/etc/ssl/certs/ca-certificates.crt \\
      headroom proxy --host 127.0.0.1 --port "$HEADROOM_PORT" >"$HEADROOM_LOG" 2>&1 9>&- &
    disown
  fi
  for _ in $(seq 1 60); do
    if curl -fsS --max-time 2 "$url/health" >/dev/null 2>&1; then
      set_base_url "$url"
      echo "headroom proxy up on $url; Claude Code routed through it"
      return 0
    fi
    sleep 1
  done
  echo "WARNING: headroom proxy did not become healthy; Claude Code left on the direct route" >&2
  set_base_url ""
)

# --- gortex: daemon + live tracking -------------------------------------------------
setup_gortex() (
  set -euo pipefail
  gortex daemon status >/dev/null 2>&1 || gortex daemon start --detach 9>&-
  for _ in $(seq 1 30); do
    gortex daemon status >/dev/null 2>&1 && break
    sleep 1
  done
  [ -d "$WS" ] || return 0
  if [ -n "$GORTEX_EXCLUDE" ]; then
    while IFS= read -r pattern; do
      [ -n "$pattern" ] && gortex config exclude add --global "$pattern" >/dev/null 2>&1 || true
    done <<< "$GORTEX_EXCLUDE"
  else
    for pattern in "\${DEFAULT_GORTEX_EXCLUDE[@]}"; do
      gortex config exclude add --global "$pattern" >/dev/null 2>&1 || true
    done
  fi
  # Not --wait: on a cold daemon it times out waiting for the graph to settle,
  # while \`gortex init\` right after triggers its own pass in about a second.
  gortex track "$WS"
  (cd "$WS" && gortex init)
)

# --- openspec scaffolding (opt-in per project) --------------------------------------
setup_openspec() {
  [ "$OPENSPEC_ENABLED" = 1 ] || return 0
  if [ -d "$WS/openspec" ]; then
    (cd "$WS" && openspec update --no-color >/dev/null 2>&1) \\
      || echo "WARNING: 'openspec update' failed; slash commands may be stale" >&2
    return 0
  fi
  (cd "$WS" && openspec init --tools "$OPENSPEC_TOOLS" --no-animation --no-color </dev/null) \\
    || echo "WARNING: 'openspec init' failed; continuing without spec scaffolding" >&2
}

# --- workspace agent tooling (independent of the code index) ----------------------
setup_workspace_tools() (
  set -uo pipefail
  [ -d "$WS" ] || return 0
  # Agent identity: dreamfeed filters out the agent's own commits by this email.
  (
    cd "$WS" || exit 0
    git config user.name >/dev/null 2>&1 || git config user.name ${singleQuote(SANDBOX_GIT_USER_NAME)}
    git config user.email >/dev/null 2>&1 || git config user.email ${singleQuote(SANDBOX_GIT_USER_EMAIL)}
  )
  # A session opened before gortex's first index finishes sees the folder as
  # untracked and keeps that view; tell the agent instead of letting it guess.
  mkdir -p "$HOME/.local/bin"
  cat > "$HOME/.local/bin/t3-sandbox-gortex-hint" <<'HINT'
#!/usr/bin/env bash
[ -f "$HOME/.local/state/t3-sandbox/gortex-ready" ] && exit 0
jq -cn '{hookSpecificOutput:{hookEventName:"SessionStart",additionalContext:"gortex is still building its first index of this repository, so its MCP tools report this folder as untracked. Use normal file tools meanwhile. When ~/.local/state/t3-sandbox/gortex-ready exists, reconnect the gortex MCP server (/mcp) to use it."}}'
HINT
  chmod +x "$HOME/.local/bin/t3-sandbox-gortex-hint"
  cat > "$HOME/.local/bin/t3-sandbox-sync-hint" <<'HINT'
#!/usr/bin/env bash
jq -cn '{hookSpecificOutput:{hookEventName:"SessionStart",additionalContext:"This is a T3 Code sandbox without a network path to the git receiver. To hand committed work to the host, commit it and run t3-sync: the host then collects it into its checkout and the git receiver and prints the outcome. Uncommitted changes are not synced. Publishing to a real remote is done by the user from the host."}}'
HINT
  chmod +x "$HOME/.local/bin/t3-sandbox-sync-hint"
  if [ "$DREAMFEED_ENABLED" = 1 ] && command -v dreamfeed >/dev/null 2>&1; then
    DREAMFEED_WORKSPACE="$WS" dreamfeed init
  fi
  setup_openspec
  rc=0
  wire_agent_hooks || { echo "WARNING: agent hook wiring failed" >&2; rc=1; }
  wire_mcp_servers || { echo "WARNING: MCP wiring failed" >&2; rc=1; }
  setup_headroom_proxy
  return "$rc"
)

GORTEX_READY="$STATE_DIR/gortex-ready"
GORTEX_SETUP_PID="$STATE_DIR/gortex-setup.pid"
if [ "$GORTEX_ENABLED" = 1 ]; then
  # Fully detached and never waited on: \`gortex track\` blocks until the first
  # index is complete, which takes well over ten minutes on a large repo. The
  # marker tells the host's warm-cache save when the index is safe to snapshot.
  if [ -f "$GORTEX_SETUP_PID" ] && kill -0 "$(cat "$GORTEX_SETUP_PID")" 2>/dev/null; then
    echo "gortex setup already running (pid $(cat "$GORTEX_SETUP_PID"))."
  elif [ -f "$GORTEX_READY" ] && gortex daemon status >/dev/null 2>&1; then
    # Re-runs (re-minting a pairing link, the host's keepalive) find the index
    # built and the daemon tracking it; setting it up again only re-waits.
    echo "gortex already indexed and running."
  else
    # The marker is kept across a re-setup (after a VM restart the store is
    # still on disk and the re-track is incremental), so no second head start.
    ( trap '' HUP; setup_gortex && touch "$GORTEX_READY" ) </dev/null >"$GORTEX_LOG" 2>&1 9>&- &
    echo $! >"$GORTEX_SETUP_PID"
    disown
  fi
else
  echo "gortex is disabled for this template."
fi
setup_workspace_tools >"$TOOLS_LOG" 2>&1 &
TOOLS_PID=$!

# --- t3: start once, reuse on every later call --------------------------------------
pid_alive() {
  [ -f "$1" ] && kill -0 "$(cat "$1")" 2>/dev/null
}

if ! pid_alive "$T3_PID_FILE"; then
  rm -f "$T3_PID_FILE"
  nohup env T3CODE_TELEMETRY_ENABLED=false t3 serve --host 0.0.0.0 --port "$T3_PORT" \\
    >>"$T3_LOG" 2>&1 9>&- &
  echo $! >"$T3_PID_FILE"
  disown
fi

# The readiness probe runs on both paths: a live pid says nothing about a hung server.
ready=0
for _ in $(seq 1 30); do
  # Bounded: a server still starting can accept the connection and never
  # answer, which hung an unbounded probe (and the whole boot) indefinitely.
  if curl -fsS --connect-timeout 2 --max-time 5 "http://127.0.0.1:$T3_PORT/.well-known/t3/environment" >/dev/null 2>&1; then
    ready=1
    break
  fi
  if ! pid_alive "$T3_PID_FILE"; then
    echo "t3 serve exited during startup; last log lines:" >&2
    tail -n 20 "$T3_LOG" >&2 || true
    exit 1
  fi
  sleep 1
done
if [ "$ready" != 1 ]; then
  echo "t3 server did not become ready; last log lines:" >&2
  tail -n 20 "$T3_LOG" >&2 || true
  exit 1
fi

# Hooks must be in place before the agent's first turn. gortex is not waited
# for; it keeps indexing after this script returns.
wait "$TOOLS_PID" || echo "WARNING: workspace tooling did not finish cleanly; see $TOOLS_LOG" >&2

# Bounded head start for gortex's first index: an agent session opened while it
# runs sees the workspace as untracked until it reconnects. Stops early when the
# index is ready or the setup died; never blocks longer than GORTEX_BOOT_WAIT.
if [ "$GORTEX_ENABLED" = 1 ] && [ ! -f "$GORTEX_READY" ]; then
  echo "waiting up to \${GORTEX_BOOT_WAIT}s for gortex's first index..."
  waited=0
  while [ "$waited" -lt "$GORTEX_BOOT_WAIT" ] && [ ! -f "$GORTEX_READY" ] \\
      && kill -0 "$(cat "$GORTEX_SETUP_PID" 2>/dev/null)" 2>/dev/null; do
    sleep 2
    waited=$((waited + 2))
  done
  [ -f "$GORTEX_READY" ] && echo "gortex index ready" \\
    || echo "gortex still indexing; agents are told via the SessionStart hint"
fi

echo "t3 sandbox ready on port $T3_PORT"
`;
}
