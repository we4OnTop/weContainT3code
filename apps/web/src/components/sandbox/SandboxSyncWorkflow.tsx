import type { EnvironmentId, SandboxActivityResult, SandboxInfo } from "@t3tools/contracts";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { RefreshCwIcon, UploadIcon } from "lucide-react";
import { type ReactNode, useState } from "react";

import { sandboxEnvironment } from "~/state/sandbox";
import { useAtomCommand } from "~/state/use-atom-command";
import { SandboxRemotePushDialog } from "../chat/SandboxRemotePushDialog";
import { Button } from "../ui/button";
import { toastManager } from "../ui/toast";
import { PipelineFlow } from "./PipelineFlow";
import { buildSyncFlow, SYNC_FLOW_CARD } from "./syncFlow";

/**
 * Every sandbox's way home as a flow: sandbox → host branch → git receiver →
 * remote, with the last outcome on each hop and the two actions that move
 * work forward (sync, push) on the card they act from.
 */
export function SandboxSyncWorkflow({
  environmentId,
  sandboxes,
  activity,
  now,
  onChanged,
}: {
  readonly environmentId: EnvironmentId;
  readonly sandboxes: ReadonlyArray<SandboxInfo>;
  readonly activity: SandboxActivityResult | null;
  /** When `activity` was read; relative times count from here. */
  readonly now: number;
  readonly onChanged: () => void;
}) {
  const syncToHost = useAtomCommand(sandboxEnvironment.syncToHost, { reportFailure: false });
  const [syncing, setSyncing] = useState<string | null>(null);
  const [pushSandbox, setPushSandbox] = useState<SandboxInfo | null>(null);

  const sync = (sandbox: SandboxInfo) => {
    setSyncing(sandbox.sandboxId);
    void syncToHost({ environmentId, input: { sandboxId: sandbox.sandboxId } }).then((result) => {
      setSyncing(null);
      onChanged();
      if (result._tag === "Failure") {
        toastManager.add({
          type: "error",
          title: "Sync failed",
          description: errorMessage(squashAtomCommandFailure(result)),
        });
      }
    });
  };

  if (sandboxes.length === 0) {
    return <p className="text-muted-foreground text-sm">No sandboxes yet.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      {sandboxes.map((sandbox) => {
        const flow = buildSyncFlow({
          sandbox,
          events: (activity?.events ?? []).filter((event) => event.sandboxId === sandbox.sandboxId),
          channel: activity?.channels.find((channel) => channel.sandboxId === sandbox.sandboxId),
          docker: activity?.docker,
          now,
        });
        const canSync = sandbox.status === "running" && syncing === null;
        const actions: Record<string, ReactNode> = {
          [SYNC_FLOW_CARD.hostBranch]: (
            <Button
              size="icon-xs"
              variant="ghost-muted"
              aria-label={`Sync ${sandbox.name} to host`}
              disabled={!canSync}
              onClick={() => sync(sandbox)}
            >
              <RefreshCwIcon />
            </Button>
          ),
          [SYNC_FLOW_CARD.remote]: (
            <Button
              size="icon-xs"
              variant="ghost-muted"
              aria-label={`Push ${sandbox.name} to a remote`}
              onClick={() => setPushSandbox(sandbox)}
            >
              <UploadIcon />
            </Button>
          ),
        };
        return (
          <section key={sandbox.sandboxId} className="flex flex-col gap-1.5">
            <h3 className="text-xs font-medium">
              {sandbox.name}
              <span className="text-muted-foreground font-normal"> · {sandbox.projectCwd}</span>
            </h3>
            <PipelineFlow
              ariaLabel={`How work from ${sandbox.name} reaches the remote`}
              stages={flow.stages.map((stage) => ({
                ...stage,
                cards: stage.cards.map((card) =>
                  actions[card.id] === undefined ? card : { ...card, actions: actions[card.id] },
                ),
              }))}
              edges={flow.edges}
            />
          </section>
        );
      })}
      <p className="text-muted-foreground text-xs">
        Work moves left to right. Sync (↻) collects the sandbox&apos;s commits into the host branch
        and mirrors them into the git receiver; the agent can trigger the same with t3-sync while
        the host channel is up. Push (↑) publishes the receiver&apos;s copy and works while the
        sandbox is stopped. Red marks the hop that failed last.
      </p>
      {pushSandbox === null ? null : (
        <SandboxRemotePushDialog
          environmentId={environmentId}
          sandbox={pushSandbox}
          open
          onOpenChange={(open) => {
            if (!open) {
              setPushSandbox(null);
              onChanged();
            }
          }}
        />
      )}
    </div>
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
