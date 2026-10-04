import * as Schema from "effect/Schema";
import { EnvironmentId, ProjectId, ThreadId, TrimmedNonEmptyString } from "./baseSchemas.ts";

export const SandboxName = TrimmedNonEmptyString.check(
  Schema.isPattern(/^[a-z0-9][a-z0-9-]{2,47}$/),
).annotate({ identifier: "SandboxName" });
export type SandboxName = typeof SandboxName.Type;

export const SandboxStatus = Schema.Literals([
  "creating",
  "running",
  "stopped",
  "error",
  "removing",
]);
export type SandboxStatus = typeof SandboxStatus.Type;

/**
 * Provider CLIs a template can install. These mirror the provider driver kinds
 * the host app supports, so a sandbox can run any agent the host can.
 */
export const SandboxCliId = Schema.Literals(["codex", "claude", "cursor", "grok", "opencode"]);
export type SandboxCliId = typeof SandboxCliId.Type;

export const SANDBOX_CLI_IDS: ReadonlyArray<SandboxCliId> = [
  "codex",
  "claude",
  "cursor",
  "grok",
  "opencode",
];

export const SandboxTemplateId = TrimmedNonEmptyString.check(
  Schema.isPattern(/^[a-z0-9][a-z0-9-]{1,39}$/),
).annotate({ identifier: "SandboxTemplateId" });
export type SandboxTemplateId = typeof SandboxTemplateId.Type;

/** Ids of the templates the server seeds and refuses to delete. */
export const BUILTIN_SANDBOX_TEMPLATE_IDS = ["plain", "gortex", "wecontain"] as const;
export const DEFAULT_SANDBOX_TEMPLATE_ID = "plain";

/**
 * One host for an `sbx policy` network rule: a lowercase domain (optionally
 * `*.` / `**.` for subdomains), or an IPv4 address, with an optional port.
 * At least one dot is required, so catch-alls (`*`, `**`) and bare names such
 * as `localhost` can never be written from here.
 */
export const SANDBOX_NETWORK_RESOURCE_PATTERN =
  /^(\*{1,2}\.)?([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(:[0-9]{1,5})?$/;

export const SandboxNetworkResource = TrimmedNonEmptyString.check(
  Schema.isPattern(SANDBOX_NETWORK_RESOURCE_PATTERN),
).annotate({ identifier: "SandboxNetworkResource" });
export type SandboxNetworkResource = typeof SandboxNetworkResource.Type;

/**
 * A tool a template adds to the sandbox, as data: how it is installed when the
 * image is built, what runs on every boot, and how agents reach it. Templates
 * carry the full definition, so an exported bundle builds the same sandbox
 * elsewhere. Curated definitions live in SANDBOX_TOOL_CATALOG; a template may
 * also carry its own.
 */
export const SandboxToolModuleId = TrimmedNonEmptyString.check(
  Schema.isPattern(/^[a-z0-9][a-z0-9-]{1,39}$/),
).annotate({ identifier: "SandboxToolModuleId" });
export type SandboxToolModuleId = typeof SandboxToolModuleId.Type;

export const SandboxToolCategory = Schema.Literals([
  "token-reduction",
  "code-intelligence",
  "workflow",
  "other",
]);
export type SandboxToolCategory = typeof SandboxToolCategory.Type;

/** A stdio MCP server, registered for Claude Code and OpenCode on every boot. */
export const SandboxToolMcpServer = Schema.Struct({
  command: TrimmedNonEmptyString,
  args: Schema.Array(Schema.String),
  env: Schema.optional(Schema.Record(Schema.String, Schema.String)),
});
export type SandboxToolMcpServer = typeof SandboxToolMcpServer.Type;

export const SandboxToolModule = Schema.Struct({
  id: SandboxToolModuleId,
  name: TrimmedNonEmptyString,
  description: Schema.String,
  category: SandboxToolCategory,
  homepage: Schema.optional(TrimmedNonEmptyString),
  /** Shown to the user; the install commands decide what is really installed. */
  version: Schema.optional(TrimmedNonEmptyString),
  /** Shell commands run as the agent when the image is built, one RUN layer. */
  install: Schema.Array(Schema.String),
  /** Shell commands run on every boot before agents start; failures only warn. */
  boot: Schema.optional(Schema.Array(Schema.String)),
  /** Environment baked into the image. */
  env: Schema.optional(Schema.Record(Schema.String, Schema.String)),
  /** Hosts the tool must reach at runtime, allowed for each sandbox built with it. */
  network: Schema.optional(Schema.Array(SandboxNetworkResource)),
  mcp: Schema.optional(SandboxToolMcpServer),
  /** OpenCode 2 plugins (`plugins` in ~/.config/opencode/opencode.json). */
  opencodePlugins: Schema.optional(Schema.Array(TrimmedNonEmptyString)),
});
export type SandboxToolModule = typeof SandboxToolModule.Type;

/**
 * The declarative part of a template bundle (`template.json`). The Dockerfile
 * is generated from this unless the bundle ships its own, which lets simple
 * templates stay data and complex ones drop to raw Docker.
 */
export const SandboxTemplateManifest = Schema.Struct({
  id: SandboxTemplateId,
  name: TrimmedNonEmptyString,
  description: Schema.String,
  /** Docker base image the sandbox is built from. */
  baseImage: TrimmedNonEmptyString,
  /** Provider CLIs to install in the image. */
  clis: Schema.Array(SandboxCliId),
  /** Install and start the gortex code-intelligence daemon. */
  gortex: Schema.Boolean,
  /** Extra environment baked into the image. */
  env: Schema.Record(Schema.String, Schema.String),
  /** Extra RUN lines appended after the CLI installs. */
  setupCommands: Schema.Array(Schema.String),
  // Guest tooling ported from weContain. Every key is optional so bundles
  // written before these existed keep decoding; an omitted key means off.
  /** Start a private dockerd in the sandbox. Needs a `*-docker` base image. */
  docker: Schema.optional(Schema.Boolean),
  /** Inject repo changes the agent did not make into each turn (dreamfeed). */
  dreamfeed: Schema.optional(Schema.Boolean),
  /** Ship the lateral goal-loop engine and wire it as an MCP server. */
  lateral: Schema.optional(Schema.Boolean),
  /** Install openspec; scaffolding stays opt-in per project via `.sandbox-config`. */
  openspec: Schema.optional(Schema.Boolean),
  /** Install the headroom tool-output compression MCP server. */
  headroom: Schema.optional(Schema.Boolean),
  /** Also ship headroom's transparent proxy (large); started only on opt-in. */
  headroomProxy: Schema.optional(Schema.Boolean),
  /** Install the serena LSP symbol-navigation MCP server. */
  serena: Schema.optional(Schema.Boolean),
  /** gitignore-style patterns kept out of the gortex index. Omitted: built-in list. */
  gortexExclude: Schema.optional(Schema.Array(Schema.String)),
  /**
   * Log every program the sandbox runs (snoopy) and stream it to the host.
   * Best effort: the lines are written from inside the sandbox, so they can be
   * forged or switched off by whoever controls it.
   */
  commandLog: Schema.optional(Schema.Boolean),
  /** Passwordless sudo for the agent. Omitted means on (the sbx default). */
  sudo: Schema.optional(Schema.Boolean),
  /** Tool modules, installed in this order. Omitted means none. */
  tools: Schema.optional(Schema.Array(SandboxToolModule)),
});
export type SandboxTemplateManifest = typeof SandboxTemplateManifest.Type;

export const SandboxTemplateFile = Schema.Struct({
  path: TrimmedNonEmptyString,
  byteLength: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
});
export type SandboxTemplateFile = typeof SandboxTemplateFile.Type;

export const SandboxTemplate = Schema.Struct({
  manifest: SandboxTemplateManifest,
  /** Seeded by the server; cannot be deleted or overwritten in place. */
  builtin: Schema.Boolean,
  /** Effective Dockerfile: the bundle's own, or the one generated from the manifest. */
  dockerfile: Schema.String,
  /** True when the bundle ships a hand-written Dockerfile instead of a generated one. */
  customDockerfile: Schema.Boolean,
  /** Extra files carried by the bundle, excluding template.json and Dockerfile. */
  files: Schema.Array(SandboxTemplateFile),
  updatedAt: Schema.String,
});
export type SandboxTemplate = typeof SandboxTemplate.Type;

const PRIVATE_IPV4_PATTERN =
  /^(0|10|127|169\.254|172\.(1[6-9]|2[0-9]|3[01])|192\.168)\.[0-9.]*(:[0-9]+)?$/;

/**
 * Why allowing this resource reaches past the internet into the host or the
 * local network, or null for an ordinary public host. Allows with a warning
 * need an explicit confirmation and are never taken from a project file.
 */
export function sandboxNetworkResourceRisk(resource: string): string | null {
  const host = resource.replace(/:[0-9]+$/, "");
  if (PRIVATE_IPV4_PATTERN.test(resource)) {
    return "a private or loopback address: this reaches the host or the local network";
  }
  if (/(^|\.)(internal|local|localhost|lan|home\.arpa)$/.test(host)) {
    return "a host-internal name: this can reach services running on the host";
  }
  if (/^\*{1,2}\.[a-z0-9-]+$/.test(host)) {
    return "a whole top-level domain";
  }
  return null;
}

/**
 * Per-sandbox knobs from weContain's `create-sandbox.sh`. Anything omitted
 * falls back to the project's committed `.sandbox-config`, then to sbx defaults.
 */
export const SandboxCreateOptions = Schema.Struct({
  /** Memory ceiling passed to `sbx create -m`, for example `8g`. */
  memory: Schema.optional(
    TrimmedNonEmptyString.check(Schema.isPattern(/^[0-9]+(\.[0-9]+)?[a-zA-Z]{0,3}$/)),
  ),
  cpus: Schema.optional(Schema.Number.check(Schema.isGreaterThan(0))),
  /**
   * Hosts allowed out for this sandbox only, on top of the global sbx policy.
   * Everything else follows the global policy (`sbx policy ls`).
   */
  allowHosts: Schema.optional(Schema.Array(SandboxNetworkResource)),
  /** Hosts blocked for this sandbox only. Deny always wins over allow in sbx. */
  denyHosts: Schema.optional(Schema.Array(SandboxNetworkResource)),
  /** Patterns written to the clone's `.git/info/exclude`, never committed. */
  syncIgnore: Schema.optional(Schema.Array(TrimmedNonEmptyString)),
  /** Tracked files frozen with `git update-index --skip-worktree`. */
  skipWorktree: Schema.optional(Schema.Array(TrimmedNonEmptyString)),
  /** Restore and save the gortex index between sandboxes of this folder. */
  warmCache: Schema.optional(Schema.Boolean),
});
export type SandboxCreateOptions = typeof SandboxCreateOptions.Type;

export const SandboxInfo = Schema.Struct({
  sandboxId: TrimmedNonEmptyString,
  name: SandboxName,
  projectId: ProjectId,
  /** Thread that first created the sandbox. Kept for provenance only. */
  createdByThreadId: ThreadId,
  /** Every thread currently attached to this sandbox. */
  threadIds: Schema.Array(ThreadId),
  /** Host folder this sandbox mirrors. Sandboxes are keyed by this, not by thread. */
  projectCwd: TrimmedNonEmptyString,
  templateId: SandboxTemplateId,
  status: SandboxStatus,
  image: TrimmedNonEmptyString,
  /** Port the sandbox t3 server is published on, on the host loopback. */
  hostPort: Schema.NullOr(Schema.Int.check(Schema.isGreaterThan(0))),
  /** One-time pairing link for attaching the sandbox t3 server as a remote environment. */
  pairingUrl: Schema.NullOr(Schema.String),
  /**
   * Where the project clone lives inside the guest. Named after the project
   * for new sandboxes; absent on records created before per-project dirs, so
   * those keep resolving to the legacy guest workspace dir.
   */
  workspaceDir: Schema.NullOr(Schema.String),
  branch: Schema.NullOr(TrimmedNonEmptyString),
  message: Schema.NullOr(Schema.String),
  /** Effective create options, after `.sandbox-config` defaults were applied. */
  options: Schema.optional(SandboxCreateOptions),
  /**
   * Environment id of the sandbox's own t3 server, read once when the fresh
   * image first boots and never refreshed from the guest afterwards: this host
   * record, not the (untrusted) guest, is what marks a connection as a sandbox.
   */
  environmentId: Schema.optional(EnvironmentId),
  createdAt: Schema.String,
  updatedAt: Schema.String,
});
export type SandboxInfo = typeof SandboxInfo.Type;

export const SandboxListInput = Schema.Struct({});
export type SandboxListInput = typeof SandboxListInput.Type;

export const SandboxListResult = Schema.Struct({
  sandboxes: Schema.Array(SandboxInfo),
});
export type SandboxListResult = typeof SandboxListResult.Type;

export const SandboxCreateInput = Schema.Struct({
  projectId: ProjectId,
  threadId: ThreadId,
  projectCwd: TrimmedNonEmptyString,
  /** Template to build from. Falls back to the configured default template. */
  templateId: Schema.optional(SandboxTemplateId),
  /**
   * Attach this thread to an existing sandbox instead of creating one. The
   * client offers this when the folder already has a live sandbox; without it
   * a fresh sandbox is always created, so reuse is never silent.
   */
  attachSandboxId: Schema.optional(TrimmedNonEmptyString),
  options: Schema.optional(SandboxCreateOptions),
});
export type SandboxCreateInput = typeof SandboxCreateInput.Type;

export const SandboxCreateResult = SandboxInfo;
export type SandboxCreateResult = typeof SandboxCreateResult.Type;

export const SandboxTargetInput = Schema.Struct({
  sandboxId: TrimmedNonEmptyString,
});
export type SandboxTargetInput = typeof SandboxTargetInput.Type;

export const SandboxAttachInput = Schema.Struct({
  sandboxId: TrimmedNonEmptyString,
  threadId: ThreadId,
});
export type SandboxAttachInput = typeof SandboxAttachInput.Type;

export const SandboxAttachResult = SandboxInfo;
export type SandboxAttachResult = typeof SandboxAttachResult.Type;

export const SandboxDetachResult = SandboxInfo;
export type SandboxDetachResult = typeof SandboxDetachResult.Type;

export const SandboxStopResult = SandboxInfo;
export type SandboxStopResult = typeof SandboxStopResult.Type;

export const SandboxRemoveResult = Schema.Struct({
  sandboxId: TrimmedNonEmptyString,
});
export type SandboxRemoveResult = typeof SandboxRemoveResult.Type;

// ---- creation progress -------------------------------------------------------

/**
 * Ordered initialization steps of a sandbox create. The client renders these as
 * a pipeline, so the list is fixed and every step reaches a terminal status.
 */
export const SandboxCreateStep = Schema.Literals([
  "availability",
  "template",
  "image",
  "receiver",
  "sandbox",
  "network",
  "workspace",
  "cache",
  "ports",
  "boot",
  "ready",
]);
export type SandboxCreateStep = typeof SandboxCreateStep.Type;

export const SANDBOX_CREATE_STEPS: ReadonlyArray<SandboxCreateStep> = [
  "availability",
  "template",
  "image",
  "receiver",
  "sandbox",
  "network",
  "workspace",
  "cache",
  "ports",
  "boot",
  "ready",
];

export const SANDBOX_CREATE_STEP_LABELS: Record<SandboxCreateStep, string> = {
  availability: "Check Docker",
  template: "Resolve template",
  image: "Build image",
  receiver: "Start git receiver",
  sandbox: "Create sandbox",
  network: "Apply egress policy",
  workspace: "Attach workspace",
  cache: "Restore gortex index",
  ports: "Publish port",
  boot: "Boot t3 server",
  ready: "Wait for ready",
};

export const SandboxCreateStepStatus = Schema.Literals([
  "pending",
  "running",
  "done",
  "skipped",
  "failed",
]);
export type SandboxCreateStepStatus = typeof SandboxCreateStepStatus.Type;

export const SandboxCreateProgress = Schema.Struct({
  step: SandboxCreateStep,
  status: SandboxCreateStepStatus,
  /** Human-readable detail for the step, for example the current docker build line. */
  detail: Schema.NullOr(Schema.String),
  /** Set on the final event of a successful run. */
  sandbox: Schema.NullOr(SandboxInfo),
});
export type SandboxCreateProgress = typeof SandboxCreateProgress.Type;

// ---- templates ---------------------------------------------------------------

export const SandboxTemplateListInput = Schema.Struct({});
export type SandboxTemplateListInput = typeof SandboxTemplateListInput.Type;

export const SandboxTemplateListResult = Schema.Struct({
  templates: Schema.Array(SandboxTemplate),
  defaultTemplateId: SandboxTemplateId,
});
export type SandboxTemplateListResult = typeof SandboxTemplateListResult.Type;

export const SandboxTemplateSaveInput = Schema.Struct({
  manifest: SandboxTemplateManifest,
  /**
   * Raw Dockerfile to store with the bundle. Omit to keep the Dockerfile
   * generated from the manifest, which is what the form editor does.
   */
  dockerfile: Schema.optional(Schema.String),
});
export type SandboxTemplateSaveInput = typeof SandboxTemplateSaveInput.Type;

export const SandboxTemplateSaveResult = SandboxTemplate;
export type SandboxTemplateSaveResult = typeof SandboxTemplateSaveResult.Type;

export const SandboxTemplateTargetInput = Schema.Struct({
  templateId: SandboxTemplateId,
});
export type SandboxTemplateTargetInput = typeof SandboxTemplateTargetInput.Type;

export const SandboxTemplateDeleteResult = Schema.Struct({
  templateId: SandboxTemplateId,
  defaultTemplateId: SandboxTemplateId,
});
export type SandboxTemplateDeleteResult = typeof SandboxTemplateDeleteResult.Type;

export const SandboxTemplateSetDefaultResult = Schema.Struct({
  defaultTemplateId: SandboxTemplateId,
});
export type SandboxTemplateSetDefaultResult = typeof SandboxTemplateSetDefaultResult.Type;

export const SandboxTemplateExportResult = Schema.Struct({
  templateId: SandboxTemplateId,
  /** Suggested download name, for example `gortex.t3sandbox.tgz`. */
  fileName: TrimmedNonEmptyString,
  /** base64-encoded gzipped tarball of the template folder. */
  contentBase64: Schema.String,
});
export type SandboxTemplateExportResult = typeof SandboxTemplateExportResult.Type;

export const SandboxTemplateImportInput = Schema.Struct({
  fileName: TrimmedNonEmptyString,
  contentBase64: Schema.String,
  /** Replace an existing template with the same id instead of failing. */
  overwrite: Schema.optional(Schema.Boolean),
});
export type SandboxTemplateImportInput = typeof SandboxTemplateImportInput.Type;

export const SandboxTemplateImportResult = SandboxTemplate;
export type SandboxTemplateImportResult = typeof SandboxTemplateImportResult.Type;

export const SandboxTemplateValidateInput = SandboxTemplateSaveInput;
export type SandboxTemplateValidateInput = typeof SandboxTemplateValidateInput.Type;

export const SandboxTemplateIssue = Schema.Struct({
  severity: Schema.Literals(["error", "warning"]),
  /** Manifest field the issue belongs to, or null for whole-bundle issues. */
  field: Schema.NullOr(Schema.String),
  message: Schema.String,
});
export type SandboxTemplateIssue = typeof SandboxTemplateIssue.Type;

export const SandboxTemplateValidateResult = Schema.Struct({
  valid: Schema.Boolean,
  issues: Schema.Array(SandboxTemplateIssue),
});
export type SandboxTemplateValidateResult = typeof SandboxTemplateValidateResult.Type;

/** A changed file that host tools act on by themselves, and why that matters. */
export const SandboxHostRiskPath = Schema.Struct({
  path: Schema.String,
  reason: Schema.String,
});
export type SandboxHostRiskPath = typeof SandboxHostRiskPath.Type;

export const SandboxSyncToHostInput = Schema.Struct({
  sandboxId: TrimmedNonEmptyString,
  commitMessage: Schema.optional(TrimmedNonEmptyString),
});
export type SandboxSyncToHostInput = typeof SandboxSyncToHostInput.Type;

export const SandboxSyncToHostResult = Schema.Struct({
  sandboxId: TrimmedNonEmptyString,
  /** Local branch the sandbox work was integrated into. */
  branch: TrimmedNonEmptyString,
  /** Number of new commits pulled from the sandbox. */
  commitCount: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  /** First line of each new commit, oldest first. */
  commitSubjects: Schema.Array(Schema.String),
  /** Whether the collected work was mirrored into the docker git receiver. */
  mirroredToReceiver: Schema.Boolean,
  /** Files in the new work that host tools act on by themselves; review before checkout. */
  hostRiskPaths: Schema.optional(Schema.Array(SandboxHostRiskPath)),
});
export type SandboxSyncToHostResult = typeof SandboxSyncToHostResult.Type;

export const SandboxSyncToRemoteInput = Schema.Struct({
  sandboxId: TrimmedNonEmptyString,
  remoteName: Schema.optional(TrimmedNonEmptyString),
});
export type SandboxSyncToRemoteInput = typeof SandboxSyncToRemoteInput.Type;

export const SandboxSyncToRemoteResult = Schema.Struct({
  sandboxId: TrimmedNonEmptyString,
  branch: TrimmedNonEmptyString,
  remoteName: TrimmedNonEmptyString,
  pushedCommitCount: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
});
export type SandboxSyncToRemoteResult = typeof SandboxSyncToRemoteResult.Type;

// ---- receiver → remote transfer ----------------------------------------------
// Moves the work mirrored in the docker git receiver to a git remote. The
// preview is what the user reviews; the push must name the exact receiver
// commit it previewed, so nothing unseen is ever published.

export const SandboxGitIdentity = Schema.Struct({
  name: TrimmedNonEmptyString.check(Schema.isPattern(/^[^<>\n]+$/)),
  email: TrimmedNonEmptyString.check(Schema.isPattern(/^[^\s<>@]+@[^\s<>@]+$/)),
});
export type SandboxGitIdentity = typeof SandboxGitIdentity.Type;

/** Branch names are re-checked with `git check-ref-format` on the server. */
const SandboxBranchName = TrimmedNonEmptyString.check(
  Schema.isPattern(/^(?!-)[A-Za-z0-9._/-]{1,200}$/),
);

export const SandboxGitRemote = Schema.Struct({
  name: TrimmedNonEmptyString,
  url: Schema.String,
});
export type SandboxGitRemote = typeof SandboxGitRemote.Type;

export const SandboxRemoteCommit = Schema.Struct({
  sha: TrimmedNonEmptyString,
  subject: Schema.String,
  authorName: Schema.String,
  authorEmail: Schema.String,
  authoredAt: Schema.String,
  parentCount: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
});
export type SandboxRemoteCommit = typeof SandboxRemoteCommit.Type;

export const SandboxRemoteFileChange = Schema.Struct({
  path: Schema.String,
  /** Git's one-letter status: A, M, D, R, C, T. */
  status: Schema.String,
  /** Null for binary files, which git reports without line counts. */
  additions: Schema.NullOr(Schema.Int),
  deletions: Schema.NullOr(Schema.Int),
  /**
   * Set when host tools act on this file by themselves (agent hooks, editor
   * tasks, npm scripts, CI, ...): the reason it deserves review before the
   * work reaches a checkout on the host.
   */
  hostRisk: Schema.NullOr(Schema.String),
});
export type SandboxRemoteFileChange = typeof SandboxRemoteFileChange.Type;

export const SandboxRemoteRelation = Schema.Literals([
  "new-branch",
  "fast-forward",
  "up-to-date",
  "diverged",
]);
export type SandboxRemoteRelation = typeof SandboxRemoteRelation.Type;

export const SandboxRemotePreviewInput = Schema.Struct({
  sandboxId: TrimmedNonEmptyString,
  /** Defaults to `origin`, else the first configured remote. */
  remoteName: Schema.optional(TrimmedNonEmptyString),
  /** Defaults to `sandbox/<name>`. */
  targetBranch: Schema.optional(SandboxBranchName),
});
export type SandboxRemotePreviewInput = typeof SandboxRemotePreviewInput.Type;

export const SandboxRemotePreviewResult = Schema.Struct({
  sandboxId: TrimmedNonEmptyString,
  /** Commit at the tip of the receiver's `work` branch. */
  sourceSha: TrimmedNonEmptyString,
  remotes: Schema.Array(SandboxGitRemote),
  remoteName: TrimmedNonEmptyString,
  targetBranch: TrimmedNonEmptyString,
  /** Current tip of the target branch on the remote; null when it does not exist yet. */
  remoteSha: Schema.NullOr(Schema.String),
  relation: SandboxRemoteRelation,
  /** Commits that would be published, oldest first. */
  commits: Schema.Array(SandboxRemoteCommit),
  /** True when more commits exist than the preview lists. */
  commitsTruncated: Schema.Boolean,
  files: Schema.Array(SandboxRemoteFileChange),
  additions: Schema.Int,
  deletions: Schema.Int,
  /** `user.name` / `user.email` of the host project checkout, when configured. */
  hostIdentity: Schema.NullOr(SandboxGitIdentity),
});
export type SandboxRemotePreviewResult = typeof SandboxRemotePreviewResult.Type;

/**
 * Who the published commits name as author and committer:
 * - `keep`: the sandbox's own commits, unchanged (normally `sandbox-agent`)
 * - `host`: the host checkout's `user.name` / `user.email`
 * - `custom`: the identity given in `author`
 */
export const SandboxRemoteAuthorMode = Schema.Literals(["keep", "host", "custom"]);
export type SandboxRemoteAuthorMode = typeof SandboxRemoteAuthorMode.Type;

export const SandboxRemotePushInput = Schema.Struct({
  sandboxId: TrimmedNonEmptyString,
  remoteName: TrimmedNonEmptyString,
  targetBranch: SandboxBranchName,
  /** The receiver commit the user previewed. A moved receiver aborts the push. */
  expectedSourceSha: TrimmedNonEmptyString,
  authorMode: SandboxRemoteAuthorMode,
  /** Required for `custom`. */
  author: Schema.optional(SandboxGitIdentity),
  /** Publish one commit carrying the final tree instead of the individual commits. */
  squash: Schema.Boolean,
  /** Message of the squashed commit. Defaults to a summary of the commit subjects. */
  squashMessage: Schema.optional(Schema.String),
  /** Credit the original sandbox author(s) with `Co-authored-by:` trailers when rewriting. */
  coAuthorTrailer: Schema.optional(Schema.Boolean),
  /** Allow replacing a diverged remote branch (`--force-with-lease` on the previewed tip). */
  force: Schema.optional(Schema.Boolean),
});
export type SandboxRemotePushInput = typeof SandboxRemotePushInput.Type;

export const SandboxRemotePushResult = Schema.Struct({
  sandboxId: TrimmedNonEmptyString,
  remoteName: TrimmedNonEmptyString,
  targetBranch: TrimmedNonEmptyString,
  pushedSha: TrimmedNonEmptyString,
  previousRemoteSha: Schema.NullOr(Schema.String),
  pushedCommitCount: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  /** True when commits were re-created with a different author or squashed. */
  rewritten: Schema.Boolean,
  forced: Schema.Boolean,
});
export type SandboxRemotePushResult = typeof SandboxRemotePushResult.Type;

// ---- network policy ------------------------------------------------------------

export const SandboxPolicyDecision = Schema.Literals(["allow", "deny"]);
export type SandboxPolicyDecision = typeof SandboxPolicyDecision.Type;

/** One rule of the sbx network policy, global or scoped to a single sandbox. */
export const SandboxPolicyRule = Schema.Struct({
  ruleId: TrimmedNonEmptyString,
  name: Schema.String,
  decision: SandboxPolicyDecision,
  resources: Schema.Array(Schema.String),
  /** Null for a global rule. */
  sandboxName: Schema.NullOr(Schema.String),
  /** Set when the scoped sandbox is one this app manages. */
  sandboxId: Schema.NullOr(Schema.String),
  /** Built-in groups (sbx defaults, agent kits) are shown but never removed from here. */
  removable: Schema.Boolean,
});
export type SandboxPolicyRule = typeof SandboxPolicyRule.Type;

/** A host the sbx proxy let through or blocked, aggregated per sandbox. */
export const SandboxNetworkEvent = Schema.Struct({
  sandboxName: Schema.String,
  sandboxId: Schema.NullOr(Schema.String),
  host: Schema.String,
  outcome: Schema.Literals(["allowed", "blocked"]),
  reason: Schema.NullOr(Schema.String),
  rule: Schema.NullOr(Schema.String),
  firstSeen: Schema.String,
  lastSeen: Schema.String,
  count: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
});
export type SandboxNetworkEvent = typeof SandboxNetworkEvent.Type;

export const SandboxNetworkOverviewInput = Schema.Struct({});
export type SandboxNetworkOverviewInput = typeof SandboxNetworkOverviewInput.Type;

export const SandboxNetworkOverviewResult = Schema.Struct({
  rules: Schema.Array(SandboxPolicyRule),
  events: Schema.Array(SandboxNetworkEvent),
});
export type SandboxNetworkOverviewResult = typeof SandboxNetworkOverviewResult.Type;

export const SandboxPolicyAddRuleInput = Schema.Struct({
  decision: SandboxPolicyDecision,
  resources: Schema.Array(SandboxNetworkResource).check(
    Schema.isMinLength(1),
    Schema.isMaxLength(50),
  ),
  /** Scope the rule to this sandbox; absent adds it to the global policy. */
  sandboxId: Schema.optional(TrimmedNonEmptyString),
  /** Required to allow a resource `sandboxNetworkResourceRisk` warns about. */
  acknowledgeRisk: Schema.optional(Schema.Boolean),
});
export type SandboxPolicyAddRuleInput = typeof SandboxPolicyAddRuleInput.Type;

export const SandboxPolicyRemoveRuleInput = Schema.Struct({
  ruleId: TrimmedNonEmptyString,
});
export type SandboxPolicyRemoveRuleInput = typeof SandboxPolicyRemoveRuleInput.Type;

// ---- activity (sync, pushes, command log) ----------------------------------------

/** One exec from the sandbox's command log. Written inside the sandbox: forgeable. */
export const SandboxCommandRecord = Schema.Struct({
  uid: Schema.Int,
  pid: Schema.Int,
  ppid: Schema.Int,
  cwd: Schema.String,
  cmdline: Schema.String,
});
export type SandboxCommandRecord = typeof SandboxCommandRecord.Type;

export const SandboxActivityKind = Schema.Literals([
  /** A program the sandbox ran (command log). */
  "command",
  /** Sandbox work collected into the host checkout and the git receiver. */
  "sync",
  /** Receiver work published to a git remote. */
  "remote-push",
  /** The host channel connected, dropped or reported its state. */
  "channel",
  /** The channel saw its safeguards changed from inside the sandbox. */
  "tamper",
  /** A network rule added or removed for this sandbox. */
  "policy",
]);
export type SandboxActivityKind = typeof SandboxActivityKind.Type;

export const SandboxActivityEvent = Schema.Struct({
  id: TrimmedNonEmptyString,
  sandboxId: Schema.String,
  sandboxName: Schema.String,
  at: Schema.String,
  kind: SandboxActivityKind,
  /** Who started it: the agent (t3-sync), the user (UI) or the host itself. */
  source: Schema.Literals(["agent", "user", "host"]),
  ok: Schema.Boolean,
  summary: Schema.String,
  /** Where work went: `receiver`, a host branch, or `remote/branch`. */
  target: Schema.optional(Schema.String),
  command: Schema.optional(SandboxCommandRecord),
  /** Evaluation rules a command tripped (privilege, download-exec, ...). */
  flags: Schema.Array(Schema.String),
});
export type SandboxActivityEvent = typeof SandboxActivityEvent.Type;

/** Live state of the root channel the host holds into each running sandbox. */
export const SandboxChannelStatus = Schema.Struct({
  sandboxId: Schema.String,
  connected: Schema.Boolean,
  /** False for images without the channel (custom Dockerfiles). */
  supported: Schema.Boolean,
  sudo: Schema.Boolean,
  commandLog: Schema.Boolean,
  /** Safeguards currently reported as changed from inside the sandbox. */
  tamper: Schema.Array(Schema.String),
  since: Schema.NullOr(Schema.String),
});
export type SandboxChannelStatus = typeof SandboxChannelStatus.Type;

export const SandboxActivityInput = Schema.Struct({
  sandboxId: Schema.optional(TrimmedNonEmptyString),
  kinds: Schema.optional(Schema.Array(SandboxActivityKind)),
  /** Only commands that tripped an evaluation rule. */
  flaggedOnly: Schema.optional(Schema.Boolean),
  limit: Schema.optional(
    Schema.Int.check(Schema.isGreaterThanOrEqualTo(1), Schema.isLessThanOrEqualTo(5000)),
  ),
});
export type SandboxActivityInput = typeof SandboxActivityInput.Type;

export const SandboxActivityResult = Schema.Struct({
  /** Newest first. */
  events: Schema.Array(SandboxActivityEvent),
  channels: Schema.Array(SandboxChannelStatus),
  /**
   * Whether Docker and the sbx CLI answer right now. Every sandbox action
   * needs both; absent from servers that predate it.
   */
  docker: Schema.optional(
    Schema.Struct({ available: Schema.Boolean, reason: Schema.NullOr(Schema.String) }),
  ),
});
export type SandboxActivityResult = typeof SandboxActivityResult.Type;

export class SandboxUnavailableError extends Schema.TaggedError<SandboxUnavailableError>()(
  "SandboxUnavailableError",
  {
    reason: Schema.String,
  },
) {
  override get message() {
    return `Docker sandboxes are not available: ${this.reason}`;
  }
}

export class SandboxNotFoundError extends Schema.TaggedError<SandboxNotFoundError>()(
  "SandboxNotFoundError",
  {
    sandboxId: Schema.String,
  },
) {
  override get message() {
    return `Unknown sandbox: ${this.sandboxId}`;
  }
}

export class SandboxTemplateNotFoundError extends Schema.TaggedError<SandboxTemplateNotFoundError>()(
  "SandboxTemplateNotFoundError",
  {
    templateId: Schema.String,
  },
) {
  override get message() {
    return `Unknown sandbox template: ${this.templateId}`;
  }
}

export class SandboxTemplateInvalidError extends Schema.TaggedError<SandboxTemplateInvalidError>()(
  "SandboxTemplateInvalidError",
  {
    templateId: Schema.String,
    issues: Schema.Array(SandboxTemplateIssue),
  },
) {
  override get message() {
    const summary = this.issues
      .filter((issue) => issue.severity === "error")
      .map((issue) => (issue.field === null ? issue.message : `${issue.field}: ${issue.message}`))
      .join("; ");
    return `Sandbox template ${this.templateId} is invalid: ${summary || "unknown reason"}`;
  }
}

export class SandboxTemplateReadOnlyError extends Schema.TaggedError<SandboxTemplateReadOnlyError>()(
  "SandboxTemplateReadOnlyError",
  {
    templateId: Schema.String,
  },
) {
  override get message() {
    return `Sandbox template ${this.templateId} is built in and cannot be modified or deleted. Duplicate it instead.`;
  }
}

export class SandboxCommandError extends Schema.TaggedError<SandboxCommandError>()(
  "SandboxCommandError",
  {
    operation: Schema.Literals([
      "create",
      "attach",
      "detach",
      "stop",
      "remove",
      "syncToHost",
      "syncToRemote",
      "remotePreview",
      "remotePush",
      "policy",
      "image",
      "receiver",
      "template",
    ]),
    detail: Schema.String,
  },
) {
  override get message() {
    return `Sandbox ${this.operation} failed: ${this.detail}`;
  }
}

export const SandboxError = Schema.Union([
  SandboxUnavailableError,
  SandboxNotFoundError,
  SandboxTemplateNotFoundError,
  SandboxTemplateInvalidError,
  SandboxTemplateReadOnlyError,
  SandboxCommandError,
]);
export type SandboxError = typeof SandboxError.Type;
