import {
  SANDBOX_CREATE_STEPS,
  SANDBOX_CREATE_STEP_LABELS,
  SANDBOX_NETWORK_RESOURCE_PATTERN,
  sandboxNetworkResourceRisk,
  type EnvironmentId,
  type SandboxCreateOptions,
  type SandboxCreateProgress,
  type SandboxCreateStep,
  type SandboxCreateStepStatus,
  type SandboxInfo,
  type ThreadId,
} from "@t3tools/contracts";
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CircleIcon,
  ContainerIcon,
  CopyIcon,
  DownloadIcon,
  LinkIcon,
  MinusIcon,
  SquareIcon,
  UploadIcon,
  XIcon,
} from "lucide-react";
import { useCallback, useMemo, useState, type ReactNode } from "react";

import { toastManager } from "~/components/ui/toast";
import { connectPairing } from "~/connection/onboarding";
import { useEnvironmentQuery } from "~/state/query";
import { useEnvironments, usePrimaryEnvironmentId } from "~/state/environments";
import { useProjects } from "~/state/entities";
import { sandboxEnvironment, useHostSandboxesByEnvironmentId } from "~/state/sandbox";
import { useAtomCommand } from "~/state/use-atom-command";
import {
  squashAtomCommandFailure,
  type AtomCommandResult,
} from "@t3tools/client-runtime/state/runtime";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Separator } from "../ui/separator";
import { Spinner } from "../ui/spinner";
import { Switch } from "../ui/switch";
import { Textarea } from "../ui/textarea";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { SandboxRemotePushDialog, warnAboutHostRiskPaths } from "./SandboxRemotePushDialog";

interface SandboxControlProps {
  readonly environmentId: EnvironmentId;
  readonly threadId: ThreadId;
  readonly projectCwd: string | null;
}

const STATUS_BADGE_VARIANT: Record<
  SandboxInfo["status"],
  "default" | "secondary" | "destructive" | "outline"
> = {
  creating: "secondary",
  running: "default",
  stopped: "outline",
  error: "destructive",
  removing: "secondary",
};

type ProgressByStep = Partial<Record<SandboxCreateStep, SandboxCreateProgress>>;

export default function SandboxControl({
  environmentId,
  threadId,
  projectCwd,
}: SandboxControlProps) {
  const { environments } = useEnvironments();
  const projects = useProjects();
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProgressByStep | null>(null);
  const [templateId, setTemplateId] = useState<string | null>(null);
  /** Options of the most recent create, replayed verbatim by a retry. */
  const [lastCreateOptions, setLastCreateOptions] = useState<{
    readonly attachSandboxId?: string;
  }>({});
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [createOptions, setCreateOptions] = useState<CreateOptionsDraft>(EMPTY_OPTIONS_DRAFT);
  const [transferOpen, setTransferOpen] = useState(false);

  const sandboxesSupported = environments.some(
    (environment) =>
      environment.environmentId === environmentId &&
      environment.serverConfig?.environment.capabilities.sandboxes === true,
  );
  const projectId = useMemo(
    () =>
      projects.find(
        (project) =>
          project.environmentId === environmentId && project.workspaceRoot === projectCwd,
      )?.id ?? null,
    [projects, environmentId, projectCwd],
  );

  const listQuery = useEnvironmentQuery(sandboxEnvironment.list({ environmentId, input: {} }));
  const templatesQuery = useEnvironmentQuery(
    sandboxEnvironment.templateList({ environmentId, input: {} }),
  );
  const sandboxes = listQuery.data?.sandboxes ?? [];
  const sandbox = sandboxes.find((candidate) => candidate.threadIds.includes(threadId)) ?? null;

  /**
   * Sandboxes on this chat's folder that belong to other chats. These are the
   * attach candidates: reuse is always offered, never applied on its own.
   */
  const attachable = useMemo(
    () =>
      sandboxes.filter(
        (candidate) =>
          candidate.projectCwd === projectCwd &&
          !candidate.threadIds.includes(threadId) &&
          candidate.status !== "removing" &&
          // A failed sandbox is the owning chat's to retry, not another chat's to join.
          candidate.status !== "error",
      ),
    [sandboxes, projectCwd, threadId],
  );

  const templates = templatesQuery.data?.templates ?? [];
  const defaultTemplateId = templatesQuery.data?.defaultTemplateId ?? null;
  const selectedTemplateId = templateId ?? defaultTemplateId;

  const createStream = useAtomCommand(sandboxEnvironment.createStream, { reportFailure: false });
  const connectPairingEnvironment = useAtomCommand(connectPairing, { reportFailure: false });
  const stop = useAtomCommand(sandboxEnvironment.stop, { reportFailure: false });
  const detach = useAtomCommand(sandboxEnvironment.detach, { reportFailure: false });
  const syncToHost = useAtomCommand(sandboxEnvironment.syncToHost, { reportFailure: false });

  const reportFailure = useCallback((title: string, description: string) => {
    toastManager.add({ type: "error", title, description });
  }, []);

  const openSandbox = useCallback(
    (options: { readonly attachSandboxId?: string }) => {
      if (projectId === null || projectCwd === null) return;
      setPendingAction("create");
      setLastCreateOptions(options);
      setProgress({});
      const resolvedOptions = toCreateOptions(createOptions);
      void createStream({
        environmentId,
        input: {
          projectId,
          threadId,
          projectCwd,
          ...(options.attachSandboxId === undefined
            ? {
                ...(selectedTemplateId === null ? {} : { templateId: selectedTemplateId }),
                ...(resolvedOptions === undefined ? {} : { options: resolvedOptions }),
              }
            : { attachSandboxId: options.attachSandboxId }),
        },
        onProgress: (event) => {
          setProgress((current) => ({ ...current, [event.step]: event }));
        },
      }).then(async (result) => {
        setPendingAction(null);
        if (result._tag === "Failure") {
          reportFailure("Failed to open sandbox", errorMessage(squashAtomCommandFailure(result)));
          return;
        }
        setProgress(null);
        const pairingUrl = result.value.sandbox?.pairingUrl ?? null;
        if (options.attachSandboxId !== undefined || pairingUrl === null) {
          toastManager.add({
            type: "success",
            title:
              options.attachSandboxId === undefined ? "Sandbox is running" : "Attached to sandbox",
            description: "Copy the pairing link to attach it as a remote environment.",
          });
          return;
        }
        // A fresh sandbox already minted its pairing token; use it in place of
        // the copy-the-link dance. Pairing failure falls back to the manual
        // link flow instead of failing the create.
        const pairingResult = await connectPairingEnvironment({ pairingUrl });
        if (pairingResult._tag === "Failure") {
          const cause = squashAtomCommandFailure(pairingResult);
          toastManager.add({
            type: "error",
            title: "Sandbox connected, but automatic pairing failed",
            description: `${cause instanceof Error ? cause.message : "Pairing failed."} Copy the pairing link from this menu to attach it manually.`,
          });
          return;
        }
        toastManager.add({
          type: "success",
          title: "Sandbox connected",
          description: "The environment is paired and ready in your connections.",
        });
      });
    },
    [
      connectPairingEnvironment,
      createStream,
      environmentId,
      projectId,
      projectCwd,
      threadId,
      selectedTemplateId,
      createOptions,
      reportFailure,
    ],
  );

  const runSandboxCommand = useCallback(
    (
      action: string,
      run: () => Promise<AtomCommandResult<unknown, unknown>>,
      successTitle: string,
    ) => {
      setPendingAction(action);
      void run().then((result) => {
        setPendingAction(null);
        if (result._tag === "Failure") {
          reportFailure(successTitle, errorMessage(squashAtomCommandFailure(result)));
        } else {
          toastManager.add({ type: "success", title: successTitle });
        }
      });
    },
    [reportFailure],
  );

  if (!sandboxesSupported || projectId === null || projectCwd === null) {
    return null;
  }

  const busy = pendingAction !== null;
  const isRunning = sandbox?.status === "running";

  return (
    <>
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <Tooltip>
          <TooltipTrigger
            render={
              <PopoverTrigger
                render={
                  <Button aria-label="Chat sandbox" variant="ghost" size="icon-sm">
                    {sandbox?.status === "creating" || pendingAction === "create" ? (
                      <Spinner className="size-3.5" />
                    ) : (
                      <ContainerIcon />
                    )}
                  </Button>
                }
              />
            }
          />
          <TooltipPopup side="bottom">Chat sandbox</TooltipPopup>
        </Tooltip>
        <PopoverContent align="end" className="w-96">
          {progress !== null ? (
            <CreateProgress
              progress={progress}
              busy={busy}
              onRetry={() => openSandbox(lastCreateOptions)}
              onDismiss={() => setProgress(null)}
            />
          ) : sandbox === null ? (
            <div className="flex flex-col gap-3">
              {attachable.length > 0 ? (
                <div className="flex flex-col gap-2">
                  <p className="text-muted-foreground text-sm">
                    This folder already has {attachable.length === 1 ? "a sandbox" : "sandboxes"}.
                    Join {attachable.length === 1 ? "it" : "one"}, or build a new one below.
                  </p>
                  {attachable.map((candidate) => (
                    <Button
                      key={candidate.sandboxId}
                      size="sm"
                      variant="outline"
                      className="w-full justify-start"
                      disabled={busy}
                      onClick={() => openSandbox({ attachSandboxId: candidate.sandboxId })}
                    >
                      <LinkIcon className="size-3.5" />
                      <span className="min-w-0 truncate">{candidate.name}</span>
                      <Badge size="sm" variant={STATUS_BADGE_VARIANT[candidate.status]}>
                        {candidate.status}
                      </Badge>
                    </Button>
                  ))}
                  <Separator />
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">
                  Run this chat inside an isolated Docker sandbox with its own copy of the project
                  and its own t3 server.
                </p>
              )}
              {templates.length > 0 ? (
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-medium">Template</span>
                  <div className="flex flex-wrap gap-1">
                    {templates.map((template) => (
                      <Button
                        key={template.manifest.id}
                        size="xs"
                        variant={
                          template.manifest.id === selectedTemplateId ? "secondary" : "ghost-muted"
                        }
                        onClick={() => setTemplateId(template.manifest.id)}
                      >
                        {template.manifest.name}
                        {template.manifest.id === defaultTemplateId ? " ·" : ""}
                      </Button>
                    ))}
                  </div>
                </div>
              ) : null}
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs font-medium"
                onClick={() => setOptionsOpen((current) => !current)}
              >
                {optionsOpen ? (
                  <ChevronDownIcon className="size-3.5" />
                ) : (
                  <ChevronRightIcon className="size-3.5" />
                )}
                Options
                {toCreateOptions(createOptions) === undefined ? "" : " (customized)"}
              </button>
              {optionsOpen ? (
                <CreateOptionsForm draft={createOptions} onChange={setCreateOptions} />
              ) : null}
              <Button size="sm" onClick={() => openSandbox({})} disabled={busy}>
                {pendingAction === "create" ? <Spinner className="size-3.5" /> : <ContainerIcon />}
                Create sandbox for this chat
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-sm font-medium">{sandbox.name}</span>
                <Badge size="sm" variant={STATUS_BADGE_VARIANT[sandbox.status]}>
                  {sandbox.status}
                </Badge>
              </div>
              {sandbox.threadIds.length > 1 ? (
                <p className="text-muted-foreground text-xs">
                  Shared with {sandbox.threadIds.length - 1} other chat
                  {sandbox.threadIds.length === 2 ? "" : "s"}.
                </p>
              ) : null}
              {sandbox.status === "error" ? (
                <div className="flex flex-col gap-2">
                  {sandbox.message === null ? null : (
                    <p className="text-destructive text-xs">{sandbox.message}</p>
                  )}
                  <Button size="sm" disabled={busy} onClick={() => openSandbox({})}>
                    {pendingAction === "create" ? (
                      <Spinner className="size-3.5" />
                    ) : (
                      <ContainerIcon />
                    )}
                    Retry setup
                  </Button>
                </div>
              ) : null}
              <Separator />
              {sandbox.pairingUrl ? (
                <MenuActionButton
                  icon={<CopyIcon />}
                  label="Copy pairing link"
                  disabled={busy}
                  onClick={() => {
                    void navigator.clipboard.writeText(sandbox.pairingUrl ?? "");
                    toastManager.add({ type: "success", title: "Pairing link copied" });
                  }}
                />
              ) : null}
              <MenuActionButton
                icon={
                  pendingAction === "syncToHost" ? (
                    <Spinner className="size-3.5" />
                  ) : (
                    <DownloadIcon />
                  )
                }
                label="Sync sandbox to host"
                disabled={busy || !isRunning}
                onClick={() =>
                  runSandboxCommand(
                    "syncToHost",
                    () =>
                      syncToHost({ environmentId, input: { sandboxId: sandbox.sandboxId } }).then(
                        (result) => {
                          if (result._tag === "Success") {
                            warnAboutHostRiskPaths(result.value.hostRiskPaths);
                          }
                          return result;
                        },
                      ),
                    "Sandbox synced to host",
                  )
                }
              />
              {/* Reads the git receiver, not the sandbox, so it works while stopped. */}
              <MenuActionButton
                icon={<UploadIcon />}
                label="Push to remote…"
                disabled={busy || sandbox.status === "removing"}
                onClick={() => {
                  setPopoverOpen(false);
                  setTransferOpen(true);
                }}
              />
              <MenuActionButton
                icon={pendingAction === "detach" ? <Spinner className="size-3.5" /> : <MinusIcon />}
                label="Detach this chat"
                disabled={busy}
                onClick={() =>
                  runSandboxCommand(
                    "detach",
                    () =>
                      detach({ environmentId, input: { sandboxId: sandbox.sandboxId, threadId } }),
                    "Chat detached from sandbox",
                  )
                }
              />
              <MenuActionButton
                icon={pendingAction === "stop" ? <Spinner className="size-3.5" /> : <SquareIcon />}
                label="Stop sandbox"
                disabled={busy || !isRunning}
                destructive
                onClick={() =>
                  runSandboxCommand(
                    "stop",
                    () => stop({ environmentId, input: { sandboxId: sandbox.sandboxId } }),
                    "Sandbox stopped",
                  )
                }
              />
            </div>
          )}
        </PopoverContent>
      </Popover>
      {sandbox !== null && transferOpen ? (
        <SandboxRemotePushDialog
          environmentId={environmentId}
          sandbox={sandbox}
          open
          onOpenChange={setTransferOpen}
        />
      ) : null}
    </>
  );
}

/** Form state for create options; empty fields defer to the project's `.sandbox-config`. */
interface CreateOptionsDraft {
  readonly memory: string;
  readonly cpus: string;
  readonly allowHosts: string;
  readonly denyHosts: string;
  readonly warmCache: boolean | "project";
}

const EMPTY_OPTIONS_DRAFT: CreateOptionsDraft = {
  memory: "",
  cpus: "",
  allowHosts: "",
  denyHosts: "",
  warmCache: "project",
};

const hostList = (value: string) =>
  value
    .split(/[\s,]+/)
    .map((host) => host.trim().toLowerCase())
    .filter((host) => host.length > 0);

/** Hosts the create would reject, with the reason, so the form says so up front. */
function invalidHosts(draft: CreateOptionsDraft): string[] {
  return [
    ...hostList(draft.allowHosts).flatMap((host) => {
      if (!SANDBOX_NETWORK_RESOURCE_PATTERN.test(host)) return [`${host}: not a host name`];
      const risk = sandboxNetworkResourceRisk(host);
      return risk === null ? [] : [`${host}: ${risk} (allow it from the network view)`];
    }),
    ...hostList(draft.denyHosts)
      .filter((host) => !SANDBOX_NETWORK_RESOURCE_PATTERN.test(host))
      .map((host) => `${host}: not a host name`),
  ];
}

function toCreateOptions(draft: CreateOptionsDraft): SandboxCreateOptions | undefined {
  const cpus = Number(draft.cpus);
  const valid = (host: string) => SANDBOX_NETWORK_RESOURCE_PATTERN.test(host);
  const allowHosts = hostList(draft.allowHosts).filter(valid);
  const denyHosts = hostList(draft.denyHosts).filter(valid);
  const options: SandboxCreateOptions = {
    ...(/^[0-9]+(\.[0-9]+)?[a-zA-Z]{0,3}$/.test(draft.memory.trim())
      ? { memory: draft.memory.trim() }
      : {}),
    ...(draft.cpus.trim().length > 0 && Number.isFinite(cpus) && cpus > 0 ? { cpus } : {}),
    ...(allowHosts.length > 0 ? { allowHosts } : {}),
    ...(denyHosts.length > 0 ? { denyHosts } : {}),
    ...(draft.warmCache === "project" ? {} : { warmCache: draft.warmCache }),
  };
  return Object.keys(options).length === 0 ? undefined : options;
}

/**
 * weContain's create knobs. Everything left empty falls back to the project's
 * committed `.sandbox-config`, then to the sbx defaults.
 */
function CreateOptionsForm({
  draft,
  onChange,
}: {
  readonly draft: CreateOptionsDraft;
  readonly onChange: (draft: CreateOptionsDraft) => void;
}) {
  const patch = (update: Partial<CreateOptionsDraft>) => onChange({ ...draft, ...update });
  const problems = invalidHosts(draft);
  return (
    <div className="flex flex-col gap-2 rounded-md border p-2">
      <div className="flex gap-2">
        <label className="flex flex-1 flex-col gap-1 text-xs font-medium">
          Memory
          <Input
            placeholder="e.g. 8g"
            value={draft.memory}
            onChange={(event) => patch({ memory: event.target.value })}
          />
        </label>
        <label className="flex flex-1 flex-col gap-1 text-xs font-medium">
          CPUs
          <Input
            placeholder="e.g. 4"
            inputMode="decimal"
            value={draft.cpus}
            onChange={(event) => patch({ cpus: event.target.value })}
          />
        </label>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium">Outbound network</span>
        <p className="text-muted-foreground text-xs">
          Follows the global sbx policy (<span className="font-mono">sbx policy ls</span>). The
          hosts below apply to this sandbox only.
        </p>
      </div>
      <div className="flex gap-2">
        <label className="flex flex-1 flex-col gap-1 text-xs font-medium">
          Also allow
          <Textarea
            rows={2}
            placeholder="pypi.org files.pythonhosted.org"
            value={draft.allowHosts}
            onChange={(event) => patch({ allowHosts: event.target.value })}
          />
        </label>
        <label className="flex flex-1 flex-col gap-1 text-xs font-medium">
          Block
          <Textarea
            rows={2}
            placeholder="telemetry.example.com"
            value={draft.denyHosts}
            onChange={(event) => patch({ denyHosts: event.target.value })}
          />
        </label>
      </div>
      {problems.length > 0 ? (
        <ul className="text-destructive text-xs">
          {problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      ) : null}
      <label className="flex items-center gap-2 text-sm">
        <Switch
          checked={draft.warmCache !== false}
          onCheckedChange={(checked) => patch({ warmCache: checked })}
        />
        Reuse the saved gortex index for this folder
      </label>
      <p className="text-muted-foreground text-xs">
        Empty fields use the project's <span className="font-mono">.sandbox-config</span>.
      </p>
    </div>
  );
}

/**
 * Pipeline view of a sandbox create: every step is listed up front and fills in
 * as the server reports it, so a long image build reads as progress rather than
 * as a hang.
 */
function CreateProgress({
  progress,
  busy,
  onRetry,
  onDismiss,
}: {
  readonly progress: ProgressByStep;
  readonly busy: boolean;
  readonly onRetry: () => void;
  readonly onDismiss: () => void;
}) {
  const failed = SANDBOX_CREATE_STEPS.some((step) => progress[step]?.status === "failed");
  const done = SANDBOX_CREATE_STEPS.filter((step) => {
    const status = progress[step]?.status;
    return status === "done" || status === "skipped";
  }).length;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium">
          {failed ? "Sandbox setup failed" : "Setting up sandbox"}
        </span>
        <span className="text-muted-foreground text-xs">
          {done}/{SANDBOX_CREATE_STEPS.length}
        </span>
      </div>
      <div
        className="bg-muted h-1 w-full overflow-hidden rounded-full"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={SANDBOX_CREATE_STEPS.length}
        aria-valuenow={done}
      >
        <div
          className={failed ? "bg-destructive h-full" : "bg-primary h-full"}
          style={{ width: `${(done / SANDBOX_CREATE_STEPS.length) * 100}%` }}
        />
      </div>
      <ol className="flex flex-col gap-1">
        {SANDBOX_CREATE_STEPS.map((step) => {
          const event = progress[step];
          const status: SandboxCreateStepStatus = event?.status ?? "pending";
          return (
            <li key={step} className="flex items-start gap-2 text-sm">
              <StepIcon status={status} />
              <div className="flex min-w-0 flex-col">
                <span
                  className={
                    status === "pending"
                      ? "text-muted-foreground"
                      : status === "failed"
                        ? "text-destructive"
                        : undefined
                  }
                >
                  {SANDBOX_CREATE_STEP_LABELS[step]}
                </span>
                {event?.detail ? (
                  <span className="text-muted-foreground truncate text-xs">{event.detail}</span>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
      {failed ? (
        <div className="flex gap-2">
          <Button size="sm" className="flex-1" disabled={busy} onClick={onRetry}>
            {busy ? <Spinner className="size-3.5" /> : <ContainerIcon />}
            Try again
          </Button>
          <Button size="sm" variant="ghost-muted" disabled={busy} onClick={onDismiss}>
            Dismiss
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function StepIcon({ status }: { readonly status: SandboxCreateStepStatus }) {
  if (status === "running") return <Spinner className="mt-0.5 size-3.5" />;
  if (status === "done") return <CheckIcon className="mt-0.5 size-3.5 text-primary" />;
  if (status === "skipped") return <MinusIcon className="text-muted-foreground mt-0.5 size-3.5" />;
  if (status === "failed") return <XIcon className="text-destructive mt-0.5 size-3.5" />;
  return <CircleIcon className="text-muted-foreground/40 mt-0.5 size-3.5" />;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function MenuActionButton({
  icon,
  label,
  onClick,
  disabled,
  destructive,
}: {
  readonly icon: ReactNode;
  readonly label: string;
  readonly onClick: () => void;
  readonly disabled?: boolean;
  readonly destructive?: boolean;
}) {
  return (
    <Button
      variant={destructive ? "destructive-outline" : "outline"}
      size="sm"
      className="w-full justify-start"
      onClick={onClick}
      disabled={disabled}
    >
      {icon}
      {label}
    </Button>
  );
}

/**
 * Header menu for a chat that runs inside a sandbox. That chat talks to the
 * sandbox's own t3 server, which cannot manage sandboxes, so every action here
 * goes to the host instead. The sandbox is looked up in the host's own records
 * by environment id, never taken from what the sandbox server says about itself.
 */
export function SandboxEnvironmentControl({
  environmentId,
}: {
  readonly environmentId: EnvironmentId;
}) {
  const hostEnvironmentId = usePrimaryEnvironmentId();
  const sandbox = useHostSandboxesByEnvironmentId().get(environmentId) ?? null;
  const syncToHost = useAtomCommand(sandboxEnvironment.syncToHost, { reportFailure: false });
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);

  if (sandbox === null || hostEnvironmentId === null || hostEnvironmentId === environmentId) {
    return null;
  }

  const runSync = () => {
    setSyncing(true);
    void syncToHost({
      environmentId: hostEnvironmentId,
      input: { sandboxId: sandbox.sandboxId },
    }).then((result) => {
      setSyncing(false);
      if (result._tag === "Failure") {
        toastManager.add({
          type: "error",
          title: "Sync to host failed",
          description: errorMessage(squashAtomCommandFailure(result)),
        });
        return;
      }
      warnAboutHostRiskPaths(result.value.hostRiskPaths);
      toastManager.add({
        type: "success",
        title: "Sandbox synced to host",
        description: `${String(result.value.commitCount)} new commit(s) on ${result.value.branch}`,
      });
    });
  };

  return (
    <>
      <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
        <Tooltip>
          <TooltipTrigger
            render={
              <PopoverTrigger
                render={
                  <Button aria-label="Sandbox git sync" variant="ghost" size="icon-sm">
                    {syncing ? <Spinner className="size-3.5" /> : <ContainerIcon />}
                  </Button>
                }
              />
            }
          />
          <TooltipPopup side="bottom">Sandbox git sync</TooltipPopup>
        </Tooltip>
        <PopoverContent align="end" className="w-80">
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate text-sm font-medium">{sandbox.name}</span>
              <Badge size="sm" variant={STATUS_BADGE_VARIANT[sandbox.status]}>
                {sandbox.status}
              </Badge>
            </div>
            <p className="text-muted-foreground text-xs">
              This chat runs inside the sandbox. These actions run on your machine.
            </p>
            <Separator />
            <MenuActionButton
              icon={syncing ? <Spinner className="size-3.5" /> : <DownloadIcon />}
              label="Sync sandbox to host"
              disabled={syncing || sandbox.status !== "running"}
              onClick={runSync}
            />
            <MenuActionButton
              icon={<UploadIcon />}
              label="Push to remote…"
              disabled={syncing || sandbox.status === "removing"}
              onClick={() => {
                setPopoverOpen(false);
                setTransferOpen(true);
              }}
            />
          </div>
        </PopoverContent>
      </Popover>
      {transferOpen ? (
        <SandboxRemotePushDialog
          environmentId={hostEnvironmentId}
          sandbox={sandbox}
          open={transferOpen}
          onOpenChange={setTransferOpen}
        />
      ) : null}
    </>
  );
}
