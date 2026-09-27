import { expect, it } from "@effect/vitest";

import { parseProjectSandboxConfig, resolveCreateOptions } from "./sandboxConfig.ts";

it("reads the host-side keys of a weContain .sandbox-config", () => {
  const options = parseProjectSandboxConfig(
    JSON.stringify({
      version: 1,
      sandbox: { memory: "8g", cpus: 4, agent: "opencode" },
      network: { allow: ["pypi.org", "Files.PythonHosted.org"], deny: ["telemetry.example.com"] },
      sync: { ignore: ["*.log", "tmp/"], skipWorktree: ["config/local.json"] },
      gortex: { enabled: true, warmCache: false },
    }),
  );

  expect(options).toEqual({
    memory: "8g",
    cpus: 4,
    allowHosts: ["pypi.org", "files.pythonhosted.org"],
    denyHosts: ["telemetry.example.com"],
    syncIgnore: ["*.log", "tmp/"],
    skipWorktree: ["config/local.json"],
    warmCache: false,
  });
});

it("drops values a create could be steered with instead of failing", () => {
  const options = parseProjectSandboxConfig(
    JSON.stringify({
      sandbox: { memory: "8g; rm -rf /", cpus: -1 },
      network: { allow: ["--all", "**", "*", "localhost", "ok.example.com", 42, "a.com,b.com"] },
      sync: { skipWorktree: ["--force", "real.txt"], ignore: "not-a-list" },
    }),
  );

  expect(options).toEqual({ allowHosts: ["ok.example.com"], skipWorktree: ["real.txt"] });
});

it("treats a missing or broken file as no defaults", () => {
  expect(parseProjectSandboxConfig("")).toEqual({});
  expect(parseProjectSandboxConfig("{not json")).toEqual({});
  expect(parseProjectSandboxConfig("[]")).toEqual({});
});

it("lets explicit options win key by key over the project file", () => {
  expect(
    resolveCreateOptions(
      { memory: "16g", allowHosts: ["a.example.com"] },
      { memory: "8g", cpus: 2, allowHosts: ["b.example.com"] },
    ),
  ).toEqual({ memory: "16g", cpus: 2, allowHosts: ["a.example.com"] });
  expect(resolveCreateOptions(undefined, { cpus: 2 })).toEqual({ cpus: 2 });
});

it("never lets the project file open the host or the local network", () => {
  const options = parseProjectSandboxConfig(
    JSON.stringify({
      network: {
        allow: [
          "host.docker.internal:3000",
          "127.0.0.1:8080",
          "192.168.1.10",
          "router.local",
          "**.com",
          "pypi.org",
        ],
        deny: ["192.168.1.10"],
      },
    }),
  );

  expect(options).toEqual({ allowHosts: ["pypi.org"], denyHosts: ["192.168.1.10"] });
});
