/**
 * ThreadInspector - reads the full stored record of one chat for the chat
 * inspector panel: messages plus every activity (tool calls, subagent tasks,
 * context-window snapshots, compactions) with its unprojected payload.
 *
 * Read-only. Payloads and texts are cut to fixed sizes so one chat with huge
 * tool outputs cannot blow up a response.
 *
 * @module ThreadInspector
 */
import {
  THREAD_INSPECT_ACTIVITY_LIMIT,
  THREAD_INSPECT_MESSAGE_LIMIT,
  THREAD_INSPECT_MESSAGE_TEXT_LIMIT,
  THREAD_INSPECT_PAYLOAD_LIMIT,
  ThreadInspectError,
  type ThreadInspectActivity,
  type ThreadInspectInput,
  type ThreadInspectMessage,
  type ThreadInspectResult,
} from "@t3tools/contracts";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

import { ProjectionThreadActivityRepositoryLive } from "../persistence/Layers/ProjectionThreadActivities.ts";
import { ProjectionThreadMessageRepositoryLive } from "../persistence/Layers/ProjectionThreadMessages.ts";
import {
  ProjectionThreadActivityRepository,
  type ProjectionThreadActivity,
} from "../persistence/Services/ProjectionThreadActivities.ts";
import {
  ProjectionThreadMessageRepository,
  type ProjectionThreadMessage,
} from "../persistence/Services/ProjectionThreadMessages.ts";

export class ThreadInspector extends Context.Service<
  ThreadInspector,
  {
    readonly inspect: (
      input: ThreadInspectInput,
    ) => Effect.Effect<ThreadInspectResult, ThreadInspectError>;
  }
>()("t3/orchestration/ThreadInspector") {}

const utf8 = new TextEncoder();
const SHORT_TEXT_LIMIT = 2_000;

const short = (value: string) =>
  value.length > SHORT_TEXT_LIMIT ? value.slice(0, SHORT_TEXT_LIMIT) : value;

function payloadJson(payload: unknown): string {
  if (payload === undefined) return "null";
  try {
    return JSON.stringify(payload) ?? "null";
  } catch {
    return JSON.stringify("[unserializable payload]");
  }
}

export function toInspectActivity(row: ProjectionThreadActivity): ThreadInspectActivity {
  const json = payloadJson(row.payload);
  const truncated = json.length > THREAD_INSPECT_PAYLOAD_LIMIT;
  return {
    activityId: row.activityId,
    kind: short(row.kind),
    tone: row.tone,
    summary: short(row.summary),
    turnId: row.turnId,
    ...(row.sequence !== undefined ? { sequence: row.sequence } : {}),
    createdAt: row.createdAt,
    payloadJson: truncated ? json.slice(0, THREAD_INSPECT_PAYLOAD_LIMIT) : json,
    payloadBytes: utf8.encode(json).length,
    payloadTruncated: truncated,
  };
}

export function toInspectMessage(row: ProjectionThreadMessage): ThreadInspectMessage {
  return {
    messageId: row.messageId,
    role: row.role,
    turnId: row.turnId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    text:
      row.text.length > THREAD_INSPECT_MESSAGE_TEXT_LIMIT
        ? row.text.slice(0, THREAD_INSPECT_MESSAGE_TEXT_LIMIT)
        : row.text,
    textChars: row.text.length,
    attachments: (row.attachments ?? []).map((attachment) => ({
      type: short(attachment.type),
      name: short(attachment.name),
      mimeType: short(attachment.mimeType),
      sizeBytes: attachment.sizeBytes,
    })),
  };
}

const make = Effect.gen(function* () {
  const activities = yield* ProjectionThreadActivityRepository;
  const messages = yield* ProjectionThreadMessageRepository;

  const inspect = (input: ThreadInspectInput) =>
    Effect.gen(function* () {
      const [activityRows, messageRows] = yield* Effect.all(
        [
          // One extra row tells whether anything older was left out.
          activities.listByThreadId({
            threadId: input.threadId,
            limit: THREAD_INSPECT_ACTIVITY_LIMIT + 1,
          }),
          messages.listByThreadId({ threadId: input.threadId }),
        ],
        { concurrency: 2 },
      );
      const olderActivitiesOmitted = activityRows.length > THREAD_INSPECT_ACTIVITY_LIMIT;
      const window = olderActivitiesOmitted
        ? activityRows.slice(activityRows.length - THREAD_INSPECT_ACTIVITY_LIMIT)
        : activityRows;
      return {
        threadId: input.threadId,
        // The newest messages matter most once a chat is this long.
        messages: messageRows.slice(-THREAD_INSPECT_MESSAGE_LIMIT).map(toInspectMessage),
        activities: window.map(toInspectActivity),
        olderActivitiesOmitted,
      } satisfies ThreadInspectResult;
    }).pipe(
      Effect.mapError(
        (cause) => new ThreadInspectError({ message: "Failed to read the chat record", cause }),
      ),
    );

  return ThreadInspector.of({ inspect });
});

export const layer = Layer.effect(ThreadInspector, make).pipe(
  Layer.provide(ProjectionThreadActivityRepositoryLive),
  Layer.provide(ProjectionThreadMessageRepositoryLive),
);
