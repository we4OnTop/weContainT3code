import { expect, it } from "@effect/vitest";
import { ProjectId, ThreadId, type SandboxInfo } from "@t3tools/contracts";

import {
  PROJECT_FOLDER_PATTERN,
  guestUpstreamUrl,
  parsePortLeases,
  parseSbxSandboxes,
  buildFailureRecord,
  migrateLegacyRecords,
  pickPairingUrl,
  sbxTemplateHasTag,
  sbxTemplateRows,
  type StartedSandbox,
} from "./SandboxManager.ts";

const legacyRecord = {
  sandboxId: "thread-1",
  name: "t3-project-thread01",
  projectId: "project-1",
  threadId: "thread-1",
  projectCwd: "/home/dev/project",
  status: "running",
  image: "t3-gortex-sandbox:v0.0.35",
  hostPort: 3774,
  pairingUrl: null,
  branch: null,
  message: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

it("carries a per-thread record over to folder-scoped ownership", () => {
  const migrated = JSON.parse(migrateLegacyRecords(JSON.stringify([legacyRecord])));

  expect(migrated[0].createdByThreadId).toBe("thread-1");
  expect(migrated[0].threadIds).toEqual(["thread-1"]);
  expect(migrated[0].templateId).toBe("plain");
  // The sandbox itself is untouched: the same container keeps serving the chat.
  expect(migrated[0].sandboxId).toBe("thread-1");
  expect(migrated[0].name).toBe(legacyRecord.name);
});

it("leaves already-migrated records alone", () => {
  const current = {
    ...legacyRecord,
    createdByThreadId: "thread-1",
    threadIds: ["thread-1", "thread-2"],
    templateId: "gortex",
  };

  const migrated = JSON.parse(migrateLegacyRecords(JSON.stringify([current])));

  expect(migrated[0].threadIds).toEqual(["thread-1", "thread-2"]);
  expect(migrated[0].templateId).toBe("gortex");
});

it("passes through content it cannot understand for the decoder to reject", () => {
  expect(migrateLegacyRecords("not json")).toBe("not json");
  expect(migrateLegacyRecords('{"not":"an array"}')).toBe('{"not":"an array"}');
});

const createRequest = {
  projectId: ProjectId.make("project-1"),
  threadId: ThreadId.make("thread-1"),
  projectCwd: "/home/dev/project",
};

const started: StartedSandbox = {
  sandboxId: "sbx-0123456789abcdef",
  name: "t3-project-89abcdef",
  templateId: "plain",
  image: "t3-plain-sandbox:v0.0.40",
  hostPort: 3774,
  existing: undefined,
  workspaceDir: "/home/agent/project",
};

it("keeps a failed create resumable under the same identity", () => {
  const record = buildFailureRecord({
    input: createRequest,
    started,
    message: "Sandbox create failed: boot timed out",
    now: "2026-01-01T00:00:00.000Z",
  });

  expect(record.status).toBe("error");
  expect(record.message).toBe("Sandbox create failed: boot timed out");
  // Identity survives, so the retry resumes this container instead of
  // orphaning it and allocating a second port.
  expect(record.sandboxId).toBe(started.sandboxId);
  expect(record.name).toBe(started.name);
  expect(record.hostPort).toBe(3774);
  // The owning chat is on the record, so the retry finds it as `existing`.
  expect(record.threadIds).toEqual(["thread-1"]);
  expect(record.pairingUrl).toBeNull();
});

it("preserves provenance when a retry fails again", () => {
  const previous: SandboxInfo = {
    ...buildFailureRecord({
      input: createRequest,
      started,
      message: "first failure",
      now: "2026-01-01T00:00:00.000Z",
    }),
    createdByThreadId: ThreadId.make("thread-0"),
    threadIds: [ThreadId.make("thread-0")],
    branch: "sandbox/work",
  };

  const record = buildFailureRecord({
    input: createRequest,
    started: { ...started, existing: previous },
    message: "second failure",
    now: "2026-02-02T00:00:00.000Z",
  });

  expect(record.createdByThreadId).toBe("thread-0");
  expect(record.createdAt).toBe("2026-01-01T00:00:00.000Z");
  expect(record.updatedAt).toBe("2026-02-02T00:00:00.000Z");
  expect(record.branch).toBe("sandbox/work");
  // The retrying chat joins the sandbox rather than replacing its owner.
  expect(record.threadIds).toEqual(["thread-0", "thread-1"]);
  expect(record.message).toBe("second failure");
});

const sandboxTemplateListing = [
  "REPOSITORY                            TAG                  IMAGE ID       FLAVOR               CREATED",
  "docker.io/docker/sandbox-templates    claude-code-docker   94670d5b2a24   claude-code-docker   About a day ago",
  "",
  "docker.io/library/t3-sandbox          plain-v0.0.39-e3b80d265182",
].join("\n");

it("normalizes the sandbox runtime's template listing for tag checks", () => {
  const rows = sbxTemplateRows(sandboxTemplateListing);

  expect(rows).toEqual([
    { repo: "docker/sandbox-templates", tag: "claude-code-docker" },
    { repo: "t3-sandbox", tag: "plain-v0.0.39-e3b80d265182" },
  ]);
});

it("recognizes a loaded sandbox image regardless of namespace decoration", () => {
  const rows = sbxTemplateRows(sandboxTemplateListing);

  expect(sbxTemplateHasTag(rows, "t3-sandbox", "plain-v0.0.39-e3b80d265182")).toBe(true);
  expect(sbxTemplateHasTag(rows, "t3-sandbox", "plain-v0.0.40-e3b80d265182")).toBe(false);
});

it("accepts only a pairing link to the sandbox's own loopback port", () => {
  const output = "Pairing URL: http://127.0.0.1:3774/pair#token=ABC\n";

  expect(pickPairingUrl(output, 3774)).toBe("http://127.0.0.1:3774/pair#token=ABC");
  // A shadowed `t3` in the guest printing a link elsewhere yields nothing.
  expect(pickPairingUrl("http://evil.example/pair#token=ABC", 3774)).toBeNull();
  expect(pickPairingUrl("http://127.0.0.1:3775/pair#token=ABC", 3774)).toBeNull();
  expect(pickPairingUrl("http://localhost:3774/pair#token=ABC", 3774)).toBeNull();
  expect(pickPairingUrl("http://user:pw@127.0.0.1:3774/pair", 3774)).toBeNull();
  expect(pickPairingUrl("https://127.0.0.1:3774/pair", 3774)).toBeNull();
  // The first acceptable link wins even after decoys.
  expect(
    pickPairingUrl("see http://evil.example/x then http://127.0.0.1:3774/pair#token=Z", 3774),
  ).toBe("http://127.0.0.1:3774/pair#token=Z");
});

it("serves project folders by their real name, case included", () => {
  for (const ok of ["weContain", "t3code", "my project", "repo.v2", "a", "_x", ".dotted"]) {
    expect(PROJECT_FOLDER_PATTERN.test(ok), ok).toBe(true);
  }
  for (const bad of ["", ".", "..", "-rf", "a/b", "a\b", "a;b", "$(x)", "a\nb", "ä"]) {
    expect(PROJECT_FOLDER_PATTERN.test(bad), JSON.stringify(bad)).toBe(false);
  }
});

it("gives the guest only the host repository's identity as upstream", () => {
  expect(
    guestUpstreamUrl(
      "origin\thttps://github.com/pingdotgg/t3code.git (fetch)\norigin\thttps://github.com/pingdotgg/t3code.git (push)\n",
    ),
  ).toBe("https://github.com/pingdotgg/t3code.git");
  // upstream wins over origin, as in the host's own identity
  expect(
    guestUpstreamUrl(
      "origin\tgit@github.com:me/fork.git (fetch)\nupstream\tgit@github.com:acme/app.git (fetch)\n",
    ),
  ).toBe("https://github.com/acme/app.git");
  // credentials never cross into the sandbox
  expect(
    guestUpstreamUrl("origin\thttps://user:ghp_secret@github.com/acme/app.git (fetch)\n"),
  ).toBe("https://github.com/acme/app.git");
  // local paths and single-segment URLs are not hosted repositories
  expect(guestUpstreamUrl("origin\tC:/Users/me/repo (fetch)\n")).toBeNull();
  expect(guestUpstreamUrl("origin\tgit://127.0.0.1:9418/t3code (fetch)\n")).toBeNull();
  expect(guestUpstreamUrl("")).toBeNull();
});

it("reads bound host ports per sandbox from sbx ls --json", () => {
  const sandboxes = parseSbxSandboxes(
    JSON.stringify({
      sandboxes: [
        { name: "t3-a-1", id: "x", agent: "claude", status: "stopped", workspaces: [] },
        {
          name: "t3-b-2",
          status: "running",
          ports: [
            { host_ip: "127.0.0.1", host_port: 3774, sandbox_port: 3773, protocol: "tcp4" },
            { host_ip: "127.0.0.1", host_port: 60013, sandbox_port: 9418, protocol: "tcp4" },
          ],
        },
      ],
    }),
  );
  // a stopped sandbox holds no binding even though its port comes back on start
  expect(sandboxes.get("t3-a-1")).toEqual({ status: "stopped", hostPorts: [] });
  expect(sandboxes.get("t3-b-2")).toEqual({ status: "running", hostPorts: [3774, 60013] });
  expect(parseSbxSandboxes("sbx: daemon not running").size).toBe(0);
  expect(parseSbxSandboxes("").size).toBe(0);
});

it("keeps only numeric ports from the shared port lease file", () => {
  expect(parsePortLeases('{"3774":"t3-b-2","3775":"t3-a-1","x":"t3-c"}')).toEqual({
    "3774": "t3-b-2",
    "3775": "t3-a-1",
  });
  expect(parsePortLeases('{"3774":7}')).toEqual({});
  expect(parsePortLeases("not json")).toEqual({});
});
