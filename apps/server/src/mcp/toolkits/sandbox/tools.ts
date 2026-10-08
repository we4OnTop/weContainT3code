import {
  SandboxAttachInput,
  SandboxCreateInput,
  SandboxSyncToHostInput,
  SandboxSyncToHostResult,
  SandboxSyncToRemoteInput,
  SandboxSyncToRemoteResult,
  SandboxRemotePreviewInput,
  SandboxRemotePreviewResult,
  SandboxRemotePushInput,
  SandboxRemotePushResult,
  SandboxError,
  SandboxInfo,
  SandboxListResult,
  SandboxTemplateListResult,
  OrchestratorMcpFailure,
} from "@t3tools/contracts";
import * as Schema from "effect/Schema";
import { Tool, Toolkit } from "effect/ai";

import * as ThreadManagementService from "../../../orchestration-v2/ThreadManagementService.ts";
import * as SandboxManager from "../../../sandbox/SandboxManager.ts";
import * as McpInvocationContext from "../../McpInvocationContext.ts";

// Access refusals from McpToolAccess surface as OrchestratorMcpFailure.
const SandboxToolFailure = Schema.Union([SandboxError, OrchestratorMcpFailure]);
const sandboxToolDependencies = [
  SandboxManager.SandboxManager,
  McpInvocationContext.McpInvocationContext,
  ThreadManagementService.ThreadManagementService,
];

const sandboxTargetInput = Schema.Struct({
  sandboxId: Schema.String.annotate({
    description: "The sandbox to act on, from sandbox_list.",
  }),
});

const nonEmpty = Schema.String.check(Schema.isNonEmpty());

export const SandboxListTool = Tool.make("sandbox_list", {
  description:
    "List the Docker sandboxes this t3 application manages, keyed by host folder, with their status, template, image, published host port, attached chat threads, and pairing link.",
  success: SandboxListResult,
  failure: SandboxToolFailure,
  dependencies: sandboxToolDependencies,
})
  .annotate(Tool.Title, "List sandboxes")
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Idempotent, true);

export const SandboxCreateTool = Tool.make("sandbox_create", {
  description:
    "Create a Docker sandbox for a chat thread, or attach the thread to an existing sandbox by passing attachSandboxId. Builds the version-matched image from the chosen template (default template when templateId is omitted), attaches the project via git, boots the in-sandbox t3 server, and returns the sandbox info including a pairing URL.",
  parameters: SandboxCreateInput,
  success: SandboxInfo,
  failure: SandboxToolFailure,
  dependencies: sandboxToolDependencies,
}).annotate(Tool.Title, "Create chat sandbox");

export const SandboxStopTool = Tool.make("sandbox_stop", {
  description: "Stop a running sandbox. Its workspace is preserved and it can be resumed.",
  parameters: sandboxTargetInput,
  success: SandboxInfo,
  failure: SandboxToolFailure,
  dependencies: sandboxToolDependencies,
})
  .annotate(Tool.Title, "Stop sandbox")
  .annotate(Tool.Destructive, true);

export const SandboxRemoveTool = Tool.make("sandbox_remove", {
  description:
    "Remove a sandbox and its docker git receiver repository. Un-synced workspace changes inside the sandbox are lost.",
  parameters: sandboxTargetInput,
  success: Schema.Struct({ sandboxId: nonEmpty }),
  failure: SandboxToolFailure,
  dependencies: sandboxToolDependencies,
})
  .annotate(Tool.Title, "Remove sandbox")
  .annotate(Tool.Destructive, true);

export const SandboxSyncToHostTool = Tool.make("sandbox_sync_to_host", {
  description:
    "Synchronize sandbox work to the host: optionally commit pending sandbox changes with commitMessage, fetch the sandbox workspace over git into the host project, integrate it into the local 'sandbox/<name>' branch, and mirror it into the docker git receiver.",
  parameters: SandboxSyncToHostInput,
  success: SandboxSyncToHostResult,
  failure: SandboxToolFailure,
  dependencies: sandboxToolDependencies,
}).annotate(Tool.Title, "Sync sandbox to host");

export const SandboxSyncToRemoteTool = Tool.make("sandbox_sync_to_remote", {
  description:
    "Push the integrated sandbox branch ('sandbox/<name>') from the host project to a git remote (default 'origin'). Run sandbox_sync_to_host first.",
  parameters: SandboxSyncToRemoteInput,
  success: SandboxSyncToRemoteResult,
  failure: SandboxToolFailure,
  dependencies: sandboxToolDependencies,
}).annotate(Tool.Title, "Push sandbox branch to remote");

export const SandboxRemotePreviewTool = Tool.make("sandbox_remote_preview", {
  description:
    "Preview publishing a sandbox's work from the docker git receiver to a git remote: the receiver commit, the target remote branch and its relation (new-branch, fast-forward, up-to-date, diverged), the commits and files that would be pushed, and the host git identity. Run sandbox_sync_to_host first so the receiver holds the latest work.",
  parameters: SandboxRemotePreviewInput,
  success: SandboxRemotePreviewResult,
  failure: SandboxToolFailure,
  dependencies: sandboxToolDependencies,
})
  .annotate(Tool.Title, "Preview receiver push")
  .annotate(Tool.Readonly, true);

export const SandboxRemotePushTool = Tool.make("sandbox_remote_push", {
  description:
    "Push the previewed receiver work to a git remote. expectedSourceSha must be the sourceSha from sandbox_remote_preview. authorMode 'keep' publishes the sandbox commits as they are; 'host' or 'custom' (with author) re-creates them under that identity; squash publishes a single commit. force replaces a diverged remote branch with --force-with-lease.",
  parameters: SandboxRemotePushInput,
  success: SandboxRemotePushResult,
  failure: SandboxToolFailure,
  dependencies: sandboxToolDependencies,
})
  .annotate(Tool.Title, "Push receiver work to remote")
  .annotate(Tool.Destructive, true);

export const SandboxAttachTool = Tool.make("sandbox_attach", {
  description:
    "Attach a chat thread to an existing sandbox so both share one workspace. Use sandbox_list to find sandboxes on the same project folder.",
  parameters: SandboxAttachInput,
  success: SandboxInfo,
  failure: SandboxToolFailure,
  dependencies: sandboxToolDependencies,
}).annotate(Tool.Title, "Attach chat to sandbox");

export const SandboxDetachTool = Tool.make("sandbox_detach", {
  description:
    "Detach a chat thread from a sandbox. The sandbox keeps running for any other threads still attached.",
  parameters: SandboxAttachInput,
  success: SandboxInfo,
  failure: SandboxToolFailure,
  dependencies: sandboxToolDependencies,
}).annotate(Tool.Title, "Detach chat from sandbox");

export const SandboxTemplateListTool = Tool.make("sandbox_template_list", {
  description:
    "List the sandbox templates new sandboxes can be built from, including which one is the default.",
  success: SandboxTemplateListResult,
  failure: SandboxToolFailure,
  dependencies: sandboxToolDependencies,
})
  .annotate(Tool.Title, "List sandbox templates")
  .annotate(Tool.Readonly, true)
  .annotate(Tool.Idempotent, true);

export const SandboxToolkit = Toolkit.make(
  SandboxListTool,
  SandboxCreateTool,
  SandboxAttachTool,
  SandboxDetachTool,
  SandboxTemplateListTool,
  SandboxStopTool,
  SandboxRemoveTool,
  SandboxSyncToHostTool,
  SandboxSyncToRemoteTool,
  SandboxRemotePreviewTool,
  SandboxRemotePushTool,
);
