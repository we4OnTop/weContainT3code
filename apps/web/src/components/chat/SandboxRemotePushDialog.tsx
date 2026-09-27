import type {
  EnvironmentId,
  SandboxHostRiskPath,
  SandboxInfo,
  SandboxRemoteAuthorMode,
  SandboxRemotePreviewResult,
  SandboxRemoteRelation,
} from "@t3tools/contracts";
import { DownloadIcon, RefreshCwIcon, TriangleAlertIcon, UploadIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { toastManager } from "~/components/ui/toast";
import { sandboxEnvironment } from "~/state/sandbox";
import { useAtomCommand } from "~/state/use-atom-command";
import { squashAtomCommandFailure } from "@t3tools/client-runtime/state/runtime";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import {
  Dialog,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogPanel,
  DialogPopup,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Spinner } from "../ui/spinner";
import { Textarea } from "../ui/textarea";

interface SandboxRemotePushDialogProps {
  readonly environmentId: EnvironmentId;
  readonly sandbox: SandboxInfo;
  /** Mount the dialog only while it is open: it loads its preview on mount. */
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
}

const RELATION_LABEL: Record<SandboxRemoteRelation, string> = {
  "new-branch": "New branch",
  "fast-forward": "Fast-forward",
  "up-to-date": "Already up to date",
  diverged: "Diverged",
};

const RELATION_VARIANT: Record<SandboxRemoteRelation, "default" | "secondary" | "destructive"> = {
  "new-branch": "default",
  "fast-forward": "default",
  "up-to-date": "secondary",
  diverged: "destructive",
};

const EMAIL_PATTERN = /^[^\s<>@]+@[^\s<>@]+$/;

/**
 * Publishes the work mirrored in the docker git receiver to a git remote. The
 * user sees exactly what would be pushed — commits, files, target branch and
 * its state on the remote — and picks who the published commits name as
 * author before anything leaves the machine.
 */
export function SandboxRemotePushDialog({
  environmentId,
  sandbox,
  open,
  onOpenChange,
}: SandboxRemotePushDialogProps) {
  const remotePreview = useAtomCommand(sandboxEnvironment.remotePreview, { reportFailure: false });
  const remotePush = useAtomCommand(sandboxEnvironment.remotePush, { reportFailure: false });
  const syncToHost = useAtomCommand(sandboxEnvironment.syncToHost, { reportFailure: false });

  const [preview, setPreview] = useState<SandboxRemotePreviewResult | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  // Starts busy: the dialog is mounted only while open and loads right away.
  const [busy, setBusy] = useState<"preview" | "sync" | "push" | null>("preview");

  const initialBranch = `sandbox/${sandbox.name}`;
  const [remoteName, setRemoteName] = useState<string | null>(null);
  const [targetBranch, setTargetBranch] = useState(initialBranch);
  const [authorMode, setAuthorMode] = useState<SandboxRemoteAuthorMode>("host");
  const [customName, setCustomName] = useState("");
  const [customEmail, setCustomEmail] = useState("");
  const [coAuthor, setCoAuthor] = useState(true);
  const [squash, setSquash] = useState(false);
  const [squashMessage, setSquashMessage] = useState("");
  const [force, setForce] = useState(false);

  /** Requests a preview; every state update happens once it settles. */
  const runPreview = useCallback(
    (request: { readonly remoteName: string | null; readonly targetBranch: string }) =>
      remotePreview({
        environmentId,
        input: {
          sandboxId: sandbox.sandboxId,
          ...(request.remoteName === null ? {} : { remoteName: request.remoteName }),
          ...(request.targetBranch.trim().length === 0
            ? {}
            : { targetBranch: request.targetBranch.trim() }),
        },
      }).then((result) => {
        setBusy(null);
        if (result._tag === "Failure") {
          setPreview(null);
          setPreviewError(errorMessage(squashAtomCommandFailure(result)));
          return;
        }
        setPreviewError(null);
        setPreview(result.value);
        setRemoteName(result.value.remoteName);
        setTargetBranch(result.value.targetBranch);
        setForce(false);
        // Default to the host identity when there is one; the sandbox's own
        // `sandbox-agent` is rarely who should appear on a shared remote.
        if (result.value.hostIdentity === null) {
          setAuthorMode((mode) => (mode === "host" ? "keep" : mode));
        }
      }),
    [environmentId, remotePreview, sandbox.sandboxId],
  );

  const loadPreview = useCallback(
    (request: { readonly remoteName: string | null; readonly targetBranch: string }) => {
      setBusy("preview");
      void runPreview(request);
    },
    [runPreview],
  );

  useEffect(() => {
    void runPreview({ remoteName: null, targetBranch: initialBranch });
  }, [runPreview, initialBranch]);

  const pullFromSandbox = useCallback(() => {
    setBusy("sync");
    void syncToHost({ environmentId, input: { sandboxId: sandbox.sandboxId } }).then((result) => {
      setBusy(null);
      if (result._tag === "Failure") {
        toastManager.add({
          type: "error",
          title: "Failed to pull from the sandbox",
          description: errorMessage(squashAtomCommandFailure(result)),
        });
        return;
      }
      warnAboutHostRiskPaths(result.value.hostRiskPaths);
      toastManager.add({
        type: "success",
        title: `Pulled ${result.value.commitCount} new commit${result.value.commitCount === 1 ? "" : "s"}`,
        description: result.value.mirroredToReceiver
          ? "The git receiver now holds the sandbox's latest work."
          : "The receiver mirror failed; the preview may be stale.",
      });
      loadPreview({ remoteName, targetBranch });
    });
  }, [environmentId, loadPreview, remoteName, sandbox.sandboxId, syncToHost, targetBranch]);

  const sandboxAuthors = useMemo(() => {
    const seen = new Map<string, string>();
    for (const commit of preview?.commits ?? []) {
      seen.set(commit.authorEmail.toLowerCase(), `${commit.authorName} <${commit.authorEmail}>`);
    }
    return [...seen.values()];
  }, [preview]);

  const customValid =
    customName.trim().length > 0 &&
    !/[<>\n]/.test(customName) &&
    EMAIL_PATTERN.test(customEmail.trim());

  const publishedAs =
    authorMode === "keep"
      ? squash
        ? "the newest sandbox author"
        : sandboxAuthors.join(", ") || "the sandbox authors"
      : authorMode === "host"
        ? preview?.hostIdentity === null || preview === null
          ? "—"
          : `${preview.hostIdentity.name} <${preview.hostIdentity.email}>`
        : `${customName.trim()} <${customEmail.trim()}>`;

  const pushCount = squash ? 1 : (preview?.commits.length ?? 0);
  const nothingToPush =
    preview === null || preview.relation === "up-to-date" || preview.commits.length === 0;
  const canPush =
    busy === null &&
    preview !== null &&
    !nothingToPush &&
    (preview.relation !== "diverged" || force) &&
    (authorMode !== "host" || preview.hostIdentity !== null) &&
    (authorMode !== "custom" || customValid);

  const push = useCallback(() => {
    if (preview === null || remoteName === null) return;
    setBusy("push");
    void remotePush({
      environmentId,
      input: {
        sandboxId: sandbox.sandboxId,
        remoteName,
        targetBranch: preview.targetBranch,
        expectedSourceSha: preview.sourceSha,
        authorMode,
        ...(authorMode === "custom"
          ? { author: { name: customName.trim(), email: customEmail.trim() } }
          : {}),
        squash,
        ...(squash && squashMessage.trim().length > 0 ? { squashMessage } : {}),
        coAuthorTrailer: authorMode !== "keep" && coAuthor,
        force: preview.relation === "diverged" && force,
      },
    }).then((result) => {
      setBusy(null);
      if (result._tag === "Failure") {
        toastManager.add({
          type: "error",
          title: "Push to remote failed",
          description: errorMessage(squashAtomCommandFailure(result)),
        });
        return;
      }
      toastManager.add({
        type: "success",
        title: `Pushed to ${result.value.remoteName}/${result.value.targetBranch}`,
        description: `${result.value.pushedCommitCount} commit${result.value.pushedCommitCount === 1 ? "" : "s"}, tip ${result.value.pushedSha.slice(0, 10)}${result.value.rewritten ? " (re-authored)" : ""}${result.value.forced ? ", replaced the remote branch" : ""}.`,
      });
      onOpenChange(false);
    });
  }, [
    authorMode,
    coAuthor,
    customEmail,
    customName,
    environmentId,
    force,
    onOpenChange,
    preview,
    remoteName,
    remotePush,
    sandbox.sandboxId,
    squash,
    squashMessage,
  ]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Push sandbox work to a remote</DialogTitle>
          <DialogDescription>
            Publishes what the docker git receiver holds for{" "}
            <span className="font-mono">{sandbox.name}</span>. Review the commits and choose the
            author before anything is pushed.
          </DialogDescription>
        </DialogHeader>
        <DialogPanel className="max-h-[70vh] overflow-y-auto">
          <div className="flex flex-col gap-4">
            <section className="flex flex-col gap-2">
              <div className="flex flex-wrap items-end gap-2">
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-medium">Remote</span>
                  <div className="flex flex-wrap gap-1">
                    {(preview?.remotes ?? []).map((remote) => (
                      <Button
                        key={remote.name}
                        size="xs"
                        variant={remote.name === remoteName ? "secondary" : "ghost-muted"}
                        title={remote.url}
                        disabled={busy !== null}
                        onClick={() => {
                          setRemoteName(remote.name);
                          loadPreview({ remoteName: remote.name, targetBranch });
                        }}
                      >
                        {remote.name}
                      </Button>
                    ))}
                    {preview === null ? (
                      <span className="text-muted-foreground text-xs">—</span>
                    ) : null}
                  </div>
                </div>
                <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs font-medium">
                  Branch
                  <Input
                    value={targetBranch}
                    disabled={busy !== null}
                    onChange={(event) => setTargetBranch(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") loadPreview({ remoteName, targetBranch });
                    }}
                  />
                </label>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy !== null}
                  onClick={() => loadPreview({ remoteName, targetBranch })}
                >
                  {busy === "preview" ? <Spinner className="size-3.5" /> : <RefreshCwIcon />}
                  Refresh
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy !== null || sandbox.status !== "running"}
                  title="Sync the sandbox to the host and mirror it into the git receiver"
                  onClick={pullFromSandbox}
                >
                  {busy === "sync" ? <Spinner className="size-3.5" /> : <DownloadIcon />}
                  Pull latest from sandbox
                </Button>
              </div>
              {previewError !== null ? (
                <p className="text-destructive text-sm">{previewError}</p>
              ) : null}
            </section>

            {preview === null ? (
              busy === "preview" ? (
                <div className="text-muted-foreground flex items-center gap-2 text-sm">
                  <Spinner className="size-3.5" /> Reading the git receiver and the remote…
                </div>
              ) : null
            ) : (
              <>
                <section className="flex flex-col gap-1.5">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <Badge size="sm" variant={RELATION_VARIANT[preview.relation]}>
                      {RELATION_LABEL[preview.relation]}
                    </Badge>
                    <span className="font-mono text-xs">
                      receiver {preview.sourceSha.slice(0, 10)}
                    </span>
                    <span className="text-muted-foreground text-xs">→</span>
                    <span className="font-mono text-xs">
                      {preview.remoteName}/{preview.targetBranch}
                      {preview.remoteSha === null
                        ? " (new)"
                        : ` @ ${preview.remoteSha.slice(0, 10)}`}
                    </span>
                  </div>
                  {preview.relation === "diverged" ? (
                    <label className="flex items-start gap-2 text-sm">
                      <Checkbox
                        checked={force}
                        onCheckedChange={(checked) => setForce(checked === true)}
                      />
                      <span>
                        The remote branch has commits the sandbox work does not contain. Replace it
                        (force-with-lease on {preview.remoteSha?.slice(0, 10)}); those commits will
                        no longer be on the branch.
                      </span>
                    </label>
                  ) : null}
                </section>

                {preview.files.some((file) => file.hostRisk !== null) ? (
                  <section className="flex flex-col gap-1 rounded-md border border-warning/40 bg-warning/8 p-2 text-xs">
                    <p className="flex items-center gap-1.5 font-medium">
                      <TriangleAlertIcon className="size-3.5 text-warning" aria-hidden="true" />
                      Review these before this work reaches a checkout
                    </p>
                    <p className="text-muted-foreground">
                      Tools on your machine act on these files by themselves. Code written in the
                      sandbox can run on the host through them once the branch is checked out.
                    </p>
                    <ul className="flex flex-col gap-0.5">
                      {preview.files
                        .filter((file) => file.hostRisk !== null)
                        .map((file) => (
                          <li key={file.path} className="flex gap-2">
                            <span className="shrink-0 font-mono">{file.path}</span>
                            <span className="text-muted-foreground truncate">{file.hostRisk}</span>
                          </li>
                        ))}
                    </ul>
                  </section>
                ) : null}

                <section className="flex flex-col gap-1">
                  <h3 className="text-xs font-medium">
                    Commits ({preview.commits.length}
                    {preview.commitsTruncated ? "+, newest shown" : ""})
                  </h3>
                  {preview.commits.length === 0 ? (
                    <p className="text-muted-foreground text-sm">
                      Nothing new: the remote branch already has this work.
                    </p>
                  ) : (
                    <ol className="max-h-44 overflow-y-auto rounded-md border text-xs">
                      {preview.commits.map((commit) => (
                        <li
                          key={commit.sha}
                          className="flex items-baseline gap-2 border-b px-2 py-1 last:border-b-0"
                        >
                          <span className="text-muted-foreground font-mono">
                            {commit.sha.slice(0, 8)}
                          </span>
                          <span className="min-w-0 flex-1 truncate">{commit.subject}</span>
                          <span className="text-muted-foreground shrink-0">
                            {commit.authorName}
                          </span>
                          <span className="text-muted-foreground shrink-0">
                            {formatDate(commit.authoredAt)}
                          </span>
                        </li>
                      ))}
                    </ol>
                  )}
                </section>

                {preview.files.length > 0 ? (
                  <section className="flex flex-col gap-1">
                    <h3 className="text-xs font-medium">
                      Files ({preview.files.length}){" "}
                      <span className="text-success">+{preview.additions}</span>{" "}
                      <span className="text-destructive">−{preview.deletions}</span>
                    </h3>
                    <ul className="max-h-40 overflow-y-auto rounded-md border text-xs">
                      {preview.files.map((file) => (
                        <li
                          key={file.path}
                          className="flex items-baseline gap-2 border-b px-2 py-1 last:border-b-0"
                        >
                          <span className="text-muted-foreground w-3 font-mono">{file.status}</span>
                          <span className="min-w-0 flex-1 truncate font-mono">
                            {file.hostRisk !== null ? (
                              <TriangleAlertIcon
                                className="mr-1 inline size-3 text-warning"
                                aria-label="Acted on by host tools"
                              />
                            ) : null}
                            {file.path}
                          </span>
                          {file.additions === null ? (
                            <span className="text-muted-foreground">binary</span>
                          ) : (
                            <span className="shrink-0 font-mono">
                              <span className="text-success">+{file.additions}</span>{" "}
                              <span className="text-destructive">−{file.deletions}</span>
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}

                <section className="flex flex-col gap-2">
                  <h3 className="text-xs font-medium">Author of the pushed commits</h3>
                  <div className="flex flex-wrap gap-1">
                    <Button
                      size="xs"
                      variant={authorMode === "host" ? "secondary" : "ghost-muted"}
                      disabled={preview.hostIdentity === null}
                      onClick={() => setAuthorMode("host")}
                    >
                      My git identity
                    </Button>
                    <Button
                      size="xs"
                      variant={authorMode === "custom" ? "secondary" : "ghost-muted"}
                      onClick={() => setAuthorMode("custom")}
                    >
                      Custom
                    </Button>
                    <Button
                      size="xs"
                      variant={authorMode === "keep" ? "secondary" : "ghost-muted"}
                      onClick={() => setAuthorMode("keep")}
                    >
                      Keep sandbox authors
                    </Button>
                  </div>
                  {authorMode === "host" ? (
                    <p className="text-muted-foreground text-xs">
                      {preview.hostIdentity === null
                        ? "The host project has no git user.name / user.email configured."
                        : `${preview.hostIdentity.name} <${preview.hostIdentity.email}> — from the host checkout's git config.`}
                    </p>
                  ) : null}
                  {authorMode === "custom" ? (
                    <div className="flex flex-wrap gap-2">
                      <Input
                        className="min-w-40 flex-1"
                        placeholder="Name"
                        value={customName}
                        onChange={(event) => setCustomName(event.target.value)}
                      />
                      <Input
                        className="min-w-56 flex-1"
                        placeholder="email@example.com"
                        value={customEmail}
                        aria-invalid={
                          customEmail.length > 0 && !EMAIL_PATTERN.test(customEmail.trim())
                        }
                        onChange={(event) => setCustomEmail(event.target.value)}
                      />
                    </div>
                  ) : null}
                  {authorMode === "keep" ? (
                    <p className="text-muted-foreground text-xs">
                      Commits are pushed unchanged: {sandboxAuthors.join(", ") || "—"}.
                    </p>
                  ) : (
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={coAuthor}
                        onCheckedChange={(checked) => setCoAuthor(checked === true)}
                      />
                      Credit the sandbox author with a Co-authored-by trailer
                    </label>
                  )}
                </section>

                <section className="flex flex-col gap-2">
                  <h3 className="text-xs font-medium">Commits on the remote</h3>
                  <div className="flex flex-wrap gap-1">
                    <Button
                      size="xs"
                      variant={!squash ? "secondary" : "ghost-muted"}
                      onClick={() => setSquash(false)}
                    >
                      Keep individual commits ({preview.commits.length})
                    </Button>
                    <Button
                      size="xs"
                      variant={squash ? "secondary" : "ghost-muted"}
                      onClick={() => setSquash(true)}
                    >
                      Squash into one commit
                    </Button>
                  </div>
                  {squash ? (
                    <Textarea
                      rows={4}
                      placeholder={`Leave empty for "Sandbox work from ${sandbox.name}" plus the commit subjects`}
                      value={squashMessage}
                      onChange={(event) => setSquashMessage(event.target.value)}
                    />
                  ) : null}
                </section>
              </>
            )}
          </div>
        </DialogPanel>
        <DialogFooter className="flex-col items-stretch sm:flex-row sm:items-center">
          <p className="text-muted-foreground min-w-0 flex-1 text-xs">
            {preview === null || nothingToPush
              ? "Nothing to push."
              : `Pushes ${pushCount} commit${pushCount === 1 ? "" : "s"} to ${preview.remoteName}/${preview.targetBranch} as ${publishedAs}.`}
          </p>
          <Button variant="ghost-muted" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!canPush} onClick={push}>
            {busy === "push" ? <Spinner className="size-3.5" /> : <UploadIcon />}
            Push to remote
          </Button>
        </DialogFooter>
      </DialogPopup>
    </Dialog>
  );
}

/**
 * Sandbox work that touches files host tools act on by themselves (agent
 * hooks, editor tasks, npm scripts, ...) gets a warning the user cannot miss.
 */
export function warnAboutHostRiskPaths(
  paths: ReadonlyArray<SandboxHostRiskPath> | undefined,
): void {
  if (paths === undefined || paths.length === 0) return;
  const shown = paths.slice(0, 4).map((entry) => entry.path);
  toastManager.add({
    type: "warning",
    title: `Sandbox work changes ${paths.length} file${paths.length === 1 ? "" : "s"} that run on your machine`,
    description: `${shown.join(", ")}${paths.length > shown.length ? ", …" : ""}. Review them before checking out the sandbox branch.`,
  });
}

function formatDate(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleString(undefined, { dateStyle: "short", timeStyle: "short" });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
