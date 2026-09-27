import { expect, it } from "@effect/vitest";
import type { SandboxTemplateManifest } from "@t3tools/contracts";

import {
  collectTemplateIssues,
  createTarball,
  isSafeBundlePath,
  readTarball,
} from "./SandboxTemplates.ts";

const manifest = (overrides: Partial<SandboxTemplateManifest> = {}): SandboxTemplateManifest => ({
  id: "custom",
  name: "Custom",
  description: "",
  baseImage: "docker/sandbox-templates:claude-code",
  clis: ["codex", "claude"],
  gortex: false,
  env: {},
  setupCommands: [],
  ...overrides,
});

const errors = (input: Parameters<typeof collectTemplateIssues>[0]) =>
  collectTemplateIssues(input).filter((issue) => issue.severity === "error");

it("accepts a plain relative bundle path", () => {
  expect(isSafeBundlePath("template.json")).toBe(true);
  expect(isSafeBundlePath("scripts/setup.sh")).toBe(true);
});

it("rejects bundle paths that escape the template directory", () => {
  // Import is the only place foreign paths arrive, so traversal has to die here.
  expect(isSafeBundlePath("../outside.json")).toBe(false);
  expect(isSafeBundlePath("scripts/../../outside.json")).toBe(false);
  expect(isSafeBundlePath("/etc/passwd")).toBe(false);
  expect(isSafeBundlePath("C:\\Windows\\system32")).toBe(false);
  expect(isSafeBundlePath("nested\\..\\..\\escape")).toBe(false);
  expect(isSafeBundlePath("")).toBe(false);
});

it("reports invalid environment variable names as errors", () => {
  const issues = errors({
    manifest: manifest({ env: { "not a key": "value" } }),
    dockerfile: undefined,
  });
  expect(issues).toHaveLength(1);
  expect(issues[0]?.field).toBe("env");
});

it("reports empty and multi-line setup commands as errors", () => {
  const issues = errors({
    manifest: manifest({ setupCommands: ["  ", "echo one\necho two"] }),
    dockerfile: undefined,
  });
  expect(issues).toHaveLength(2);
  expect(issues.every((issue) => issue.field === "setupCommands")).toBe(true);
});

it("requires a custom Dockerfile to have FROM and to install the entrypoint", () => {
  const issues = errors({ manifest: manifest(), dockerfile: "RUN echo hello\n" });
  expect(issues.map((issue) => issue.message)).toEqual([
    "Dockerfile has no FROM instruction.",
    "Dockerfile must COPY start-t3 into the image; the sandbox boots through it.",
  ]);
});

it("accepts a custom Dockerfile that boots through the entrypoint", () => {
  const issues = errors({
    manifest: manifest(),
    dockerfile: "FROM base\nARG T3_VERSION\nCOPY start-t3 /home/agent/.local/bin/start-t3\n",
  });
  expect(issues).toEqual([]);
});

it("warns, but does not block, on an untagged base image", () => {
  const issues = collectTemplateIssues({
    manifest: manifest({ baseImage: "ubuntu" }),
    dockerfile: undefined,
  });
  expect(issues).toHaveLength(1);
  expect(issues[0]?.severity).toBe("warning");
});

it("round-trips a bundle through the tarball writer and reader", async () => {
  const entries = new Map<string, Uint8Array>([
    ["template.json", Buffer.from('{"id":"custom"}\n', "utf8")],
    ["Dockerfile", Buffer.from("FROM base\n", "utf8")],
    ["scripts/setup.sh", Buffer.from("#!/bin/sh\necho hi\n", "utf8")],
  ]);

  const restored = await readTarball(createTarball(entries));

  expect([...restored.keys()].sort()).toEqual(["Dockerfile", "scripts/setup.sh", "template.json"]);
  for (const [path, bytes] of entries) {
    expect(Buffer.from(restored.get(path) ?? new Uint8Array()).toString("utf8")).toBe(
      Buffer.from(bytes).toString("utf8"),
    );
  }
});

it("drops traversing entries while reading a tarball", async () => {
  const entries = new Map<string, Uint8Array>([
    ["template.json", Buffer.from("{}", "utf8")],
    ["../escape.json", Buffer.from("nope", "utf8")],
  ]);

  const restored = await readTarball(createTarball(entries));

  expect([...restored.keys()]).toEqual(["template.json"]);
});
