import * as Schema from "effect/Schema";
import {
  EventId,
  IsoDateTime,
  MessageId,
  NonNegativeInt,
  ThreadId,
  TrimmedNonEmptyString,
  TurnId,
} from "./baseSchemas.ts";

/**
 * The raw record behind one chat: every stored message and activity (tool
 * calls, subagent tasks, context-window snapshots, compactions), unprojected.
 * The regular thread stream drops tool inputs and outputs; the inspector panel
 * reads them from here. Everything in it is provider/agent output and must be
 * rendered as text.
 */

/** Stored characters per message text before it is cut. */
export const THREAD_INSPECT_MESSAGE_TEXT_LIMIT = 20_000;
/** Stored bytes per activity payload (JSON) before it is cut. */
export const THREAD_INSPECT_PAYLOAD_LIMIT = 64_000;
/** Newest activities returned; older ones are left out. */
export const THREAD_INSPECT_ACTIVITY_LIMIT = 5_000;

/** Messages returned per chat (a remote server gets no more than this). */
export const THREAD_INSPECT_MESSAGE_LIMIT = 20_000;

const ShortText = Schema.String.check(Schema.isMaxLength(2_000));

export const ThreadInspectInput = Schema.Struct({
  threadId: ThreadId,
});
export type ThreadInspectInput = typeof ThreadInspectInput.Type;

export const ThreadInspectAttachment = Schema.Struct({
  type: ShortText,
  name: ShortText,
  mimeType: ShortText,
  sizeBytes: NonNegativeInt,
});
export type ThreadInspectAttachment = typeof ThreadInspectAttachment.Type;

export const ThreadInspectMessage = Schema.Struct({
  messageId: MessageId,
  role: ShortText,
  turnId: Schema.NullOr(TurnId),
  createdAt: IsoDateTime,
  /** Possibly cut at THREAD_INSPECT_MESSAGE_TEXT_LIMIT; `textChars` is the full length. */
  text: Schema.String.check(Schema.isMaxLength(THREAD_INSPECT_MESSAGE_TEXT_LIMIT)),
  textChars: NonNegativeInt,
  attachments: Schema.Array(ThreadInspectAttachment).check(Schema.isMaxLength(100)),
});
export type ThreadInspectMessage = typeof ThreadInspectMessage.Type;

export const ThreadInspectActivity = Schema.Struct({
  activityId: EventId,
  kind: ShortText,
  tone: ShortText,
  summary: ShortText,
  turnId: Schema.NullOr(TurnId),
  sequence: Schema.optional(NonNegativeInt),
  createdAt: IsoDateTime,
  /** The stored payload as JSON, possibly cut at THREAD_INSPECT_PAYLOAD_LIMIT. */
  payloadJson: Schema.String.check(Schema.isMaxLength(THREAD_INSPECT_PAYLOAD_LIMIT)),
  /** Size of the full payload JSON. */
  payloadBytes: NonNegativeInt,
  payloadTruncated: Schema.Boolean,
});
export type ThreadInspectActivity = typeof ThreadInspectActivity.Type;

export const ThreadInspectResult = Schema.Struct({
  threadId: ThreadId,
  messages: Schema.Array(ThreadInspectMessage).check(
    Schema.isMaxLength(THREAD_INSPECT_MESSAGE_LIMIT),
  ),
  activities: Schema.Array(ThreadInspectActivity).check(
    Schema.isMaxLength(THREAD_INSPECT_ACTIVITY_LIMIT),
  ),
  /** True when older activities exist beyond the returned window. */
  olderActivitiesOmitted: Schema.Boolean,
});
export type ThreadInspectResult = typeof ThreadInspectResult.Type;

export class ThreadInspectError extends Schema.TaggedError<ThreadInspectError>()(
  "ThreadInspectError",
  {
    message: TrimmedNonEmptyString,
    cause: Schema.optional(Schema.Defect()),
  },
) {}
