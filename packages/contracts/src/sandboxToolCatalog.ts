import type { SandboxToolModule } from "./sandbox.ts";

/**
 * Curated tool modules a template can add with one switch. Picking one copies
 * its definition into the template, so later catalog changes never alter an
 * existing template's image. Versions are pinned; bump deliberately after
 * reading the release notes.
 *
 * Plugin installs skip CLIs the template does not install, so one module works
 * for any CLI selection. OpenCode fetches its plugins from npm when it starts,
 * hence the registry in `network`.
 */

const RTK_VERSION = "0.51.0";
const RTK_SHA256 = {
  x86_64: "5028d3b19a8f0990d30fec9fbb07e32782bc5698e618fb1861aad8a9ccba4eb5",
  aarch64: "8d6d1aad9e69b42481eda7039507d1f7ee93698f87713cecd873d287c1931632",
};
const CONTEXT_MODE_VERSION = "1.0.169";
const PONYTAIL_VERSION = "4.10.3";

/** Runs a command only when the image has the given CLI. */
const ifCli = (cli: string, command: string) =>
  `if command -v ${cli} >/dev/null 2>&1; then ${command}; fi`;

export const SANDBOX_TOOL_CATALOG: ReadonlyArray<SandboxToolModule> = [
  {
    id: "rtk",
    name: "rtk",
    description:
      "Rewrites the agent's shell commands to compact equivalents, cutting command output by 60-90%. Only Bash tool calls go through it.",
    category: "token-reduction",
    homepage: "https://github.com/rtk-ai/rtk",
    version: RTK_VERSION,
    install: [
      'case "$(uname -m)" in x86_64) target=x86_64-unknown-linux-musl; sum=' +
        RTK_SHA256.x86_64 +
        " ;; aarch64|arm64) target=aarch64-unknown-linux-gnu; sum=" +
        RTK_SHA256.aarch64 +
        ' ;; *) echo "rtk: unsupported architecture" >&2; exit 1 ;; esac',
      `curl -fsSL "https://github.com/rtk-ai/rtk/releases/download/v${RTK_VERSION}/rtk-$target.tar.gz" -o /tmp/rtk.tar.gz`,
      'echo "$sum  /tmp/rtk.tar.gz" | sha256sum -c -',
      'tar xzf /tmp/rtk.tar.gz -C "$HOME/.local/bin" rtk',
      "rm -f /tmp/rtk.tar.gz",
      "rtk --version",
      ifCli("claude", "rtk init -g --auto-patch"),
      ifCli("codex", "rtk init -g --codex"),
    ],
  },
  {
    id: "context-mode",
    name: "context-mode",
    description:
      "Keeps large tool output in a local index and hands the agent compact references, so raw data stays out of the context window.",
    category: "token-reduction",
    homepage: "https://github.com/mksglu/context-mode",
    version: CONTEXT_MODE_VERSION,
    install: [
      `npm install -g "context-mode@${CONTEXT_MODE_VERSION}"`,
      ifCli(
        "claude",
        "claude plugin marketplace add mksglu/context-mode && claude plugin install context-mode@context-mode",
      ),
    ],
    opencodePlugins: ["context-mode"],
    network: ["registry.npmjs.org"],
  },
  {
    id: "ponytail",
    name: "Ponytail",
    description:
      "A skill that makes the agent write the least code that solves the problem; fewer lines also mean fewer output tokens.",
    category: "token-reduction",
    homepage: "https://github.com/DietrichGebert/ponytail",
    version: PONYTAIL_VERSION,
    install: [
      ifCli(
        "claude",
        "claude plugin marketplace add DietrichGebert/ponytail && claude plugin install ponytail@ponytail",
      ),
      ifCli(
        "codex",
        "codex plugin marketplace add DietrichGebert/ponytail && codex plugin add ponytail@ponytail",
      ),
    ],
    opencodePlugins: ["@dietrichgebert/ponytail"],
    network: ["registry.npmjs.org"],
  },
];
