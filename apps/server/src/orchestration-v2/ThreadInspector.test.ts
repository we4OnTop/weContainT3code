import {
  THREAD_INSPECT_MESSAGE_TEXT_LIMIT,
  THREAD_INSPECT_PAYLOAD_LIMIT,
  type OrchestrationV2TurnItem,
} from "@t3tools/contracts";
import * as DateTime from "effect/DateTime";
import { describe, expect, it } from "vite-plus/test";

import { inspectRecords, toInspectActivity, toInspectMessage } from "./ThreadInspector.ts";

const activityRow = (payload: unknown) => ({
  activityId: "a1",
  turnId: null,
  tone: "tool",
  kind: "tool.completed",
  summary: "bash",
  payload,
  createdAt: "2026-09-27T10:00:00.000Z",
});

const at = (iso: string) => DateTime.makeUnsafe(iso);

const command = (overrides: Partial<OrchestrationV2TurnItem>) =>
  ({
    id: "item-1",
    threadId: "t1",
    runId: "run-1",
    nodeId: null,
    providerThreadId: null,
    providerTurnId: null,
    nativeItemRef: null,
    parentItemId: null,
    ordinal: 3,
    status: "completed",
    title: "bash",
    startedAt: at("2026-09-27T10:00:00.000Z"),
    completedAt: at("2026-09-27T10:00:02.000Z"),
    updatedAt: at("2026-09-27T10:00:02.000Z"),
    type: "command_execution",
    input: "ls",
    output: "a\nb",
    exitCode: 0,
    ...overrides,
  }) as OrchestrationV2TurnItem;

const records = (turnItems: ReadonlyArray<OrchestrationV2TurnItem>) =>
  inspectRecords({
    threadId: "t1" as never,
    messages: [],
    turnItems,
    providerTurns: [],
    nodes: [],
  });

describe("ThreadInspector", () => {
  it("keeps small payloads whole and reports their size", () => {
    const activity = toInspectActivity(activityRow({ data: { output: "ok" } }));
    expect(activity.payloadTruncated).toBe(false);
    expect(JSON.parse(activity.payloadJson)).toEqual({ data: { output: "ok" } });
    expect(activity.payloadBytes).toBe(activity.payloadJson.length);
  });

  it("cuts huge payloads at the limit but reports the full size", () => {
    const activity = toInspectActivity(
      activityRow({ data: "é".repeat(THREAD_INSPECT_PAYLOAD_LIMIT) }),
    );
    expect(activity.payloadTruncated).toBe(true);
    expect(activity.payloadJson.length).toBe(THREAD_INSPECT_PAYLOAD_LIMIT);
    // UTF-8 bytes of the whole payload, not of the cut text.
    expect(activity.payloadBytes).toBeGreaterThan(THREAD_INSPECT_PAYLOAD_LIMIT * 2);
  });

  it("cuts long message texts and keeps the full length", () => {
    const message = toInspectMessage({
      messageId: "m1",
      turnId: null,
      role: "assistant",
      text: "x".repeat(THREAD_INSPECT_MESSAGE_TEXT_LIMIT + 10),
      createdAt: "2026-09-27T10:00:00.000Z",
      updatedAt: "2026-09-27T10:00:00.000Z",
      attachments: [],
    });
    expect(message.text.length).toBe(THREAD_INSPECT_MESSAGE_TEXT_LIMIT);
    expect(message.textChars).toBe(THREAD_INSPECT_MESSAGE_TEXT_LIMIT + 10);
    expect(message.attachments).toEqual([]);
  });

  it("reads a finished command as a started and a completed tool call", () => {
    const result = records([command({})]);
    expect(result.activities.map((activity) => activity.kind)).toEqual([
      "tool.started",
      "tool.completed",
    ]);
    const completed = JSON.parse(result.activities[1]!.payloadJson);
    expect(completed).toMatchObject({
      toolCallId: "item-1",
      itemType: "command_execution",
      status: "completed",
      data: { input: "ls", output: "a\nb", exitCode: 0 },
    });
    expect(result.activities[1]!.turnId).toBe("run-1");
  });

  it("marks a command with a failing exit code as failed", () => {
    const result = records([command({ exitCode: 1 } as Partial<OrchestrationV2TurnItem>)]);
    expect(JSON.parse(result.activities[1]!.payloadJson).status).toBe("failed");
  });

  it("leaves a running tool call open", () => {
    const result = records([command({ status: "running", completedAt: null })]);
    expect(result.activities.map((activity) => activity.kind)).toEqual(["tool.started"]);
  });

  it("reads reasoning items as reasoning messages", () => {
    const result = records([
      {
        ...command({}),
        type: "reasoning",
        text: "thinking",
        streaming: false,
      } as OrchestrationV2TurnItem,
    ]);
    expect(result.activities).toEqual([]);
    expect(result.messages).toMatchObject([
      {
        role: "reasoning",
        text: "thinking",
        createdAt: "2026-09-27T10:00:00.000Z",
        updatedAt: "2026-09-27T10:00:02.000Z",
      },
    ]);
  });
});
