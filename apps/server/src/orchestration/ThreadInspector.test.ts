import {
  THREAD_INSPECT_MESSAGE_TEXT_LIMIT,
  THREAD_INSPECT_PAYLOAD_LIMIT,
} from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { toInspectActivity, toInspectMessage } from "./ThreadInspector.ts";

const activityRow = (payload: unknown) => ({
  activityId: "a1" as never,
  threadId: "t1" as never,
  turnId: null,
  tone: "tool" as const,
  kind: "tool.completed",
  summary: "bash",
  payload,
  createdAt: "2026-09-27T10:00:00.000Z",
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
      messageId: "m1" as never,
      threadId: "t1" as never,
      turnId: null,
      role: "assistant",
      text: "x".repeat(THREAD_INSPECT_MESSAGE_TEXT_LIMIT + 10),
      isStreaming: false,
      createdAt: "2026-09-27T10:00:00.000Z",
      updatedAt: "2026-09-27T10:00:00.000Z",
    });
    expect(message.text.length).toBe(THREAD_INSPECT_MESSAGE_TEXT_LIMIT);
    expect(message.textChars).toBe(THREAD_INSPECT_MESSAGE_TEXT_LIMIT + 10);
    expect(message.attachments).toEqual([]);
  });
});
