import { SANDBOX_TOOL_CATALOG, type SandboxTemplateManifest } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { buildTemplateFlow, toolCardId } from "./templateFlow";

const manifest = (overrides: Partial<SandboxTemplateManifest> = {}): SandboxTemplateManifest => ({
  id: "custom",
  name: "Custom",
  description: "",
  baseImage: "docker/sandbox-templates:claude-code@sha256:abc",
  clis: [],
  gortex: false,
  env: {},
  setupCommands: [],
  ...overrides,
});

describe("buildTemplateFlow", () => {
  it("leaves out steps the template does not use", () => {
    const flow = buildTemplateFlow(manifest());
    expect(flow.stages.map((stage) => stage.id)).toEqual(["base", "boot"]);
    expect(flow.stages[0]?.cards[0]?.detail).toBe("docker/sandbox-templates:claude-code");
  });

  it("runs CLIs side by side and each tool as its own step, in template order", () => {
    const [rtk, contextMode] = SANDBOX_TOOL_CATALOG;
    const flow = buildTemplateFlow(
      manifest({
        clis: ["claude", "codex"],
        gortex: true,
        headroom: true,
        tools: [contextMode!, rtk!],
        setupCommands: ["echo hi"],
      }),
    );
    expect(flow.stages.map((stage) => stage.id)).toEqual([
      "base",
      "clis",
      "tooling",
      toolCardId("context-mode"),
      toolCardId("rtk"),
      "setup",
      "boot",
    ]);
    expect(flow.stages[1]?.cards).toHaveLength(2);
    expect(flow.stages[2]?.cards.map((card) => card.title)).toEqual(["gortex", "headroom"]);
  });
});
