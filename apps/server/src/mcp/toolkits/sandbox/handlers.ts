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
import { SandboxToolkit } from "./tools.ts";

const withManager = <A, E>(
  run: (manager: SandboxManager.SandboxManager["Service"]) => Effect.Effect<A, E>,
) =>
  Effect.gen(function* () {
    const manager = yield* SandboxManager.SandboxManager;
    return yield* run(manager);
  });

const handlers = {
  sandbox_list: () =>
    withManager((manager) => manager.list.pipe(Effect.map((sandboxes) => ({ sandboxes })))),
  sandbox_create: (input: SandboxCreateInput) => withManager((manager) => manager.create(input)),
  sandbox_attach: (input: SandboxAttachInput) => withManager((manager) => manager.attach(input)),
  sandbox_detach: (input: SandboxAttachInput) => withManager((manager) => manager.detach(input)),
  sandbox_template_list: () => withManager((manager) => manager.templateList),
  sandbox_stop: (input: { readonly sandboxId: string }) =>
    withManager((manager) => manager.stop(input)),
  sandbox_remove: (input: { readonly sandboxId: string }) =>
    withManager((manager) => manager.remove(input)),
  sandbox_sync_to_host: (input: SandboxSyncToHostInput) =>
    withManager((manager) => manager.syncToHost(input)),
  sandbox_sync_to_remote: (input: SandboxSyncToRemoteInput) =>
    withManager((manager) => manager.syncToRemote(input)),
  sandbox_remote_preview: (input: SandboxRemotePreviewInput) =>
    withManager((manager) => manager.remotePreview(input)),
  sandbox_remote_push: (input: SandboxRemotePushInput) =>
    withManager((manager) => manager.remotePush(input)),
} satisfies Parameters<typeof SandboxToolkit.toLayer>[0];

export const SandboxToolkitHandlersLive = SandboxToolkit.toLayer(handlers);
