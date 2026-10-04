// @effect-diagnostics nodeBuiltinImport:off -- the syntax check pipes rendered scripts through a real bash.
import { expect, it } from "@effect/vitest";
import { SANDBOX_TOOL_CATALOG, type SandboxTemplateManifest } from "@t3tools/contracts";
import * as NodeChildProcess from "node:child_process";

import {
  DREAMFEED_FILE,
  GORTEX_INSTALLER_SHA256,
  GORTEX_VERSION,
  LATERAL_BUNDLE_FILE,
  guestBuildFiles,
  guestWorkspaceDir,
  renderDockerfile,
  renderStartScript,
  sandboxImageTag,
} from "./image.ts";
import {
  CHANNEL_FILE,
  GUEST_CHANNEL_PATH,
  HOST_CHANNEL_SCRIPT,
  SNOOPY_VERSION,
  SYNC_COMMAND_FILE,
  SYNC_COMMAND_SCRIPT,
} from "./guestChannel.ts";

const manifest = (overrides: Partial<SandboxTemplateManifest> = {}): SandboxTemplateManifest => ({
  id: "plain",
  name: "Plain",
  description: "",
  baseImage: "docker/sandbox-templates:claude-code",
  clis: [],
  gortex: false,
  env: {},
  setupCommands: [],
  ...overrides,
});

it("installs only the provider CLIs the template selects", () => {
  const dockerfile = renderDockerfile(manifest({ clis: ["codex", "opencode"] }));

  expect(dockerfile).toContain("npm install -g @openai/codex");
  expect(dockerfile).toContain("npm install -g @opencode/cli");
  expect(dockerfile).not.toContain("@anthropic-ai/claude-code");
  expect(dockerfile).not.toContain("x.ai/cli");
});

it("installs every supported CLI when the template asks for all of them", () => {
  const dockerfile = renderDockerfile(
    manifest({ clis: ["codex", "claude", "cursor", "grok", "opencode"] }),
  );

  expect(dockerfile).toContain("npm install -g @openai/codex");
  expect(dockerfile).toContain("npm install -g @anthropic-ai/claude-code");
  expect(dockerfile).toContain("curl https://cursor.com/install -fsS | bash");
  expect(dockerfile).toContain("curl -fsSL https://x.ai/cli/install.sh | bash");
  expect(dockerfile).toContain("npm install -g @opencode/cli");
});

it("links cursor-agent so the name T3 Code looks for exists", () => {
  // The installer leaves `agent`; the Cursor driver spawns `cursor-agent`.
  expect(renderDockerfile(manifest({ clis: ["cursor"] }))).toContain(
    'ln -s agent "/home/agent/.local/bin/cursor-agent"',
  );
});

it("points npm at an agent-writable prefix through the environment", () => {
  // The base image exports its own root-owned prefix, and env beats .npmrc, so
  // `npm config set prefix` silently loses and every global install EACCESes.
  const dockerfile = renderDockerfile(manifest({ clis: ["codex"] }));

  expect(dockerfile).toContain('ENV NPM_CONFIG_PREFIX="/home/agent/.npm-global"');
  expect(dockerfile).not.toContain("npm config set prefix");
  expect(dockerfile.indexOf("NPM_CONFIG_PREFIX")).toBeLessThan(
    dockerfile.indexOf("npm install -g @openai/codex"),
  );
});

it("installs each CLI in its own layer so a failure names the CLI", () => {
  const dockerfile = renderDockerfile(manifest({ clis: ["codex", "opencode"] }));

  expect(dockerfile).toContain("RUN npm install -g @openai/codex");
  expect(dockerfile).toContain("RUN npm install -g @opencode/cli");
});

it("omits gortex entirely from a plain template", () => {
  const dockerfile = renderDockerfile(manifest());
  const startScript = renderStartScript(manifest());

  expect(dockerfile).not.toContain("gortex");
  // The setup function is always rendered; the template bakes it off.
  expect(startScript).toContain("GORTEX_ENABLED=$(feature 0 gortex.enabled true)");
  expect(startScript).toContain("gortex is disabled for this template");
});

it("installs and starts gortex when the template enables it", () => {
  const dockerfile = renderDockerfile(manifest({ id: "gortex", gortex: true }));
  const startScript = renderStartScript(manifest({ id: "gortex", gortex: true }));

  expect(dockerfile).toContain("https://get.gortex.dev");
  expect(dockerfile).toContain("gortex install");
  expect(startScript).toContain("GORTEX_ENABLED=$(feature 1 gortex.enabled true)");
  expect(startScript).toContain("gortex daemon start --detach 9>&-");
  expect(startScript).toContain('gortex track "$WS"');
  expect(startScript).toContain('(cd "$WS" && gortex init)');
});

it("resolves the guest workspace through the per-project override", () => {
  const startScript = renderStartScript(manifest());

  expect(startScript).toContain('WS="${T3_SANDBOX_WORKSPACE:-$HOME/workspace}"');
  expect(startScript).toContain('CONFIG_FILE="$WS/.sandbox-config"');
});

it("never lets a long-lived process inherit the start-t3 lock", () => {
  // An inherited fd 9 holds the flock for the server's lifetime, and every
  // later start-t3 (the way to re-mint a pairing link) silently exits.
  const startScript = renderStartScript(manifest({ gortex: true, headroomProxy: true }));

  expect(startScript).toContain('exec 9>"$STATE_DIR/.lock"');
  expect(startScript).toMatch(/t3 serve --host 0\.0\.0\.0[^\n]*\\\n[^\n]*9>&- &/);
  expect(startScript).toContain("gortex daemon start --detach 9>&-");
  expect(startScript).toContain('>"$HEADROOM_LOG" 2>&1 9>&- &');
});

it("pins the gortex installer by checksum and the release by tag", () => {
  const dockerfile = renderDockerfile(manifest({ gortex: true }));

  expect(dockerfile).toContain(
    `echo "${GORTEX_INSTALLER_SHA256}  /tmp/gortex-install.sh" | sha256sum -c -`,
  );
  expect(dockerfile).toContain(`GORTEX_VERSION=${GORTEX_VERSION} sh /tmp/gortex-install.sh`);
  // The checksum is verified before the script ever runs.
  expect(dockerfile.indexOf("sha256sum -c -")).toBeLessThan(
    dockerfile.indexOf("sh /tmp/gortex-install.sh"),
  );
  expect(dockerfile).not.toMatch(/curl[^\n]*get\.gortex\.dev[^\n]*\|\s*sh/);
});

it("gives gortex's first index a bounded head start before the boot returns", () => {
  const startScript = renderStartScript(manifest({ gortex: true }));

  expect(startScript).toContain('GORTEX_BOOT_WAIT="$(cfg gortex.bootWaitSeconds 300)"');
  expect(startScript).toContain('[ "$GORTEX_BOOT_WAIT" -le 480 ] || GORTEX_BOOT_WAIT=480');
  expect(startScript).toContain('add_hook SessionStart "t3-sandbox-gortex-hint"');
});

it("bounds every HTTP probe in the start script", () => {
  // A t3 server still starting accepted a connection and never answered; an
  // unbounded curl then hung the boot for good.
  const startScript = renderStartScript(manifest({ gortex: true, headroomProxy: true }));
  const probes = startScript.split("\n").filter((line) => /\bcurl\b/.test(line));

  expect(probes.length).toBeGreaterThan(0);
  for (const probe of probes) {
    expect(probe).toMatch(/--max-time \d+/);
  }
});

it("prefers the host's copy of .sandbox-config over the clone's", () => {
  const startScript = renderStartScript(manifest());

  expect(startScript).toContain('HOST_CONFIG_FILE="$STATE_DIR/host-sandbox-config.json"');
  expect(startScript).toContain(
    'if [ -r "$HOST_CONFIG_FILE" ]; then CONFIG_FILE="$HOST_CONFIG_FILE"; else CONFIG_FILE="$WS/.sandbox-config"; fi',
  );
});

it("never blocks the boot on gortex beyond its bounded head start", () => {
  // `gortex track` blocks until the first index completes: 20k files took
  // over ten minutes and timed out the create's `sbx exec start-t3`.
  const startScript = renderStartScript(manifest({ gortex: true }));

  expect(startScript).not.toMatch(/wait "\$GORTEX/);
  expect(startScript).toContain(
    `( trap '' HUP; setup_gortex && touch "$GORTEX_READY" ) </dev/null >"$GORTEX_LOG" 2>&1 9>&- &`,
  );
  expect(startScript).toContain('GORTEX_READY="$STATE_DIR/gortex-ready"');
});

it("renders the weContain tooling layers only when the template asks for them", () => {
  const plain = renderDockerfile(manifest());
  const full = renderDockerfile(
    manifest({
      docker: true,
      dreamfeed: true,
      lateral: true,
      openspec: true,
      headroom: true,
      serena: true,
    }),
  );

  for (const marker of [
    "com.docker.sandboxes.start-docker",
    "@fission-ai/openspec@",
    "headroom-ai[mcp]==",
    "serena-agent==",
    "COPY --chown=agent:agent dreamfeed /home/agent/.local/bin/dreamfeed",
    "COPY --chown=agent:agent lateral.tar.gz",
  ]) {
    expect(plain).not.toContain(marker);
    expect(full).toContain(marker);
  }
  expect(full).toContain("UV_PYTHON_DOWNLOADS=never");
  expect(full).toContain("ln -sf /home/agent/.local/share/lateral/bin/lateral.js");
});

it("ships headroom's proxy extra only when the proxy is enabled", () => {
  expect(renderDockerfile(manifest({ headroomProxy: true }))).toContain("headroom-ai[mcp,proxy]==");
});

it("copies guest scripts in as the agent with CRLF stripped", () => {
  const dockerfile = renderDockerfile(manifest({ dreamfeed: true }));

  expect(dockerfile).toContain(
    "RUN sed -i 's/\\r$//' /home/agent/.local/bin/dreamfeed && chmod +x /home/agent/.local/bin/dreamfeed",
  );
  expect(dockerfile).toContain("COPY --chown=agent:agent start-t3 /home/agent/.local/bin/start-t3");
});

it("stages dreamfeed and lateral in the build context only when enabled", () => {
  const always = [CHANNEL_FILE, SYNC_COMMAND_FILE];
  expect([...guestBuildFiles(manifest()).keys()].sort()).toEqual(always.sort());

  const files = guestBuildFiles(manifest({ dreamfeed: true, lateral: true }));
  expect([...files.keys()].sort()).toEqual([...always, DREAMFEED_FILE, LATERAL_BUNDLE_FILE].sort());
  // gzip magic: the lateral bundle is a real tarball, not base64 text.
  expect(Array.from((files.get(LATERAL_BUNDLE_FILE) ?? new Uint8Array()).slice(0, 2))).toEqual([
    0x1f, 0x8b,
  ]);
});

it("points dreamfeed at the per-project guest workspace", () => {
  const dreamfeed = Buffer.from(
    guestBuildFiles(manifest({ dreamfeed: true })).get(DREAMFEED_FILE) ?? new Uint8Array(),
  ).toString("utf8");

  expect(dreamfeed).toContain(
    'WS="${DREAMFEED_WORKSPACE:-${T3_SANDBOX_WORKSPACE:-$HOME/workspace}}"',
  );
  expect(dreamfeed).not.toContain("\r\n");
});

it("wires dreamfeed hooks and the MCP servers from the start script", () => {
  const startScript = renderStartScript(
    manifest({ dreamfeed: true, lateral: true, headroom: true, serena: true, gortex: true }),
  );

  expect(startScript).toContain('add_hook SessionStart "dreamfeed orient"');
  expect(startScript).toContain('add_hook UserPromptSubmit "dreamfeed digest"');
  expect(startScript).not.toContain("tokenmeter");
  for (const server of ["gortex", "headroom", "serena", "lateral"]) {
    expect(startScript).toContain(`set_server ${server} `);
  }
  expect(startScript).toContain("DREAMFEED_ENABLED=$(feature 1 dreamfeed.enabled true)");
  // Scaffolding writes into the repo and the proxy sits in every model call.
  expect(startScript).toContain("OPENSPEC_ENABLED=$(feature 0 openspec.enabled false)");
  expect(startScript).toContain("HEADROOM_PROXY=$(feature 0 headroom.proxy false)");
});

it("keeps the default gortex excludes unless the template overrides them", () => {
  expect(renderStartScript(manifest({ gortex: true }))).toContain(
    "DEFAULT_GORTEX_EXCLUDE=('node_modules/' 'vendor/'",
  );
  expect(renderStartScript(manifest({ gortex: true, gortexExclude: ["huge/"] }))).toContain(
    "DEFAULT_GORTEX_EXCLUDE=('huge/')",
  );
});

it.skipIf(!hasBash())("renders start scripts bash can parse", () => {
  for (const variant of [
    manifest(),
    manifest({
      gortex: true,
      dreamfeed: true,
      lateral: true,
      openspec: true,
      headroom: true,
      headroomProxy: true,
      serena: true,
      gortexExclude: ["it's/"],
    }),
  ]) {
    const result = NodeChildProcess.spawnSync("bash", ["-n"], {
      input: renderStartScript(variant),
      encoding: "utf8",
    });
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
  }
});

it.skipIf(!hasBash())("renders guest channel scripts bash can parse", () => {
  for (const script of [HOST_CHANNEL_SCRIPT, SYNC_COMMAND_SCRIPT]) {
    const result = NodeChildProcess.spawnSync("bash", ["-n"], { input: script, encoding: "utf8" });
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
  }
});

it("ships the host channel and t3-sync root-owned in every generated image", () => {
  const dockerfile = renderDockerfile(manifest());

  expect([...guestBuildFiles(manifest()).keys()]).toEqual(
    expect.arrayContaining([CHANNEL_FILE, SYNC_COMMAND_FILE]),
  );
  expect(dockerfile).toContain(`COPY ${CHANNEL_FILE} ${GUEST_CHANNEL_PATH}`);
  expect(dockerfile).toContain(`chown root:root ${GUEST_CHANNEL_PATH}`);
  expect(dockerfile).not.toContain(`--chown=agent:agent ${CHANNEL_FILE}`);
  expect(dockerfile).toContain("printf 'sudo=%s\\ncommandLog=%s\\n' 1 0");
  // The image ends as the agent, never as root.
  expect(
    dockerfile
      .trimEnd()
      .split("\n")
      .findLast((line) => line.startsWith("USER ")),
  ).toBe("USER agent");
});

it("adds the command log and drops sudo only when the template says so", () => {
  const plain = renderDockerfile(manifest());
  expect(plain).not.toContain("snoopy");
  expect(plain).not.toContain("rm -f /etc/sudoers.d/agent");

  const locked = renderDockerfile(manifest({ commandLog: true, sudo: false }));
  expect(locked).toContain(`snoopy=${SNOOPY_VERSION}`);
  expect(locked).toContain("snoopy/install-ld-preload boolean false");
  expect(locked).toContain("> /etc/ld.so.preload");
  expect(locked).toContain("rm -f /etc/sudoers.d/agent");
  expect(locked).toContain("printf 'sudo=%s\\ncommandLog=%s\\n' 0 1");
  // The preload goes in after everything else is installed.
  expect(locked.indexOf("/etc/ld.so.preload")).toBeGreaterThan(locked.indexOf("start-t3"));
});

it("never splits a RUN instruction across raw newlines", () => {
  const dockerfile = renderDockerfile(
    manifest({ gortex: true, commandLog: true, sudo: false, dreamfeed: true, lateral: true }),
  );
  const instruction = /^(#|FROM|RUN|USER|ENV|ARG|COPY|LABEL|WORKDIR| && |$)/;
  for (const line of dockerfile.split("\n")) {
    expect(line).toMatch(instruction);
  }
});

function hasBash(): boolean {
  return NodeChildProcess.spawnSync("bash", ["--version"]).status === 0;
}

it("names the guest clone dir after the host project folder", () => {
  expect(guestWorkspaceDir("C:\\Users\\dev\\Code Repos\\my-app")).toBe("/home/agent/my-app");
  expect(guestWorkspaceDir("/home/dev/app")).toBe("/home/agent/app");
  expect(guestWorkspaceDir("C:\\")).toBe("/home/agent/workspace");
});

it("always stages the entrypoint and the host-matched t3 server", () => {
  const dockerfile = renderDockerfile(manifest());

  expect(dockerfile).toContain("ARG T3_VERSION");
  expect(dockerfile).toContain('RUN npm install -g "t3@${T3_VERSION}"');
  expect(dockerfile).toContain("COPY --chown=agent:agent start-t3 /home/agent/.local/bin/start-t3");
});

it("bakes template env and setup commands into the image", () => {
  const dockerfile = renderDockerfile(
    manifest({ env: { FOO: "bar" }, setupCommands: ["apt-get install -y jq"] }),
  );

  expect(dockerfile).toContain("ENV FOO='bar'");
  expect(dockerfile).toContain("apt-get install -y jq");
});

it("gives each template and content revision its own image tag", () => {
  const first = sandboxImageTag({
    templateId: "plain",
    version: "0.0.35",
    contentHash: "a".repeat(64),
  });
  const second = sandboxImageTag({
    templateId: "plain",
    version: "0.0.35",
    contentHash: "b".repeat(64),
  });
  const other = sandboxImageTag({
    templateId: "gortex",
    version: "0.0.35",
    contentHash: "a".repeat(64),
  });

  expect(first).not.toBe(second);
  expect(first).not.toBe(other);
  expect(first).toBe("t3-sandbox:plain-v0.0.35-aaaaaaaaaaaa");
});

it("sanitizes versions Docker tags reject", () => {
  expect(
    sandboxImageTag({ templateId: "plain", version: "1.0.0+build", contentHash: "c".repeat(64) }),
  ).toBe("t3-sandbox:plain-v1.0.0-build-cccccccccccc");
});

const customTool = {
  id: "my-mcp",
  name: "My MCP",
  description: "",
  category: "other" as const,
  install: ["npm install -g my-mcp@1.2.3"],
  boot: ["my-mcp warm-up"],
  env: { MY_MCP_MODE: "lean" },
  mcp: { command: "my-mcp", args: ["serve", "--stdio"] },
  opencodePlugins: ["my-mcp-opencode"],
};

it("installs each tool module in its own layer before the template setup commands", () => {
  const dockerfile = renderDockerfile(
    manifest({ tools: [customTool], setupCommands: ["echo setup"] }),
  );
  const tool = dockerfile.indexOf("# Tool: My MCP");
  expect(tool).toBeGreaterThan(-1);
  expect(dockerfile).toContain("ENV MY_MCP_MODE='lean'");
  expect(dockerfile).toContain("RUN npm install -g my-mcp@1.2.3");
  expect(tool).toBeLessThan(dockerfile.indexOf("# Template setup commands"));
});

it("registers a tool's MCP server and OpenCode plugins behind its own switch", () => {
  const script = renderStartScript(manifest({ tools: [customTool] }));
  expect(script).toContain("TOOL_MY_MCP_ENABLED=$(feature 1 tools.my-mcp.enabled true)");
  expect(script).toContain(
    `set_server my-mcp "$TOOL_MY_MCP_ENABLED" '{"type":"stdio","command":"my-mcp","args":["serve","--stdio"],"env":{}}'`,
  );
  expect(script).toContain(`--argjson p '["my-mcp-opencode"]'`);
  expect(script).toContain(`[ "$TOOL_MY_MCP_ENABLED" = 1 ] && { bash -c 'my-mcp warm-up'`);
});

it.skipIf(!hasBash())("renders a start script with tool modules that bash can parse", () => {
  const result = NodeChildProcess.spawnSync("bash", ["-n"], {
    input: renderStartScript(
      manifest({
        tools: [
          ...SANDBOX_TOOL_CATALOG,
          { ...customTool, boot: ["echo 'quoted' \"twice\" $HOME"] },
        ],
      }),
    ),
    encoding: "utf8",
  });
  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
});

it.skipIf(!hasBash())("renders catalog install layers bash can parse", () => {
  for (const tool of SANDBOX_TOOL_CATALOG) {
    const result = NodeChildProcess.spawnSync("bash", ["-n"], {
      input: tool.install.join(" && "),
      encoding: "utf8",
    });
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
  }
});
