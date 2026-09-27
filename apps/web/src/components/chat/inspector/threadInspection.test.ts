import type { ThreadInspectActivity, ThreadInspectResult } from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { formatTokenCount, inspectThread, prettyPayload } from "./threadInspection";

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
