import type {
  SandboxAttachInput,
  SandboxCreateInput,
  SandboxSyncToHostInput,
  SandboxSyncToRemoteInput,
  SandboxRemotePreviewInput,
  SandboxRemotePushInput,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as SandboxManager from "../../../sandbox/SandboxManager.ts";
import * as McpToolAccess from "../../McpToolAccess.ts";
import { SandboxToolkit } from "./tools.ts";

const withManager = <A, E>(
  run: (manager: SandboxManager.SandboxManager["Service"]) => Effect.Effect<A, E>,
) =>
  Effect.gen(function* () {
    const manager = yield* SandboxManager.SandboxManager;
    return yield* run(manager);
  });

const handlers = {
  sandbox_list: McpToolAccess.reads(() =>
    withManager((manager) => manager.list.pipe(Effect.map((sandboxes) => ({ sandboxes })))),
  ),
  sandbox_create: McpToolAccess.writesEnvironment((input: SandboxCreateInput) =>
    withManager((manager) => manager.create(input)),
  ),
  sandbox_attach: McpToolAccess.writesEnvironment((input: SandboxAttachInput) =>
    withManager((manager) => manager.attach(input)),
  ),
  sandbox_detach: McpToolAccess.writesEnvironment((input: SandboxAttachInput) =>
    withManager((manager) => manager.detach(input)),
  ),
  sandbox_template_list: McpToolAccess.reads(() => withManager((manager) => manager.templateList)),
  sandbox_stop: McpToolAccess.writesEnvironment((input: { readonly sandboxId: string }) =>
    withManager((manager) => manager.stop(input)),
  ),
  sandbox_remove: McpToolAccess.writesEnvironment((input: { readonly sandboxId: string }) =>
    withManager((manager) => manager.remove(input)),
  ),
  sandbox_sync_to_host: McpToolAccess.writesEnvironment((input: SandboxSyncToHostInput) =>
    withManager((manager) => manager.syncToHost(input)),
  ),
  sandbox_sync_to_remote: McpToolAccess.writesEnvironment((input: SandboxSyncToRemoteInput) =>
    withManager((manager) => manager.syncToRemote(input)),
  ),
  sandbox_remote_preview: McpToolAccess.writesEnvironment((input: SandboxRemotePreviewInput) =>
    withManager((manager) => manager.remotePreview(input)),
  ),
  sandbox_remote_push: McpToolAccess.writesEnvironment((input: SandboxRemotePushInput) =>
    withManager((manager) => manager.remotePush(input)),
  ),
} satisfies McpToolAccess.Handlers<typeof SandboxToolkit.tools>;

export const layer = McpToolAccess.toLayer(SandboxToolkit, handlers);
