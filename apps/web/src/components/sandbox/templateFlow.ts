import type { SandboxCliId, SandboxTemplateManifest } from "@t3tools/contracts";

import type { FlowEdge, FlowStage } from "./PipelineFlow";

const CLI_LABELS: Record<SandboxCliId, string> = {
  codex: "Codex",
  claude: "Claude Code",
  cursor: "Cursor",
  grok: "Grok Build",
  opencode: "OpenCode",
};

const TOOLING: ReadonlyArray<readonly [keyof SandboxTemplateManifest, string]> = [
  ["docker", "Docker in the sandbox"],
  ["openspec", "openspec"],
  ["headroom", "headroom"],
  ["serena", "serena"],
  ["dreamfeed", "dreamfeed"],
  ["lateral", "lateral"],
];

/** Card id of a tool, so the editor can attach reorder controls. */
export const toolCardId = (toolId: string) => `tool:${toolId}`;

/**
 * The image build of a template in the order the Dockerfile runs it: base
 * image, provider CLIs, gortex and the weContain tooling, each tool module in
 * its own step, the template's setup commands, then the host channel and the
 * t3 server that boots the sandbox. Steps that do nothing for this template
 * are left out, so the flow reads as what will actually happen.
 */
export function buildTemplateFlow(manifest: SandboxTemplateManifest): {
  readonly stages: ReadonlyArray<FlowStage>;
  readonly edges?: ReadonlyArray<FlowEdge>;
} {
  const stages: FlowStage[] = [
    {
      id: "base",
      cards: [
        {
          id: "base",
          title: "Base image",
          detail: manifest.baseImage.replace(/@sha256:.*$/, ""),
          status: "idle",
        },
      ],
    },
  ];
  if (manifest.clis.length > 0) {
    stages.push({
      id: "clis",
      cards: manifest.clis.map((cli) => ({
        id: `cli:${cli}`,
        title: CLI_LABELS[cli],
        detail: "provider CLI",
        status: "idle",
      })),
    });
  }
  const tooling = [
    ...(manifest.gortex ? [["gortex", "gortex"] as const] : []),
    ...TOOLING.filter(([key]) => manifest[key] === true),
  ];
  if (tooling.length > 0) {
    stages.push({
      id: "tooling",
      cards: tooling.map(([key, label]) => ({
        id: `tooling:${key}`,
        title: label,
        detail: "weContain tooling",
        status: "idle",
      })),
    });
  }
  for (const tool of manifest.tools ?? []) {
    stages.push({
      id: toolCardId(tool.id),
      cards: [
        {
          id: toolCardId(tool.id),
          title: tool.name,
          detail: [tool.version, tool.category].filter(Boolean).join(" · "),
          status: "idle",
        },
      ],
    });
  }
  if (manifest.setupCommands.length > 0) {
    stages.push({
      id: "setup",
      cards: [
        {
          id: "setup",
          title: "Setup commands",
          detail: `${String(manifest.setupCommands.length)} command(s)`,
          status: "idle",
        },
      ],
    });
  }
  stages.push({
    id: "boot",
    cards: [
      {
        id: "boot",
        title: "Host channel · t3 server",
        detail: [
          manifest.sudo === false ? "no sudo" : null,
          manifest.commandLog === true ? "command log" : null,
        ]
          .filter(Boolean)
          .join(" · "),
        status: "idle",
      },
    ],
  });
  return { stages };
}
