import {
  WS_METHODS,
  type EnvironmentId,
  type SandboxCreateInput,
  type SandboxCreateProgress,
} from "@t3tools/contracts";
import * as Effect from "effect/Effect";
import * as Stream from "effect/Stream";
import type { Atom, AtomRegistry } from "effect/reactivity";

import {
  createAtomCommandScheduler,
  createEnvironmentRpcCommand,
  createEnvironmentRpcQueryAtomFamily,
  createRuntimeStreamCommand,
  runStreamInEnvironment,
} from "./runtime.ts";
import { runStream } from "../rpc/client.ts";
import type { EnvironmentRegistry } from "../connection/registry.ts";

export interface SandboxCreateStreamTarget {
  readonly environmentId: EnvironmentId;
  readonly input: SandboxCreateInput;
  /** Called for every step event, in order, as the server reports it. */
  readonly onProgress: (progress: SandboxCreateProgress) => void;
}

export function createSandboxEnvironmentAtoms<R, E>(
  runtime: Atom.AtomRuntime<EnvironmentRegistry | R, E>,
) {
  const scheduler = createAtomCommandScheduler();
  const list = createEnvironmentRpcQueryAtomFamily(runtime, {
    label: "environment-data:sandbox:list",
    tag: WS_METHODS.sandboxList,
    staleTimeMs: 5_000,
  });

  const templateList = createEnvironmentRpcQueryAtomFamily(runtime, {
    label: "environment-data:sandbox:template-list",
    tag: WS_METHODS.sandboxTemplateList,
    staleTimeMs: 5_000,
  });

  const refreshList =
    (environmentId: Parameters<typeof list>[0]["environmentId"]) =>
    (registry: AtomRegistry.AtomRegistry) =>
      Effect.sync(() => registry.refresh(list({ environmentId, input: {} })));

  const refreshTemplates =
    (environmentId: Parameters<typeof templateList>[0]["environmentId"]) =>
    (registry: AtomRegistry.AtomRegistry) =>
      Effect.sync(() => registry.refresh(templateList({ environmentId, input: {} })));

  /**
   * Streaming create. The caller passes `onProgress` with the command input, so
   * each initialization step reaches the UI as it happens instead of the caller
   * waiting on one opaque promise; the resolved value is still the last event.
   */
  const createStream = createRuntimeStreamCommand(runtime, {
    label: "environment-data:sandbox:create-stream",
    scheduler,
    concurrency: {
      mode: "singleFlight",
      key: ({ environmentId, input }: SandboxCreateStreamTarget) =>
        JSON.stringify([environmentId, input.threadId]),
    },
    execute: (target: SandboxCreateStreamTarget) =>
      runStreamInEnvironment(
        target.environmentId,
        runStream(WS_METHODS.sandboxCreateStream, target.input).pipe(
          Stream.tap((progress) => Effect.sync(() => target.onProgress(progress))),
        ),
      ),
    // A failed create still leaves a sandbox record behind, so the list is
    // refreshed either way and the errored sandbox stays visible and removable.
    onSettled: ({ environmentId }: SandboxCreateStreamTarget, registry) =>
      refreshList(environmentId)(registry),
  });

  return {
    list,
    templateList,
    createStream,
    create: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:sandbox:create",
      tag: WS_METHODS.sandboxCreate,
      scheduler,
      concurrency: {
        mode: "singleFlight",
        key: ({ environmentId, input }) => JSON.stringify([environmentId, input.threadId]),
      },
      onSuccess: ({ environmentId }, registry) => refreshList(environmentId)(registry),
    }),
    attach: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:sandbox:attach",
      tag: WS_METHODS.sandboxAttach,
      scheduler,
      onSuccess: ({ environmentId }, registry) => refreshList(environmentId)(registry),
    }),
    detach: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:sandbox:detach",
      tag: WS_METHODS.sandboxDetach,
      scheduler,
      onSuccess: ({ environmentId }, registry) => refreshList(environmentId)(registry),
    }),
    stop: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:sandbox:stop",
      tag: WS_METHODS.sandboxStop,
      scheduler,
      onSuccess: ({ environmentId }, registry) => refreshList(environmentId)(registry),
    }),
    remove: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:sandbox:remove",
      tag: WS_METHODS.sandboxRemove,
      scheduler,
      onSuccess: ({ environmentId }, registry) => refreshList(environmentId)(registry),
    }),
    syncToHost: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:sandbox:sync-to-host",
      tag: WS_METHODS.sandboxSyncToHost,
      scheduler,
      onSuccess: ({ environmentId }, registry) => refreshList(environmentId)(registry),
    }),
    syncToRemote: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:sandbox:sync-to-remote",
      tag: WS_METHODS.sandboxSyncToRemote,
      scheduler,
      onSuccess: ({ environmentId }, registry) => refreshList(environmentId)(registry),
    }),
    // Preview is a command, not a cached query: it fetches from the receiver
    // and asks the remote, so it runs exactly when the dialog asks for it.
    remotePreview: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:sandbox:remote-preview",
      tag: WS_METHODS.sandboxRemotePreview,
      scheduler,
    }),
    remotePush: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:sandbox:remote-push",
      tag: WS_METHODS.sandboxRemotePush,
      scheduler,
      concurrency: {
        mode: "singleFlight",
        key: ({ environmentId, input }) => JSON.stringify([environmentId, input.sandboxId]),
      },
    }),
    // Network activity changes constantly; the overview is fetched on demand.
    networkOverview: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:sandbox:network-overview",
      tag: WS_METHODS.sandboxNetworkOverview,
      scheduler,
    }),
    activity: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:sandbox:activity",
      tag: WS_METHODS.sandboxActivity,
      scheduler,
    }),
    policyAddRule: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:sandbox:policy-add-rule",
      tag: WS_METHODS.sandboxPolicyAddRule,
      scheduler,
    }),
    policyRemoveRule: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:sandbox:policy-remove-rule",
      tag: WS_METHODS.sandboxPolicyRemoveRule,
      scheduler,
    }),
    templateSave: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:sandbox:template-save",
      tag: WS_METHODS.sandboxTemplateSave,
      scheduler,
      onSuccess: ({ environmentId }, registry) => refreshTemplates(environmentId)(registry),
    }),
    templateDelete: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:sandbox:template-delete",
      tag: WS_METHODS.sandboxTemplateDelete,
      scheduler,
      onSuccess: ({ environmentId }, registry) => refreshTemplates(environmentId)(registry),
    }),
    templateSetDefault: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:sandbox:template-set-default",
      tag: WS_METHODS.sandboxTemplateSetDefault,
      scheduler,
      onSuccess: ({ environmentId }, registry) => refreshTemplates(environmentId)(registry),
    }),
    templateExport: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:sandbox:template-export",
      tag: WS_METHODS.sandboxTemplateExport,
      scheduler,
    }),
    templateImport: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:sandbox:template-import",
      tag: WS_METHODS.sandboxTemplateImport,
      scheduler,
      onSuccess: ({ environmentId }, registry) => refreshTemplates(environmentId)(registry),
    }),
    templateValidate: createEnvironmentRpcCommand(runtime, {
      label: "environment-data:sandbox:template-validate",
      tag: WS_METHODS.sandboxTemplateValidate,
      scheduler,
    }),
  };
}

export type SandboxEnvironmentAtoms = ReturnType<typeof createSandboxEnvironmentAtoms>;
