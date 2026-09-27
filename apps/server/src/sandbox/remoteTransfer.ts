/**
 * Pure pieces of the receiver → remote transfer: parsing git's machine output
 * and deciding what a push publishes. The git invocations themselves live in
 * SandboxManager; everything here is deterministic so it can be tested alone.
 */

import type {
  SandboxGitIdentity,
  SandboxRemoteCommit,
  SandboxRemoteFileChange,
  SandboxRemoteRelation,
} from "@t3tools/contracts";

/** `git log` format for parseCommitLog: fields split by US, records by RS. */
export const COMMIT_LOG_FORMAT = "%H%x1f%P%x1f%an%x1f%ae%x1f%aI%x1f%s%x1e";

export interface ParsedCommit extends SandboxRemoteCommit {
  readonly parents: ReadonlyArray<string>;
}

export function parseCommitLog(output: string): ReadonlyArray<ParsedCommit> {
  return output
    .split("\x1e")
    .map((record) => record.replace(/^\s+/, ""))
    .filter((record) => record.length > 0)
    .map((record) => {
      const [
        sha = "",
        parents = "",
        authorName = "",
        authorEmail = "",
        authoredAt = "",
        subject = "",
      ] = record.split("\x1f");
      const parentList = parents.split(" ").filter((parent) => parent.length > 0);
      return {
        sha,
        parents: parentList,
        parentCount: parentList.length,
        authorName,
        authorEmail,
        authoredAt,
        subject,
      };
    });
}

/**
 * Joins `git diff --numstat -z --no-renames` with `--name-status -z
 * --no-renames`. Renames are disabled on both so every record names one path.
 */
export function parseDiffSummary(
  numstat: string,
  nameStatus: string,
): ReadonlyArray<SandboxRemoteFileChange> {
  const statusByPath = new Map<string, string>();
  const statusFields = nameStatus.split("\0");
  for (let index = 0; index + 1 < statusFields.length; index += 2) {
    const status = statusFields[index] ?? "";
    const filePath = statusFields[index + 1] ?? "";
    if (status.length > 0 && filePath.length > 0) {
      statusByPath.set(filePath, status.charAt(0));
    }
  }

  return numstat
    .split("\0")
    .filter((record) => record.length > 0)
    .flatMap((record) => {
      const [added, deleted, ...rest] = record.split("\t");
      const filePath = rest.join("\t");
      if (added === undefined || deleted === undefined || filePath.length === 0) {
        return [];
      }
      // Binary files report "-" for both counts.
      const count = (value: string) => (value === "-" ? null : Number.parseInt(value, 10) || 0);
      return [
        {
          path: filePath,
          status: statusByPath.get(filePath) ?? "M",
          additions: count(added),
          deletions: count(deleted),
          hostRisk: hostExecutionRisk(filePath),
        },
      ];
    });
}

/**
 * Files that tools on the host act on by themselves once sandbox work lands in
 * a checkout — the realistic way for sandboxed code to run on the host without
 * breaking out of anything. Flagged for review, never blocked: editing them is
 * often legitimate work.
 */
const HOST_RISK_DIRECTORIES: ReadonlyArray<readonly [string, string]> = [
  [".claude", "Claude Code settings: hooks run commands for any agent opened here"],
  [".cursor", "Cursor agent configuration and MCP servers"],
  [".codex", "Codex agent configuration"],
  [".gemini", "Gemini agent configuration"],
  [".opencode", "OpenCode agent configuration"],
  [".vscode", "editor tasks and launch configs can run commands"],
  [".idea", "IDE run configurations can run commands"],
  [".devcontainer", "devcontainer lifecycle commands run on open"],
  [".husky", "git hooks installed from here run on commit"],
  [".githooks", "git hooks installed from here run on commit"],
];

const HOST_RISK_FILES: ReadonlyMap<string, string> = new Map([
  [".mcp.json", "project MCP servers: commands agents start"],
  ["opencode.json", "OpenCode configuration and MCP servers"],
  ["CLAUDE.md", "instructions every agent in this folder follows"],
  ["AGENTS.md", "instructions every agent in this folder follows"],
  ["GEMINI.md", "instructions every agent in this folder follows"],
  ["package.json", "npm scripts, including install hooks, run on install"],
  [".npmrc", "npm configuration can change how scripts run"],
  [".envrc", "direnv runs it on entering the folder"],
  [".gitattributes", "git filters and diff drivers"],
  [".gitmodules", "submodule sources fetched on update"],
  ["lefthook.yml", "git hooks installed from here run on commit"],
  [".pre-commit-config.yaml", "git hooks installed from here run on commit"],
  [".sandbox-config", "network egress and limits of future sandboxes"],
]);

const WORKFLOW_PATH = /^\.github\/workflows\//;

/** Why a changed path deserves a look before it reaches a host checkout, or null. */
export function hostExecutionRisk(filePath: string): string | null {
  const normalized = filePath.replaceAll("\\", "/");
  if (WORKFLOW_PATH.test(normalized)) {
    return "CI workflows run with the repository's secrets";
  }
  const segments = normalized.split("/");
  for (const segment of segments.slice(0, -1)) {
    const directory = HOST_RISK_DIRECTORIES.find(([name]) => name === segment);
    if (directory !== undefined) return directory[1];
  }
  return HOST_RISK_FILES.get(segments.at(-1) ?? "") ?? null;
}

export function remoteRelation(input: {
  readonly remoteSha: string | null;
  readonly sourceSha: string;
  /** Whether remoteSha is an ancestor of sourceSha. */
  readonly remoteIsAncestor: boolean;
}): SandboxRemoteRelation {
  if (input.remoteSha === null) return "new-branch";
  if (input.remoteSha === input.sourceSha) return "up-to-date";
  return input.remoteIsAncestor ? "fast-forward" : "diverged";
}

export const defaultTargetBranch = (sandboxName: string) => `sandbox/${sandboxName}`;

/** Remote picked when the caller names none: origin, else the first one. */
export function pickDefaultRemote(remoteNames: ReadonlyArray<string>): string | null {
  if (remoteNames.includes("origin")) return "origin";
  return remoteNames[0] ?? null;
}

export function composeSquashMessage(
  sandboxName: string,
  commits: ReadonlyArray<Pick<SandboxRemoteCommit, "subject">>,
): string {
  if (commits.length === 1) {
    return commits[0]?.subject ?? `Sandbox work from ${sandboxName}`;
  }
  const bullets = commits.map((commit) => `- ${commit.subject}`).join("\n");
  return `Sandbox work from ${sandboxName}\n\n${bullets}`;
}

const sameIdentity = (left: SandboxGitIdentity, right: SandboxGitIdentity) =>
  left.email.toLowerCase() === right.email.toLowerCase();

/**
 * Appends `Co-authored-by:` trailers for the original authors, skipping the new
 * author and any trailer the message already carries.
 */
export function withCoAuthorTrailers(
  message: string,
  originalAuthors: ReadonlyArray<SandboxGitIdentity>,
  newAuthor: SandboxGitIdentity,
): string {
  const trimmed = message.replace(/\s+$/, "");
  const trailers: string[] = [];
  const seen: SandboxGitIdentity[] = [newAuthor];
  for (const author of originalAuthors) {
    if (seen.some((existing) => sameIdentity(existing, author))) continue;
    seen.push(author);
    const trailer = `Co-authored-by: ${author.name} <${author.email}>`;
    if (!trimmed.includes(trailer)) trailers.push(trailer);
  }
  if (trailers.length === 0) return `${trimmed}\n`;
  // A trailer block must be its own paragraph unless the message already ends in one.
  const endsInTrailers = /\n\n(?:[A-Za-z-]+: .+\n?)+$/.test(`${trimmed}\n`);
  return `${trimmed}${endsInTrailers ? "\n" : "\n\n"}${trailers.join("\n")}\n`;
}

/** Distinct authors of a commit list, in first-seen order. */
export function distinctAuthors(
  commits: ReadonlyArray<Pick<SandboxRemoteCommit, "authorName" | "authorEmail">>,
): ReadonlyArray<SandboxGitIdentity> {
  const authors: SandboxGitIdentity[] = [];
  for (const commit of commits) {
    const author = { name: commit.authorName, email: commit.authorEmail };
    if (!authors.some((existing) => sameIdentity(existing, author))) {
      authors.push(author);
    }
  }
  return authors;
}

/**
 * Parent list of a rewritten commit: parents that were rewritten earlier in the
 * walk map to their new sha; parents outside the published range (the remote
 * tip or older history) are kept as they are.
 */
export function rewrittenParents(
  parents: ReadonlyArray<string>,
  rewritten: ReadonlyMap<string, string>,
): ReadonlyArray<string> {
  return parents.map((parent) => rewritten.get(parent) ?? parent);
}
