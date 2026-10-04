import type { EnvironmentId, SandboxInfo } from "@t3tools/contracts";

import { sandboxProjectName } from "~/state/sandbox";
import { chartText, type ObservatoryGraph, type ObservatoryNode } from "./observatoryGraph";

export interface ChatsGraphThread {
  readonly id: string;
  readonly environmentId: EnvironmentId;
  readonly title: string;
  readonly branch: string | null;
  readonly updatedAt: string;
  readonly latestRun: { readonly status: string } | null;
}

export interface ChatsGraphEnvironment {
  readonly environmentId: EnvironmentId;
  readonly label: string;
}

/** Chats drawn at most; the most recently active win. */
export const CHATS_GRAPH_LIMIT = 80;

/**
 * Every environment (this machine, each sandbox, other servers) with the
 * chats that run on it. Sandboxes are named after their project, from the
 * host's own records. Titles and branches come from agents and servers, so
 * all of it goes through chartText.
 */
export function buildChatsGraph(input: {
  readonly environments: ReadonlyArray<ChatsGraphEnvironment>;
  readonly primaryEnvironmentId: EnvironmentId | null;
  readonly sandboxesByEnvironmentId: ReadonlyMap<EnvironmentId, SandboxInfo>;
  readonly threads: ReadonlyArray<ChatsGraphThread>;
}): ObservatoryGraph & { readonly omittedChats: number } {
  const recent = input.threads
    .toSorted((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, CHATS_GRAPH_LIMIT);
  const envIndex = new Map<EnvironmentId, number>();
  const nodes: ObservatoryNode[] = [];
  const links: ObservatoryGraph["links"][number][] = [];

  const environmentNodeId = (environmentId: EnvironmentId) => `env:${environmentId}`;
  input.environments.forEach((environment, index) => {
    envIndex.set(environment.environmentId, index);
    const chats = recent.filter((thread) => thread.environmentId === environment.environmentId);
    const sandbox = input.sandboxesByEnvironmentId.get(environment.environmentId);
    const isHost = environment.environmentId === input.primaryEnvironmentId;
    const name = sandbox
      ? `${sandboxProjectName(sandbox)} sandbox`
      : isHost
        ? "This machine"
        : environment.label;
    const running = chats.filter((thread) => thread.latestRun?.status === "running").length;
    nodes.push({
      // Sorts the column: this machine first, then the rest in list order.
      id: `${environmentNodeId(environment.environmentId)}`,
      name: chartText(name, 40),
      kind: sandbox ? "sandbox" : "host",
      details: [
        chartText(name, 60),
        ...(sandbox ? [`Status: ${sandbox.status}`] : []),
        `${chats.length} ${chats.length === 1 ? "chat" : "chats"}${running > 0 ? `, ${running} working` : ""}`,
      ],
      alert: sandbox?.status === "error",
      muted: sandbox !== undefined && sandbox.status !== "running",
    });
  });

  for (const thread of recent) {
    const index = envIndex.get(thread.environmentId);
    if (index === undefined) continue;
    const state = thread.latestRun?.status ?? "idle";
    // Column order: grouped by environment, newest first inside a group.
    const order = `${String(index).padStart(3, "0")}:${String(
      9_999_999_999_999 - (Date.parse(thread.updatedAt) || 0),
    ).padStart(13, "0")}`;
    const id = `chat:${order}:${thread.environmentId}:${thread.id}`;
    nodes.push({
      id,
      name: chartText(thread.title, 36),
      kind: "chat",
      details: [
        chartText(thread.title, 100),
        ...(thread.branch ? [`Branch: ${chartText(thread.branch, 60)}`] : []),
        `Last run: ${state}`,
      ],
      alert: state === "failed",
      muted: state !== "running",
    });
    links.push({
      source: environmentNodeId(thread.environmentId),
      target: id,
      label: "",
      details: [],
      alert: state === "failed",
      weight: 1,
    });
  }
  return { nodes, links, omittedChats: Math.max(0, input.threads.length - recent.length) };
}
