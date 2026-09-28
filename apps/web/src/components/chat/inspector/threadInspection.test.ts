import type { ThreadInspectActivity, ThreadInspectResult } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import {
  buildAgentTimeline,
  contextAt,
  formatTokenCount,
  inspectThread,
  prettyPayload,
  processedTokenSeries,
  tokensBetween,
  type UsagePoint,
} from "./threadInspection";

let seq = 0;
function activity(
  kind: string,
  payload: unknown,
  at: string,
  turnId: string | null = "turn-1",
): ThreadInspectActivity {
  seq += 1;
  const json = JSON.stringify(payload);
  return {
    activityId: `a${seq}` as never,
    kind,
    tone: kind.startsWith("tool.") ? "tool" : "info",
    summary: kind,
    turnId: turnId as never,
    sequence: seq,
    createdAt: at,
    payloadJson: json,
    payloadBytes: json.length,
    payloadTruncated: false,
  };
}

const base = (
  activities: ThreadInspectActivity[],
  extra: Partial<ThreadInspectResult> = {},
): ThreadInspectResult => ({
  threadId: "t1" as never,
  messages: [],
  activities,
  olderActivitiesOmitted: false,
  ...extra,
});

describe("inspectThread", () => {
  it("merges a tool call's lifecycle into one call with duration and output size", () => {
    const result = inspectThread(
      base([
        activity(
          "tool.started",
          { itemType: "command_execution", toolCallId: "c1", title: "bash" },
          "2026-09-27T10:00:00.000Z",
        ),
        activity(
          "tool.completed",
          {
            itemType: "command_execution",
            toolCallId: "c1",
            title: "bash",
            status: "completed",
            data: { output: "x".repeat(400) },
          },
          "2026-09-27T10:00:02.500Z",
        ),
      ]),
    );
    expect(result.toolCalls).toHaveLength(1);
    const call = result.toolCalls[0]!;
    expect(call.status).toBe("completed");
    expect(call.durationMs).toBe(2500);
    expect(call.outputChars).toBeGreaterThan(400);
    expect(result.toolStats[0]).toMatchObject({ name: "bash", calls: 1, failed: 0 });
    expect(result.totals.estimatedInputTokens["tool-output"]).toBeGreaterThan(100);
  });

  it("links subagent tasks with their usage and the calls they made", () => {
    const result = inspectThread(
      base([
        activity(
          "task.started",
          { taskId: "k1", taskType: "subagent", agentId: "ag1", title: "Explore repo" },
          "2026-09-27T10:00:00.000Z",
        ),
        activity(
          "tool.completed",
          { itemType: "file_change", toolCallId: "c2", title: "edit", agentId: "ag1" },
          "2026-09-27T10:00:01.000Z",
        ),
        activity(
          "task.completed",
          {
            taskId: "k1",
            status: "completed",
            summary: "Found it",
            usage: { totalTokens: 1234, toolUses: 3 },
          },
          "2026-09-27T10:00:05.000Z",
        ),
      ]),
    );
    expect(result.subagents).toHaveLength(1);
    expect(result.subagents[0]).toMatchObject({
      taskId: "k1",
      title: "Explore repo",
      status: "completed",
      totalTokens: 1234,
      toolUses: 3,
      agentId: "ag1",
    });
    expect(result.toolCalls[0]?.agentId).toBe("ag1");
    expect(result.inputs.some((input) => input.category === "subagent-result")).toBe(true);
  });

  it("reads context-window snapshots and compactions into per-turn growth", () => {
    const result = inspectThread(
      base(
        [
          activity(
            "context-window.updated",
            { usedTokens: 10_000, maxTokens: 200_000 },
            "2026-09-27T10:00:10.000Z",
            "turn-1",
          ),
          activity(
            "context-window.updated",
            { usedTokens: 50_000, maxTokens: 200_000 },
            "2026-09-27T10:05:10.000Z",
            "turn-2",
          ),
          activity(
            "context-compaction",
            { beforeTokens: 50_000, afterTokens: 8_000 },
            "2026-09-27T10:06:00.000Z",
            "turn-3",
          ),
          activity(
            "context-window.updated",
            { usedTokens: 8_000, maxTokens: 200_000 },
            "2026-09-27T10:06:01.000Z",
            "turn-3",
          ),
        ],
        {
          messages: [
            {
              messageId: "m1" as never,
              role: "user",
              turnId: "turn-1" as never,
              createdAt: "2026-09-27T10:00:00.000Z",
              text: "hello",
              textChars: 400,
              attachments: [],
            },
          ],
        },
      ),
    );
    expect(result.usage.map((point) => point.usedTokens)).toEqual([10_000, 50_000, 8_000]);
    expect(result.compactions[0]).toMatchObject({ beforeTokens: 50_000, afterTokens: 8_000 });
    expect(result.turns.map((turn) => turn.deltaTokens)).toEqual([null, 40_000, -42_000]);
    expect(result.turns[0]?.added.user).toBe(100);
    expect(result.turns[2]?.compactions).toBe(1);
    expect(result.totals.peakUsedTokens).toBe(50_000);
  });

  it("survives a cut payload without parsing it", () => {
    const cut: ThreadInspectActivity = {
      ...activity("tool.completed", {}, "2026-09-27T10:00:00.000Z"),
      payloadJson: '{"data":"aaaa',
      payloadBytes: 100_000,
      payloadTruncated: true,
    };
    const result = inspectThread(base([cut]));
    expect(result.toolCalls[0]?.outputChars).toBe(100_000);
    expect(prettyPayload(cut)).toContain("cut at");
  });
});

describe("formatTokenCount", () => {
  it("prints compact counts", () => {
    expect(formatTokenCount(950)).toBe("950");
    expect(formatTokenCount(1_234)).toBe("1.2k");
    expect(formatTokenCount(45_600)).toBe("46k");
    expect(formatTokenCount(1_500_000)).toBe("1.5M");
  });
});

describe("processedTokenSeries", () => {
  it("sums each request and falls back to the provider's running total", () => {
    const series = processedTokenSeries([
      usagePoint("2026-09-27T10:00:00.000Z", { lastInputTokens: 1000, lastOutputTokens: 200 }),
      usagePoint("2026-09-27T10:01:00.000Z", { lastInputTokens: 1500, lastOutputTokens: 100 }),
      usagePoint("2026-09-27T10:02:00.000Z", { totalProcessedTokens: 10_000 }),
      usagePoint("2026-09-27T10:03:00.000Z", { totalProcessedTokens: 12_500 }),
    ]);
    expect(series.map((point) => point.tokens)).toEqual([1200, 1600, 0, 2500]);
    expect(series.at(-1)?.cumulative).toBe(5300);
    expect(
      tokensBetween(
        series,
        Date.parse("2026-09-27T10:00:30.000Z"),
        Date.parse("2026-09-27T10:03:00.000Z"),
      ),
    ).toBe(4100);
  });
});

function usagePoint(at: string, fields: Partial<UsagePoint>): UsagePoint {
  return {
    activityId: at,
    at,
    turnId: null,
    usedTokens: 0,
    maxTokens: null,
    lastInputTokens: null,
    lastCachedInputTokens: null,
    lastOutputTokens: null,
    totalProcessedTokens: null,
    autoCompactThreshold: null,
    lastReasoningOutputTokens: null,
    ...fields,
  };
}

describe("buildAgentTimeline", () => {
  it("puts subagents in their own rows and each tool call in the row of its agent", () => {
    const inspection = inspectThread(
      base([
        activity(
          "tool.completed",
          { itemType: "command_execution", toolCallId: "main-1", title: "bash" },
          "2026-09-27T10:00:01.000Z",
        ),
        activity(
          "task.started",
          {
            taskId: "k1",
            taskType: "local_agent",
            role: "Explore",
            agentId: "ag1",
            title: "Map the repo",
            model: "haiku",
          },
          "2026-09-27T10:00:02.000Z",
        ),
        activity(
          "tool.completed",
          { itemType: "mcp_tool_call", toolCallId: "sub-1", title: "grep", agentId: "ag1" },
          "2026-09-27T10:00:03.000Z",
        ),
        activity(
          "task.completed",
          { taskId: "k1", status: "completed", summary: "12 packages" },
          "2026-09-27T10:00:09.000Z",
        ),
      ]),
    );
    const timeline = buildAgentTimeline(
      inspection,
      { label: "Main agent", detail: "Claude Code" },
      Date.parse("2026-09-27T10:01:00.000Z"),
    );
    expect(timeline.rows.map((row) => [row.label, row.detail])).toEqual([
      ["Main agent", "Claude Code"],
      ["Map the repo", "Explore · haiku"],
    ]);
    const byId = new Map(timeline.items.map((item) => [item.id, item]));
    expect(byId.get("main-1")?.rowIndex).toBe(0);
    expect(byId.get("sub-1")?.rowIndex).toBe(1);
    expect(byId.get("k1")).toMatchObject({
      kind: "subagent",
      rowIndex: 1,
      startedByRowIndex: 0,
      detail: "12 packages",
    });
    expect(byId.get("k1")!.endMs - byId.get("k1")!.startMs).toBe(7000);
  });
});

describe("contextAt", () => {
  it("reads the last snapshot at or before the instant", () => {
    const usage = [
      usagePoint("2026-09-27T10:00:00.000Z", { usedTokens: 100 }),
      usagePoint("2026-09-27T10:05:00.000Z", { usedTokens: 900 }),
    ];
    expect(contextAt([], Date.parse("2026-09-27T09:59:00.000Z"))).toBeNull();
    expect(contextAt(usage, Date.parse("2026-09-27T09:59:00.000Z"))).toBe(100);
    expect(contextAt(usage, Date.parse("2026-09-27T10:03:00.000Z"))).toBe(100);
    expect(contextAt(usage, Date.parse("2026-09-27T10:06:00.000Z"))).toBe(900);
  });
});

describe("reasoning", () => {
  it("keeps thinking out of the context estimate and links each thought to what followed", () => {
    const message = (
      id: string,
      role: string,
      at: string,
      text: string,
      updatedAt?: string,
    ): ThreadInspectResult["messages"][number] => ({
      messageId: id as never,
      role,
      turnId: "turn-1" as never,
      createdAt: at,
      ...(updatedAt ? { updatedAt } : {}),
      text,
      textChars: text.length,
      attachments: [],
    });
    const result = inspectThread(
      base(
        [
          activity(
            "tool.completed",
            { itemType: "command_execution", toolCallId: "c1", title: "ls" },
            "2026-09-27T10:00:05.000Z",
          ),
          activity(
            "tool.completed",
            { itemType: "command_execution", toolCallId: "c2", title: "git log" },
            "2026-09-27T10:00:20.000Z",
          ),
        ],
        {
          messages: [
            message("user:1", "user", "2026-09-27T10:00:00.000Z", "list files"),
            message(
              "reasoning:t1:raw:a",
              "reasoning",
              "2026-09-27T10:00:01.000Z",
              "I should list files first.",
              "2026-09-27T10:00:04.000Z",
            ),
            message(
              "reasoning:t1:summary:b",
              "reasoning",
              "2026-09-27T10:00:15.000Z",
              "Now the log.",
            ),
          ],
        },
      ),
    );
    expect(result.reasoning.map((block) => [block.kind, block.durationMs])).toEqual([
      ["raw", 3000],
      ["summary", null],
    ]);
    expect(result.thoughtChain.map((step) => step.actions.map((call) => call.title))).toEqual([
      ["ls"],
      ["git log"],
    ]);
    expect(result.inputs.some((input) => input.label.startsWith("reasoning"))).toBe(false);
    expect(result.turns[0]?.reasoningChars).toBe(
      "I should list files first.".length + "Now the log.".length,
    );
    expect(result.timeline.filter((entry) => entry.group === "thinking")).toHaveLength(2);
  });
});
