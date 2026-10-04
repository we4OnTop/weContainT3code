import {
  SANDBOX_CLI_IDS,
  type EnvironmentId,
  type SandboxCliId,
  type SandboxInfo,
  type SandboxTemplate,
  type SandboxTemplateIssue,
  type SandboxTemplateManifest,
} from "@t3tools/contracts";
import {
  ContainerIcon,
  DownloadIcon,
  PlusIcon,
  SquareIcon,
  StarIcon,
  Trash2Icon,
  UploadIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { SandboxObservatoryDialog } from "../sandbox/SandboxObservatoryDialog";

import { environmentCatalog } from "~/connection/catalog";
import { useEnvironmentQuery } from "~/state/query";
import { useEnvironments } from "~/state/environments";
import { sandboxEnvironment } from "~/state/sandbox";
import { useAtomCommand } from "~/state/use-atom-command";
import {
  squashAtomCommandFailure,
  type AtomCommandResult,
} from "@t3tools/client-runtime/state/runtime";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import { Input } from "../ui/input";
import { ScrollArea } from "../ui/scroll-area";
import { Separator } from "../ui/separator";
import { Sheet, SheetContent } from "../ui/sheet";
import { Spinner } from "../ui/spinner";
import { Switch } from "../ui/switch";
import { Textarea } from "../ui/textarea";
import { Tooltip, TooltipPopup, TooltipTrigger } from "../ui/tooltip";
import { toastManager } from "../ui/toast";
import { SandboxRemotePushDialog } from "../chat/SandboxRemotePushDialog";
import { SandboxToolsField } from "./SandboxToolsField";

/** Optional template tooling, in the order the editor and the list show it. */
const TOOLING_FLAGS = [
  { key: "docker", label: "Docker in the sandbox", hint: "Needs a *-docker base image" },
  {
    key: "dreamfeed",
    label: "dreamfeed",
    hint: "Feed repo changes the agent did not make into each turn",
  },
  { key: "lateral", label: "lateral", hint: "Goal loops with orthogonal rethinking (MCP)" },
  { key: "openspec", label: "openspec", hint: "Scaffolded only when the project opts in" },
  { key: "headroom", label: "headroom", hint: "Tool-output compression (MCP)" },
  { key: "headroomProxy", label: "headroom proxy", hint: "Large; started only on opt-in" },
  { key: "serena", label: "serena", hint: "LSP symbol navigation (MCP)" },
] as const satisfies ReadonlyArray<{
  readonly key: keyof SandboxTemplateManifest;
  readonly label: string;
  readonly hint: string;
}>;

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

const CLI_LABELS: Record<SandboxCliId, string> = {
  codex: "Codex",
  claude: "Claude",
  cursor: "Cursor",
  grok: "Grok",
  opencode: "OpenCode",
};

interface TemplateDraft {
  readonly manifest: SandboxTemplateManifest;
  readonly dockerfile: string | undefined;
  readonly isNew: boolean;
}

const emptyDraft = (baseImage: string): TemplateDraft => ({
  manifest: {
    id: "",
    name: "",
    description: "",
    baseImage,
    clis: SANDBOX_CLI_IDS,
    gortex: false,
    env: {},
    setupCommands: [],
  },
  dockerfile: undefined,
  isNew: true,
});

/**
 * Sandboxes panel: a sheet docked beside the sidebar, over the main screen. Two
 * sections — the sandboxes this environment manages, and the templates new
 * sandboxes are built from.
 */
export function SandboxesMenu() {
  const { environments } = useEnvironments();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"sandboxes" | "templates">("sandboxes");
  const [observatoryOpen, setObservatoryOpen] = useState(false);

  const sandboxEnvironments = environments.filter(
    (environment) => environment.serverConfig?.environment.capabilities.sandboxes === true,
  );
  const primarySandboxEnvironment =
    sandboxEnvironments.find((environment) => environment.serverConfig !== undefined) ?? null;
  const environmentId = primarySandboxEnvironment?.environmentId ?? null;

  const listQuery = useEnvironmentQuery(
    environmentId !== null ? sandboxEnvironment.list({ environmentId, input: {} }) : null,
  );
  const sandboxes = listQuery.data?.sandboxes ?? [];
  const activeCount = sandboxes.filter((sandbox) => sandbox.status === "running").length;

  if (sandboxEnvironments.length === 0 || environmentId === null) {
    return null;
  }

  return (
    <>
      <Sheet open={open} onOpenChange={setOpen}>
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                aria-label={`Sandboxes (${activeCount} running)`}
                onClick={() => setOpen(true)}
                className="relative inline-flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
              />
            }
          >
            <ContainerIcon className="size-4" />
            {activeCount > 0 ? (
              <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-primary" />
            ) : null}
          </TooltipTrigger>
          <TooltipPopup side="top">Sandboxes</TooltipPopup>
        </Tooltip>
        <SheetContent
          side="left"
          // The desktop title bar under the header is a window drag area,
          // which would swallow clicks on the tabs.
          className="flex w-[30rem] max-w-[92vw] flex-col [-webkit-app-region:no-drag]"
        >
          {/* The corners belong to the sheet's close button (right) and the
              app's floating sidebar toggle (left). */}
          <div className="flex items-center gap-1 border-b py-3 ps-12 pe-12">
            <h2 className="mr-auto text-sm font-medium">Sandboxes</h2>
            <Button
              size="sm"
              variant="ghost-muted"
              onClick={() => {
                setOpen(false);
                setObservatoryOpen(true);
              }}
            >
              Observatory
            </Button>
            <Button
              size="sm"
              variant={tab === "sandboxes" ? "secondary" : "ghost-muted"}
              onClick={() => setTab("sandboxes")}
            >
              Running
            </Button>
            <Button
              size="sm"
              variant={tab === "templates" ? "secondary" : "ghost-muted"}
              onClick={() => setTab("templates")}
            >
              Templates
            </Button>
          </div>
          {tab === "sandboxes" ? (
            <SandboxList environmentId={environmentId} sandboxes={sandboxes} />
          ) : (
            <TemplatesSection environmentId={environmentId} />
          )}
        </SheetContent>
      </Sheet>
      {observatoryOpen ? (
        <SandboxObservatoryDialog
          environmentId={environmentId}
          open={observatoryOpen}
          onOpenChange={setObservatoryOpen}
        />
      ) : null}
    </>
  );
}

function SandboxList({
  environmentId,
  sandboxes,
}: {
  readonly environmentId: EnvironmentId;
  readonly sandboxes: ReadonlyArray<SandboxInfo>;
}) {
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [transferId, setTransferId] = useState<string | null>(null);
  const transferSandbox = sandboxes.find((sandbox) => sandbox.sandboxId === transferId) ?? null;
  const stop = useAtomCommand(sandboxEnvironment.stop, { reportFailure: false });
  const remove = useAtomCommand(sandboxEnvironment.remove, { reportFailure: false });
  const removeSavedEnvironment = useAtomCommand(environmentCatalog.remove, {
    reportFailure: false,
  });

  const run = useCallback(
    (
      sandboxId: string,
      command: (input: {
        readonly environmentId: EnvironmentId;
        readonly input: { readonly sandboxId: string };
      }) => Promise<AtomCommandResult<unknown, unknown>>,
      successTitle: string,
      failureTitle: string,
    ) => {
      setPendingId(sandboxId);
      void command({ environmentId, input: { sandboxId } }).then((result) => {
        setPendingId(null);
        if (result._tag === "Failure") {
          toastManager.add({
            type: "error",
            title: failureTitle,
            description: errorMessage(squashAtomCommandFailure(result)),
          });
        } else {
          toastManager.add({ type: "success", title: successTitle });
        }
      });
    },
    [environmentId],
  );

  if (sandboxes.length === 0) {
    return (
      <p className="text-muted-foreground p-4 text-sm">
        No sandboxes yet. Open one from a chat with the sandbox button in the top bar.
      </p>
    );
  }

  return (
    <ScrollArea className="flex-1">
      <div className="flex flex-col gap-1 p-2">
        {sandboxes.map((sandbox) => (
          <div key={sandbox.sandboxId} className="rounded-md px-2 py-2 hover:bg-accent">
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-sm">{sandbox.name}</span>
              <Badge size="sm" variant={STATUS_BADGE_VARIANT[sandbox.status]}>
                {sandbox.status}
              </Badge>
              <Button
                aria-label={`Push ${sandbox.name} to a remote`}
                title="Push to remote…"
                variant="ghost-muted"
                size="icon-xs"
                disabled={pendingId !== null || sandbox.status === "removing"}
                onClick={() => setTransferId(sandbox.sandboxId)}
              >
                <UploadIcon />
              </Button>
              <Button
                aria-label={`Stop ${sandbox.name}`}
                variant="ghost-muted"
                size="icon-xs"
                disabled={pendingId !== null || sandbox.status !== "running"}
                onClick={() =>
                  run(sandbox.sandboxId, stop, "Sandbox stopped", "Failed to stop sandbox")
                }
              >
                {pendingId === sandbox.sandboxId ? <Spinner className="size-3" /> : <SquareIcon />}
              </Button>
              <Button
                aria-label={`Remove ${sandbox.name}`}
                variant="ghost-muted"
                size="icon-xs"
                disabled={pendingId !== null}
                onClick={() => {
                  setPendingId(sandbox.sandboxId);
                  void remove({ environmentId, input: { sandboxId: sandbox.sandboxId } }).then(
                    async (result) => {
                      if (result._tag === "Failure") {
                        setPendingId(null);
                        toastManager.add({
                          type: "error",
                          title: "Failed to remove sandbox",
                          description: errorMessage(squashAtomCommandFailure(result)),
                        });
                        return;
                      }
                      // Its server is gone for good; a saved connection to it
                      // would only sit in the list reconnecting forever.
                      if (sandbox.environmentId !== undefined) {
                        await removeSavedEnvironment(sandbox.environmentId);
                      }
                      setPendingId(null);
                      toastManager.add({ type: "success", title: "Sandbox removed" });
                    },
                  );
                }}
              >
                <Trash2Icon />
              </Button>
            </div>
            <div className="text-muted-foreground mt-0.5 flex flex-wrap gap-x-3 text-xs">
              <span className="truncate">{sandbox.projectCwd}</span>
              {sandbox.hostPort !== null ? <span>127.0.0.1:{sandbox.hostPort}</span> : null}
              <span>template: {sandbox.templateId}</span>
              <span>
                {sandbox.threadIds.length} chat{sandbox.threadIds.length === 1 ? "" : "s"} attached
              </span>
              {sandbox.options?.memory !== undefined ? (
                <span>mem {sandbox.options.memory}</span>
              ) : null}
              {sandbox.options?.cpus !== undefined ? (
                <span>{sandbox.options.cpus} cpus</span>
              ) : null}
              {(sandbox.options?.allowHosts?.length ?? 0) > 0 ? (
                <span>+{sandbox.options?.allowHosts?.length} allowed hosts</span>
              ) : null}
              {(sandbox.options?.denyHosts?.length ?? 0) > 0 ? (
                <span>{sandbox.options?.denyHosts?.length} blocked hosts</span>
              ) : null}
            </div>
          </div>
        ))}
      </div>
      {transferSandbox !== null ? (
        <SandboxRemotePushDialog
          environmentId={environmentId}
          sandbox={transferSandbox}
          open
          onOpenChange={(open) => {
            if (!open) setTransferId(null);
          }}
        />
      ) : null}
    </ScrollArea>
  );
}

function TemplatesSection({ environmentId }: { readonly environmentId: EnvironmentId }) {
  const templatesQuery = useEnvironmentQuery(
    sandboxEnvironment.templateList({ environmentId, input: {} }),
  );
  const templates = templatesQuery.data?.templates ?? [];
  const defaultTemplateId = templatesQuery.data?.defaultTemplateId ?? null;

  const [draft, setDraft] = useState<TemplateDraft | null>(null);
  const [pending, setPending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const setDefault = useAtomCommand(sandboxEnvironment.templateSetDefault, {
    reportFailure: false,
  });
  const remove = useAtomCommand(sandboxEnvironment.templateDelete, { reportFailure: false });
  const exportTemplate = useAtomCommand(sandboxEnvironment.templateExport, {
    reportFailure: false,
  });
  const importTemplate = useAtomCommand(sandboxEnvironment.templateImport, {
    reportFailure: false,
  });

  const onExport = useCallback(
    (templateId: string) => {
      void exportTemplate({ environmentId, input: { templateId } }).then((result) => {
        if (result._tag === "Failure") {
          toastManager.add({
            type: "error",
            title: "Failed to export template",
            description: errorMessage(squashAtomCommandFailure(result)),
          });
          return;
        }
        downloadBase64(result.value.fileName, result.value.contentBase64);
      });
    },
    [environmentId, exportTemplate],
  );

  const onImportFile = useCallback(
    async (file: File) => {
      setPending(true);
      const contentBase64 = await fileToBase64(file);
      const result = await importTemplate({
        environmentId,
        input: { fileName: file.name, contentBase64, overwrite: true },
      });
      setPending(false);
      if (result._tag === "Failure") {
        toastManager.add({
          type: "error",
          title: "Failed to import template",
          description: errorMessage(squashAtomCommandFailure(result)),
        });
        return;
      }
      toastManager.add({ type: "success", title: `Imported ${result.value.manifest.name}` });
    },
    [environmentId, importTemplate],
  );

  if (draft !== null) {
    return (
      <TemplateEditor
        environmentId={environmentId}
        draft={draft}
        onDraftChange={setDraft}
        onClose={() => setDraft(null)}
      />
    );
  }

  return (
    <ScrollArea className="flex-1">
      <div className="flex flex-col gap-2 p-3">
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="secondary"
            onClick={() =>
              setDraft(
                emptyDraft(
                  templates[0]?.manifest.baseImage ?? "docker/sandbox-templates:claude-code",
                ),
              )
            }
          >
            <PlusIcon className="size-3.5" />
            New template
          </Button>
          <Button
            size="sm"
            variant="ghost-muted"
            disabled={pending}
            onClick={() => fileInputRef.current?.click()}
          >
            {pending ? <Spinner className="size-3.5" /> : <UploadIcon className="size-3.5" />}
            Import
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".tgz,.gz,.tar"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file !== undefined) {
                void onImportFile(file);
              }
            }}
          />
        </div>
        <Separator />
        {templates.map((template) => (
          <div key={template.manifest.id} className="rounded-md border p-2">
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {template.manifest.name}
              </span>
              {template.manifest.id === defaultTemplateId ? (
                <Badge size="sm" variant="default">
                  default
                </Badge>
              ) : null}
              {template.builtin ? (
                <Badge size="sm" variant="outline">
                  built in
                </Badge>
              ) : null}
            </div>
            <p className="text-muted-foreground mt-1 text-xs">{template.manifest.description}</p>
            <div className="text-muted-foreground mt-1 flex flex-wrap gap-x-2 text-xs">
              <span>
                {template.manifest.clis.map((cli) => CLI_LABELS[cli]).join(", ") || "no CLIs"}
              </span>
              {template.manifest.gortex ? <span>· gortex</span> : null}
              {TOOLING_FLAGS.filter((flag) => template.manifest[flag.key] === true).map((flag) => (
                <span key={flag.key}>· {flag.label}</span>
              ))}
              {(template.manifest.tools ?? []).map((tool) => (
                <span key={`tool:${tool.id}`}>· {tool.name}</span>
              ))}
              {template.manifest.commandLog === true ? <span>· command log</span> : null}
              {template.manifest.sudo === false ? <span>· no sudo</span> : null}
              {template.customDockerfile ? <span>· custom Dockerfile</span> : null}
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              <Button
                size="xs"
                variant="ghost-muted"
                disabled={template.manifest.id === defaultTemplateId}
                onClick={() => {
                  void setDefault({
                    environmentId,
                    input: { templateId: template.manifest.id },
                  }).then((result) => {
                    if (result._tag === "Failure") {
                      toastManager.add({
                        type: "error",
                        title: "Failed to set the default template",
                        description: errorMessage(squashAtomCommandFailure(result)),
                      });
                    }
                  });
                }}
              >
                <StarIcon className="size-3" />
                Default
              </Button>
              <Button
                size="xs"
                variant="ghost-muted"
                onClick={() =>
                  setDraft({
                    manifest: template.builtin
                      ? {
                          ...template.manifest,
                          id: `${template.manifest.id}-copy`,
                          name: `${template.manifest.name} copy`,
                        }
                      : template.manifest,
                    dockerfile: template.customDockerfile ? template.dockerfile : undefined,
                    isNew: template.builtin,
                  })
                }
              >
                {template.builtin ? "Duplicate" : "Edit"}
              </Button>
              <Button
                size="xs"
                variant="ghost-muted"
                onClick={() => onExport(template.manifest.id)}
              >
                <DownloadIcon className="size-3" />
                Export
              </Button>
              {template.builtin ? null : (
                <Button
                  size="xs"
                  variant="ghost-muted"
                  onClick={() => {
                    void remove({
                      environmentId,
                      input: { templateId: template.manifest.id },
                    }).then((result) => {
                      if (result._tag === "Failure") {
                        toastManager.add({
                          type: "error",
                          title: "Failed to delete template",
                          description: errorMessage(squashAtomCommandFailure(result)),
                        });
                      }
                    });
                  }}
                >
                  <Trash2Icon className="size-3" />
                  Delete
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </ScrollArea>
  );
}

function TemplateEditor({
  environmentId,
  draft,
  onDraftChange,
  onClose,
}: {
  readonly environmentId: EnvironmentId;
  readonly draft: TemplateDraft;
  readonly onDraftChange: (draft: TemplateDraft) => void;
  readonly onClose: () => void;
}) {
  const [validatedIssues, setIssues] = useState<ReadonlyArray<SandboxTemplateIssue>>([]);
  const [saving, setSaving] = useState(false);
  const validate = useAtomCommand(sandboxEnvironment.templateValidate, { reportFailure: false });
  const save = useAtomCommand(sandboxEnvironment.templateSave, { reportFailure: false });

  const manifest = draft.manifest;
  const patch = useCallback(
    (update: Partial<SandboxTemplateManifest>) =>
      onDraftChange({ ...draft, manifest: { ...draft.manifest, ...update } }),
    [draft, onDraftChange],
  );

  // Validation is server-side so the editor and the build agree on the rules.
  // Debounced because it runs on every keystroke.
  useEffect(() => {
    if (manifest.id.length === 0) {
      return;
    }
    const timer = setTimeout(() => {
      void validate({
        environmentId,
        input: {
          manifest,
          ...(draft.dockerfile === undefined ? {} : { dockerfile: draft.dockerfile }),
        },
      }).then((result) => {
        if (result._tag === "Success") {
          setIssues(result.value.issues);
        }
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [environmentId, manifest, draft.dockerfile, validate]);

  // Nothing is validated without an id; stale issues from an earlier id do not apply.
  const issues = manifest.id.length === 0 ? [] : validatedIssues;
  const blocking = issues.some((issue) => issue.severity === "error");
  const canSave = manifest.id.length > 0 && manifest.name.length > 0 && !blocking && !saving;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ScrollArea className="flex-1">
        <div className="flex flex-col gap-3 p-3">
          <label className="flex flex-col gap-1 text-xs font-medium">
            Id
            <Input
              value={manifest.id}
              disabled={!draft.isNew}
              placeholder="my-sandbox"
              onChange={(event) => patch({ id: event.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium">
            Name
            <Input
              value={manifest.name}
              onChange={(event) => patch({ name: event.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium">
            Description
            <Input
              value={manifest.description}
              onChange={(event) => patch({ description: event.target.value })}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium">
            Base image
            <Input
              value={manifest.baseImage}
              onChange={(event) => patch({ baseImage: event.target.value })}
            />
          </label>

          <fieldset className="flex flex-col gap-1.5">
            <legend className="text-xs font-medium">Provider CLIs</legend>
            {SANDBOX_CLI_IDS.map((cli) => (
              <label key={cli} className="flex cursor-pointer items-center gap-2 text-sm">
                <Checkbox
                  checked={manifest.clis.includes(cli)}
                  onCheckedChange={(checked) =>
                    patch({
                      clis:
                        checked === true
                          ? [...manifest.clis, cli]
                          : manifest.clis.filter((entry) => entry !== cli),
                    })
                  }
                />
                {CLI_LABELS[cli]}
              </label>
            ))}
          </fieldset>

          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={manifest.gortex}
              onCheckedChange={(checked) => patch({ gortex: checked })}
            />
            Install gortex
          </label>
          {manifest.gortex ? (
            <label className="flex flex-col gap-1 text-xs font-medium">
              gortex excludes (one pattern per line, empty for the built-in list)
              <Textarea
                rows={3}
                value={(manifest.gortexExclude ?? []).join("\n")}
                onChange={(event) => {
                  const patterns = event.target.value
                    .split("\n")
                    .map((line) => line.trim())
                    .filter((line) => line.length > 0);
                  const { gortexExclude: _previous, ...rest } = manifest;
                  onDraftChange({
                    ...draft,
                    manifest: patterns.length === 0 ? rest : { ...rest, gortexExclude: patterns },
                  });
                }}
              />
            </label>
          ) : null}

          <fieldset className="flex flex-col gap-1.5">
            <legend className="text-xs font-medium">weContain tooling</legend>
            {TOOLING_FLAGS.map((flag) => (
              <label key={flag.key} className="flex items-center gap-2 text-sm">
                <Switch
                  checked={manifest[flag.key] === true}
                  onCheckedChange={(checked) => patch({ [flag.key]: checked })}
                />
                <span>{flag.label}</span>
                <span className="text-muted-foreground text-xs">{flag.hint}</span>
              </label>
            ))}
          </fieldset>

          <SandboxToolsField
            tools={manifest.tools ?? []}
            onChange={(tools) => {
              const { tools: _previous, ...rest } = manifest;
              onDraftChange({
                ...draft,
                manifest: tools.length === 0 ? rest : { ...rest, tools },
              });
            }}
          />

          <fieldset className="flex flex-col gap-1.5">
            <legend className="text-xs font-medium">Safeguards</legend>
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={manifest.sudo !== false}
                onCheckedChange={(checked) => patch({ sudo: checked })}
              />
              <span>sudo for the agent</span>
              <span className="text-muted-foreground text-xs">
                Off removes it at build and on every start
              </span>
            </label>
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={manifest.commandLog === true}
                onCheckedChange={(checked) => patch({ commandLog: checked })}
              />
              <span>Command log</span>
              <span className="text-muted-foreground text-xs">
                Every program run, streamed to the host (snoopy; best effort, forgeable from inside)
              </span>
            </label>
          </fieldset>

          <label className="flex flex-col gap-1 text-xs font-medium">
            Environment (KEY=value per line)
            <Textarea
              rows={3}
              value={Object.entries(manifest.env)
                .map(([key, value]) => `${key}=${value}`)
                .join("\n")}
              onChange={(event) => patch({ env: parseEnv(event.target.value) })}
            />
          </label>

          <label className="flex flex-col gap-1 text-xs font-medium">
            Setup commands (one per line)
            <Textarea
              rows={3}
              value={manifest.setupCommands.join("\n")}
              onChange={(event) =>
                patch({
                  setupCommands: event.target.value
                    .split("\n")
                    .map((line) => line.trim())
                    .filter((line) => line.length > 0),
                })
              }
            />
          </label>

          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={draft.dockerfile !== undefined}
              onCheckedChange={(checked) =>
                onDraftChange({
                  ...draft,
                  dockerfile: checked ? "# syntax=docker/dockerfile:1\nFROM scratch\n" : undefined,
                })
              }
            />
            Hand-written Dockerfile
          </label>
          {draft.dockerfile !== undefined ? (
            <Textarea
              rows={10}
              value={draft.dockerfile}
              onChange={(event) => onDraftChange({ ...draft, dockerfile: event.target.value })}
            />
          ) : null}

          {issues.length > 0 ? (
            <ul className="flex flex-col gap-1 text-xs">
              {issues.map((issue) => (
                <li
                  key={`${issue.severity}:${issue.field ?? "bundle"}:${issue.message}`}
                  className={
                    issue.severity === "error" ? "text-destructive" : "text-muted-foreground"
                  }
                >
                  {issue.field === null ? "" : `${issue.field}: `}
                  {issue.message}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </ScrollArea>
      <div className="flex justify-end gap-2 border-t p-3">
        <Button size="sm" variant="ghost-muted" onClick={onClose}>
          Cancel
        </Button>
        <Button
          size="sm"
          disabled={!canSave}
          onClick={() => {
            setSaving(true);
            void save({
              environmentId,
              input: {
                manifest,
                ...(draft.dockerfile === undefined ? {} : { dockerfile: draft.dockerfile }),
              },
            }).then((result) => {
              setSaving(false);
              if (result._tag === "Failure") {
                toastManager.add({
                  type: "error",
                  title: "Failed to save template",
                  description: errorMessage(squashAtomCommandFailure(result)),
                });
                return;
              }
              toastManager.add({ type: "success", title: "Template saved" });
              onClose();
            });
          }}
        >
          {saving ? <Spinner className="size-3.5" /> : null}
          Save
        </Button>
      </div>
    </div>
  );
}

function parseEnv(value: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const line of value.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    const separator = trimmed.indexOf("=");
    if (separator <= 0) continue;
    env[trimmed.slice(0, separator).trim()] = trimmed.slice(separator + 1).trim();
  }
  return env;
}

async function fileToBase64(file: File): Promise<string> {
  const buffer = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (const byte of buffer) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function downloadBase64(fileName: string, contentBase64: string): void {
  const binary = atob(contentBase64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/gzip" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export type { SandboxTemplate };
