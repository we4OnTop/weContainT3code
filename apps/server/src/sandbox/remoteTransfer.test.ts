import { expect, it } from "@effect/vitest";

import {
  composeSquashMessage,
  distinctAuthors,
  hostExecutionRisk,
  parseCommitLog,
  parseDiffSummary,
  pickDefaultRemote,
  remoteRelation,
  rewrittenParents,
  withCoAuthorTrailers,
} from "./remoteTransfer.ts";

const agent = { name: "sandbox-agent", email: "agent@sandbox.local" };
const ivan = { name: "Ivan", email: "ivan@example.com" };

it("parses git log records, including merges and root commits", () => {
  const output = [
    "aaa\x1f\x1fsandbox-agent\x1fagent@sandbox.local\x1f2026-09-01T10:00:00+02:00\x1finitial\x1e",
    "\nbbb\x1faaa\x1fsandbox-agent\x1fagent@sandbox.local\x1f2026-09-01T11:00:00+02:00\x1ffix: a | b\x1e",
    "\nccc\x1fbbb zzz\x1fIvan\x1fivan@example.com\x1f2026-09-02T09:00:00+02:00\x1fMerge branch\x1e\n",
  ].join("");

  const commits = parseCommitLog(output);

  expect(commits.map((commit) => commit.sha)).toEqual(["aaa", "bbb", "ccc"]);
  expect(commits[0]?.parents).toEqual([]);
  expect(commits[2]?.parents).toEqual(["bbb", "zzz"]);
  expect(commits[2]?.parentCount).toBe(2);
  expect(commits[1]?.subject).toBe("fix: a | b");
  expect(parseCommitLog("")).toEqual([]);
});

it("joins numstat and name-status, keeping binary files without counts", () => {
  const numstat = ["3\t1\tsrc/app.ts", "-\t-\tassets/logo.png", "0\t12\told.txt", ""].join("\0");
  const nameStatus = "M\0src/app.ts\0A\0assets/logo.png\0D\0old.txt\0";

  expect(parseDiffSummary(numstat, nameStatus)).toEqual([
    { path: "src/app.ts", status: "M", additions: 3, deletions: 1, hostRisk: null },
    { path: "assets/logo.png", status: "A", additions: null, deletions: null, hostRisk: null },
    { path: "old.txt", status: "D", additions: 0, deletions: 12, hostRisk: null },
  ]);
});

it("classifies how the receiver work relates to the remote branch", () => {
  expect(remoteRelation({ remoteSha: null, sourceSha: "b", remoteIsAncestor: false })).toBe(
    "new-branch",
  );
  expect(remoteRelation({ remoteSha: "b", sourceSha: "b", remoteIsAncestor: true })).toBe(
    "up-to-date",
  );
  expect(remoteRelation({ remoteSha: "a", sourceSha: "b", remoteIsAncestor: true })).toBe(
    "fast-forward",
  );
  expect(remoteRelation({ remoteSha: "a", sourceSha: "b", remoteIsAncestor: false })).toBe(
    "diverged",
  );
});

it("prefers origin, then the first remote", () => {
  expect(pickDefaultRemote(["upstream", "origin"])).toBe("origin");
  expect(pickDefaultRemote(["upstream", "fork"])).toBe("upstream");
  expect(pickDefaultRemote([])).toBeNull();
});

it("summarizes squashed work from the commit subjects", () => {
  expect(composeSquashMessage("t3-app-1234", [{ subject: "only change" }])).toBe("only change");
  expect(composeSquashMessage("t3-app-1234", [{ subject: "one" }, { subject: "two" }])).toBe(
    "Sandbox work from t3-app-1234\n\n- one\n- two",
  );
});

it("credits the original authors in a separate trailer paragraph", () => {
  expect(withCoAuthorTrailers("feat: thing\n\nBody text.\n", [agent], ivan)).toBe(
    "feat: thing\n\nBody text.\n\nCo-authored-by: sandbox-agent <agent@sandbox.local>\n",
  );
});

it("extends an existing trailer block instead of starting a new one", () => {
  expect(
    withCoAuthorTrailers("feat: thing\n\nSigned-off-by: Someone <s@example.com>\n", [agent], ivan),
  ).toBe(
    "feat: thing\n\nSigned-off-by: Someone <s@example.com>\nCo-authored-by: sandbox-agent <agent@sandbox.local>\n",
  );
});

it("never credits the new author or repeats an existing trailer", () => {
  expect(withCoAuthorTrailers("fix\n", [ivan], ivan)).toBe("fix\n");
  expect(
    withCoAuthorTrailers(
      "fix\n\nCo-authored-by: sandbox-agent <agent@sandbox.local>\n",
      [agent],
      ivan,
    ),
  ).toBe("fix\n\nCo-authored-by: sandbox-agent <agent@sandbox.local>\n");
});

it("lists each author once, case-insensitively by email", () => {
  expect(
    distinctAuthors([
      { authorName: "sandbox-agent", authorEmail: "agent@sandbox.local" },
      { authorName: "Agent", authorEmail: "AGENT@sandbox.local" },
      { authorName: "Ivan", authorEmail: "ivan@example.com" },
    ]),
  ).toEqual([agent, ivan]);
});

it("maps rewritten parents and keeps parents outside the published range", () => {
  const rewritten = new Map([["bbb", "BBB"]]);

  expect(rewrittenParents(["bbb", "remote-tip"], rewritten)).toEqual(["BBB", "remote-tip"]);
  expect(rewrittenParents([], rewritten)).toEqual([]);
});

it("flags files that host tools act on by themselves", () => {
  expect(hostExecutionRisk(".claude/settings.json")).toMatch(/hooks/);
  expect(hostExecutionRisk("packages/web/package.json")).toMatch(/npm scripts/);
  expect(hostExecutionRisk(".github/workflows/ci.yml")).toMatch(/secrets/);
  expect(hostExecutionRisk("apps/.vscode/tasks.json")).toMatch(/tasks/);
  expect(hostExecutionRisk(".sandbox-config")).toMatch(/egress/);
  expect(hostExecutionRisk("CLAUDE.md")).not.toBeNull();
  expect(hostExecutionRisk(String.raw`src\.husky\pre-commit`)).not.toBeNull();
});

it("leaves ordinary source files alone", () => {
  expect(hostExecutionRisk("src/app.ts")).toBeNull();
  expect(hostExecutionRisk("docs/claude-notes.md")).toBeNull();
  expect(hostExecutionRisk("package.json.bak")).toBeNull();
  expect(hostExecutionRisk("github/workflows/ci.yml")).toBeNull();
});

it("carries the host risk on every parsed file change", () => {
  const files = parseDiffSummary(
    ["1\t0\t.mcp.json", "2\t2\tsrc/a.ts", ""].join("\0"),
    ["A", ".mcp.json", "M", "src/a.ts", ""].join("\0"),
  );

  expect(files.map((file) => file.hostRisk === null)).toEqual([false, true]);
});
