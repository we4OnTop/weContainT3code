import * as Clock from "effect/Clock";
import * as Context from "effect/Context";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Fiber from "effect/Fiber";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import * as NodeCrypto from "node:crypto";
import * as NodeNet from "node:net";
import * as Stream from "effect/Stream";
import * as ChildProcess from "effect/unstable/process/ChildProcess";
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner";
import { FetchHttpClient, HttpClient } from "effect/unstable/http";

import packageJson from "../../package.json" with { type: "json" };
import * as ProcessRunner from "../processRunner.ts";
import { normalizeGitRemoteUrl } from "@t3tools/shared/git";
import { parseRemoteFetchUrls, pickPrimaryRemote } from "../project/RepositoryIdentityResolver.ts";
import * as ServerConfigModule from "../config.ts";
import {
  type SandboxActivityInput,
  type SandboxChannelStatus,
  type SandboxCreateOptions,
  type SandboxCreateProgress,
  type SandboxCreateStep,
  type SandboxError,
  type SandboxGitIdentity,
  type SandboxPolicyAddRuleInput,
  type SandboxPolicyRemoveRuleInput,
  type SandboxRemotePreviewInput,
  type SandboxRemotePushInput,
  DEFAULT_SANDBOX_TEMPLATE_ID,
  ExecutionEnvironmentDescriptor,
  SandboxCommandError,
  SandboxActivityEvent,
  SandboxActivityResult,
  SandboxInfo,
  SandboxNetworkOverviewResult,
  SandboxNotFoundError,
  SandboxRemotePreviewResult,
  SandboxRemotePushResult,
  SandboxSyncToHostResult,
  SandboxSyncToRemoteResult,
  SandboxUnavailableError,
  sandboxNetworkResourceRisk,
} from "@t3tools/contracts";

import * as SandboxTemplatesModule from "./SandboxTemplates.ts";
import {
  GUEST_GORTEX_READY_FILE,
  GUEST_HOME,
  GUEST_HOST_CONFIG_FILE,
  GUEST_WORKSPACE_DIR,
  SANDBOX_WORKSPACE_ENV,
  SANDBOX_RECEIVER_CONTAINER,
  SANDBOX_RECEIVER_IMAGE,
  guestWorkspaceDir,
  sandboxImageTag,
  templateFeatures,
} from "./image.ts";
import { commandFlags, parseChannelLine } from "./activity.ts";
import { GUEST_CHANNEL_PATH, GUEST_SYNC_RESULT_DIR } from "./guestChannel.ts";
import {
  NETWORK_LOG_LIMIT,
  missingScopedResources,
  parseNetworkLog,
  parsePolicyRules,
} from "./networkPolicy.ts";
import {
  SANDBOX_CONFIG_FILE,
  parseProjectSandboxConfig,
  resolveCreateOptions,
} from "./sandboxConfig.ts";
import {
  COMMIT_LOG_FORMAT,
  composeSquashMessage,
  defaultTargetBranch,
  distinctAuthors,
  hostExecutionRisk,
  parseCommitLog,
  parseDiffSummary,
  pickDefaultRemote,
  remoteRelation,
  rewrittenParents,
  withCoAuthorTrailers,
} from "./remoteTransfer.ts";

const GUEST_T3_PORT = 3773;
const GUEST_SBX_GIT_PORT = 9418;
/**
 * Project folder names the guest git daemon can serve. The name is passed to
 * the guest as an argument; this only keeps out what a git:// path or the
 * daemon's export check would reject (and "." / "..").
 */
export const PROJECT_FOLDER_PATTERN = /^(?!\.{1,2}$)[A-Za-z0-9._][A-Za-z0-9._ -]{0,254}$/;
const HOST_PORT_RANGE_START = 3774;
const HOST_PORT_RANGE_END = 3799;
const SANDBOXES_STATE_FILE = "sandboxes.json";
const GORTEX_CACHE_TARBALL = "cache.tar.gz";
const GORTEX_CACHE_MANIFEST = "manifest.json";
/** Commits listed by a remote preview; the push itself is never truncated. */
const PREVIEW_COMMIT_LIMIT = 200;
/** 30-second polls for a first gortex index before the warm-cache save gives up (90 min). */
const GORTEX_INDEX_WAIT_ATTEMPTS = 180;
/** git's well-known empty tree, the diff base for work with no history before it. */
const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
const KEEPALIVE_RETRY_DELAY = "10 seconds";
/** Upper bound for a saved gortex index copied out of a sandbox. */
const GORTEX_CACHE_MAX_BYTES = 4 * 1024 * 1024 * 1024;
/** A `.sandbox-config` is a few hundred bytes; anything this big is not one. */
const PROJECT_CONFIG_MAX_BYTES = 64 * 1024;
/** Activity events kept in memory per sandbox; the JSONL file keeps the rest. */
const ACTIVITY_MEMORY_LIMIT = 5000;
/** An activity file past this size is rotated to `.1` (one generation kept). */
const ACTIVITY_FILE_MAX_BYTES = 20 * 1024 * 1024;
const ACTIVITY_FLUSH_INTERVAL = "2 seconds";
/** Minimum gap between two syncs the agent asks for with `t3-sync`. */
const AGENT_SYNC_MIN_INTERVAL_MS = 15_000;

const ActivityLineJson = Schema.fromJsonString(SandboxActivityEvent);
const decodeActivityLine = Schema.decodeUnknownOption(ActivityLineJson);
const encodeActivityLine = Schema.encodeEffect(ActivityLineJson);

const decodeJsonObject = Schema.decodeUnknownOption(
  Schema.fromJsonString(Schema.Record(Schema.String, Schema.Unknown)),
);
const isJsonObject = (raw: string) => decodeJsonObject(raw)._tag === "Some";

/**
 * The `ext::` git transports pipe git over `docker exec` / `sbx exec` stdio.
 * These env guards keep MSYS bash from rewriting the embedded paths when the
 * server itself runs under Git-for-Windows.
 */
const EXT_TRANSPORT_ENV: NodeJS.ProcessEnv = {
  MSYS_NO_PATHCONV: "1",
  MSYS2_ARG_CONV_EXCL: "*",
};

export class SandboxManager extends Context.Service<
  SandboxManager,
  {
    readonly list: Effect.Effect<ReadonlyArray<SandboxInfo>, SandboxUnavailableError>;
    readonly create: (input: SandboxCreateRequest) => Effect.Effect<SandboxInfo, SandboxError>;
    /**
     * Same work as `create`, reporting each initialization step as it happens.
     * `create` is this with the progress callback thrown away.
     */
    readonly createWithProgress: (
      input: SandboxCreateRequest,
      onProgress: (progress: SandboxCreateProgress) => Effect.Effect<void>,
    ) => Effect.Effect<SandboxInfo, SandboxError>;
    readonly attach: (input: {
      readonly sandboxId: string;
      readonly threadId: SandboxInfo["createdByThreadId"];
    }) => Effect.Effect<SandboxInfo, SandboxError>;
    readonly detach: (input: {
      readonly sandboxId: string;
      readonly threadId: SandboxInfo["createdByThreadId"];
    }) => Effect.Effect<SandboxInfo, SandboxError>;
    readonly stop: (input: {
      readonly sandboxId: string;
    }) => Effect.Effect<SandboxInfo, SandboxError>;
    readonly remove: (input: {
      readonly sandboxId: string;
    }) => Effect.Effect<{ readonly sandboxId: string }, SandboxError>;
    readonly syncToHost: (input: {
      readonly sandboxId: string;
      readonly commitMessage?: string | undefined;
    }) => Effect.Effect<SandboxSyncToHostResult, SandboxError>;
    readonly syncToRemote: (input: {
      readonly sandboxId: string;
      readonly remoteName?: string | undefined;
    }) => Effect.Effect<SandboxSyncToRemoteResult, SandboxError>;
    /** What a push of the receiver's work to a remote would publish. */
    readonly remotePreview: (
      input: SandboxRemotePreviewInput,
    ) => Effect.Effect<SandboxRemotePreviewResult, SandboxError>;
    /** Publishes the previewed receiver work, optionally re-authored or squashed. */
    readonly remotePush: (
      input: SandboxRemotePushInput,
    ) => Effect.Effect<SandboxRemotePushResult, SandboxError>;
    /** The sbx network rules and what the proxy allowed or blocked, for all sandboxes. */
    readonly networkOverview: Effect.Effect<SandboxNetworkOverviewResult, SandboxError>;
    readonly policyAddRule: (
      input: SandboxPolicyAddRuleInput,
    ) => Effect.Effect<SandboxNetworkOverviewResult, SandboxError>;
    readonly policyRemoveRule: (
      input: SandboxPolicyRemoveRuleInput,
    ) => Effect.Effect<SandboxNetworkOverviewResult, SandboxError>;
    /** Syncs, pushes, channel state and the command log, newest first. */
    readonly activity: (
      input: SandboxActivityInput,
    ) => Effect.Effect<SandboxActivityResult, SandboxError>;
    // Template CRUD, re-exported from the store the manager already depends
    // on. Serving it from here keeps SandboxTemplates out of every caller's
    // context, and keeps each member independently stubbable in tests.
    readonly templateList: SandboxTemplatesModule.SandboxTemplates["Service"]["list"];
    readonly templateSave: SandboxTemplatesModule.SandboxTemplates["Service"]["save"];
    readonly templateRemove: SandboxTemplatesModule.SandboxTemplates["Service"]["remove"];
    readonly templateSetDefault: SandboxTemplatesModule.SandboxTemplates["Service"]["setDefault"];
    readonly templateExport: SandboxTemplatesModule.SandboxTemplates["Service"]["exportBundle"];
    readonly templateImport: SandboxTemplatesModule.SandboxTemplates["Service"]["importBundle"];
    readonly templateValidate: SandboxTemplatesModule.SandboxTemplates["Service"]["validate"];
  }
>()("t3/sandbox/SandboxManager") {}

export interface SandboxCreateRequest {
  readonly projectId: SandboxInfo["projectId"];
  readonly threadId: SandboxInfo["createdByThreadId"];
  readonly projectCwd: string;
  readonly templateId?: string | undefined;
  /** Attach to this existing sandbox instead of building a new one. */
  readonly attachSandboxId?: string | undefined;
  readonly options?: SandboxCreateOptions | undefined;
}

type SandboxRecord = SandboxInfo;

const SandboxRecordsJson = Schema.fromJsonString(Schema.Array(SandboxInfo));
const decodeRecords = Schema.decodeUnknownEffect(SandboxRecordsJson);
const encodeRecords = Schema.encodeEffect(SandboxRecordsJson);

const toSandboxInfo = (record: SandboxRecord): SandboxInfo => record;

/** `manifest.json` next to a saved gortex cache. */
export const GortexCacheManifest = Schema.Struct({
  commit: Schema.String,
  sha256: Schema.String.check(Schema.isPattern(/^[0-9a-f]{64}$/)),
  savedAt: Schema.String,
});
const GortexCacheManifestJson = Schema.fromJsonString(GortexCacheManifest);
export const decodeCacheManifest = Schema.decodeUnknownEffect(GortexCacheManifestJson);
const encodeCacheManifest = Schema.encodeEffect(GortexCacheManifestJson);

/**
 * A sandbox that exists on the host but has not finished initializing. Held
 * while a create runs so a failure can be attributed to something concrete.
 */
export interface StartedSandbox {
  readonly sandboxId: string;
  readonly name: string;
  readonly templateId: SandboxRecord["templateId"];
  readonly image: string;
  readonly hostPort: number | null;
  readonly existing: SandboxRecord | undefined;
  /** Guest clone dir, carried so failure/retry identities stay consistent. */
  readonly workspaceDir: string | null;
  /** Effective create options, so a retry replays the same limits and policy. */
  readonly options?: SandboxCreateOptions | undefined;
}

/** Legacy records predate per-project guest dirs; they resolve to the fixed one. */
const recordWorkspaceDir = (record: { readonly workspaceDir: string | null }) =>
  record.workspaceDir ?? GUEST_WORKSPACE_DIR;

const nowIso = Effect.map(DateTime.now, DateTime.formatIso);

/**
 * Record for a create that failed after the sandbox was named. Identity is
 * carried over verbatim so the retry resumes this sandbox: same id, same
 * container name, same published port. Provenance (`createdByThreadId`,
 * `createdAt`) survives from the earlier attempt when there was one.
 */
export const buildFailureRecord = (options: {
  readonly input: SandboxCreateRequest;
  readonly started: StartedSandbox;
  readonly message: string;
  readonly now: string;
}): SandboxRecord => {
  const { input, started, message, now } = options;
  const previous = started.existing;
  return {
    sandboxId: started.sandboxId,
    name: started.name,
    projectId: input.projectId,
    createdByThreadId: previous?.createdByThreadId ?? input.threadId,
    threadIds:
      previous !== undefined && previous.threadIds.includes(input.threadId)
        ? previous.threadIds
        : [...(previous?.threadIds ?? []), input.threadId],
    projectCwd: input.projectCwd,
    templateId: started.templateId,
    status: "error",
    image: started.image,
    hostPort: started.hostPort,
    pairingUrl: null,
    workspaceDir: started.workspaceDir,
    branch: previous?.branch ?? null,
    message,
    ...(started.options === undefined ? {} : { options: started.options }),
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
  };
};

const commandError = (operation: SandboxCommandError["operation"], detail: string) =>
  new SandboxCommandError({ operation, detail });

export const make = Effect.fn("SandboxManager.make")(function* () {
  const processRunner = yield* ProcessRunner.ProcessRunner;
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const config = yield* ServerConfigModule.ServerConfig;
  const httpClient = yield* HttpClient.HttpClient;
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;

  const templates = yield* SandboxTemplatesModule.SandboxTemplates;

  const serverVersion = packageJson.version;
  const buildCacheRoot = path.join(config.providerStatusCacheDir, "sandbox-image");
  const gitReposDir = path.join(config.baseDir, "sandboxes", "git-repos");
  const gortexCacheRoot = path.join(config.baseDir, "sandboxes", "gortex-cache");
  const sandboxesStatePath = path.join(config.stateDir, SANDBOXES_STATE_FILE);

  const recordsRef = yield* Ref.make<ReadonlyArray<SandboxRecord> | null>(null);

  // ---- persistence ----------------------------------------------------------

  const readRecords = Effect.fn("sandbox.readRecords")(function* () {
    const cached = yield* Ref.get(recordsRef);
    if (cached !== null) {
      return cached;
    }
    const raw = yield* fs.readFileString(sandboxesStatePath).pipe(Effect.orElseSucceed(() => ""));
    const records = yield* parseRecords(raw, sandboxesStatePath);
    yield* Ref.set(recordsRef, records);
    return records;
  });

  const writeRecords = Effect.fn("sandbox.writeRecords")(function* (
    records: ReadonlyArray<SandboxRecord>,
  ) {
    yield* Ref.set(recordsRef, records);
    yield* encodeRecords(records).pipe(
      Effect.flatMap((json) => fs.writeFileString(sandboxesStatePath, json)),
      Effect.catchCause((cause) =>
        Effect.logWarning("Failed to persist sandbox state", { sandboxesStatePath, cause }),
      ),
    );
  });

  const updateRecord = Effect.fn("sandbox.updateRecord")(function* (
    sandboxId: string,
    update: (record: SandboxRecord) => SandboxRecord,
  ) {
    const records = yield* readRecords();
    const index = records.findIndex((record) => record.sandboxId === sandboxId);
    const current = index === -1 ? undefined : records[index];
    if (current === undefined) {
      return yield* new SandboxNotFoundError({ sandboxId });
    }
    const updated = update({ ...current, updatedAt: yield* nowIso });
    yield* writeRecords([...records.slice(0, index), updated, ...records.slice(index + 1)]);
    return updated;
  });

  const dropRecord = Effect.fn("sandbox.dropRecord")(function* (sandboxId: string) {
    const records = yield* readRecords();
    yield* writeRecords(records.filter((record) => record.sandboxId !== sandboxId));
  });

  // ---- process helpers --------------------------------------------------------

  /** Runs a command and turns a non-zero exit into a SandboxCommandError. */
  const runChecked = Effect.fn("sandbox.runChecked")(function* (
    operation: SandboxCommandError["operation"],
    input: ProcessRunner.ProcessRunInput,
  ) {
    const result = yield* processRunner
      .run(input)
      .pipe(
        Effect.mapError((cause) =>
          commandError(operation, cause.message ?? "process invocation failed"),
        ),
      );
    if (result.code !== 0) {
      const output = [result.stderr, result.stdout]
        .map((value) => value.trim())
        .filter((value) => value.length > 0)
        .join("\n");
      return yield* commandError(
        operation,
        output.length > 0 ? output : `exit code ${result.code}`,
      );
    }
    return result.stdout;
  });

  const runUnchecked = Effect.fn("sandbox.runUnchecked")(function* (
    input: ProcessRunner.ProcessRunInput,
  ) {
    return yield* processRunner.run(input).pipe(Effect.orElseSucceed(() => null));
  });

  const requireBinary = Effect.fn("sandbox.requireBinary")(function* (
    command: string,
    args: ReadonlyArray<string>,
    reason: string,
  ) {
    const result = yield* runUnchecked({ command, args, timeout: "30 seconds" });
    if (result === null || result.code !== 0) {
      return yield* new SandboxUnavailableError({ reason });
    }
  });

  const availability = Effect.fn("sandbox.availability")(function* () {
    yield* requireBinary(
      "sbx",
      ["version"],
      "the Docker Sandboxes CLI ('sbx') was not found on PATH",
    );
    yield* requireBinary(
      "docker",
      ["version", "--format", "{{.Server.Version}}"],
      "docker was not found or its daemon is not running",
    );
  });

  const dockerExec = (args: ReadonlyArray<string>) =>
    runChecked("receiver", {
      command: "docker",
      args,
      env: EXT_TRANSPORT_ENV,
      timeout: "2 minutes",
    });

  const sbxExec = Effect.fn("sandbox.sbxExec")(function* (
    name: string,
    args: ReadonlyArray<string>,
    operation: SandboxCommandError["operation"],
    timeout: ProcessRunner.ProcessRunInput["timeout"],
  ) {
    return yield* runChecked(operation, {
      command: "sbx",
      args: ["exec", name, "--", ...args],
      timeout,
    });
  });

  const gitRun = (
    operation: SandboxCommandError["operation"],
    cwd: string,
    args: ReadonlyArray<string>,
  ) =>
    runChecked(operation, {
      command: "git",
      args,
      cwd,
      env: EXT_TRANSPORT_ENV,
      timeout: "10 minutes",
    });

  // ---- image & receiver lifecycle ----------------------------------------------

  /**
   * Resolves the template a create should build from: the explicit choice, else
   * the configured default, else the built-in plain template. A default that
   * was deleted must not make every create fail.
   */
  const resolveTemplate = Effect.fn("sandbox.resolveTemplate")(function* (
    templateId: string | undefined,
  ) {
    if (templateId !== undefined) {
      return yield* templates.get(templateId);
    }
    const listed = yield* templates.list;
    return yield* templates
      .get(listed.defaultTemplateId)
      .pipe(Effect.catch(() => templates.get(DEFAULT_SANDBOX_TEMPLATE_ID)));
  });

  /** Returns true when the image had to be built, false when it was cached. */
  const ensureImage = Effect.fn("sandbox.ensureImage")(function* (
    template: SandboxTemplatesModule.ResolvedSandboxTemplate,
    imageTag: string,
  ) {
    const imageWasBuilt = yield* buildImageIfMissing(template, imageTag);
    const imageWasLoaded = yield* loadImageIntoSbxRuntime(imageTag);
    return imageWasBuilt || imageWasLoaded;
  });

  /**
   * `sbx create` resolves its `-t` image from the sandbox runtime's own image
   * store, not from the docker engine's local store, and a failed registry
   * pull is fatal — even when the image is already in `docker images`. After
   * building (or whenever the store is missing an entry), `docker save` the
   * image and load it into that store so creates never attempt a pull.
   */
  const loadImageIntoSbxRuntime = Effect.fn("sandbox.loadImageIntoSbxRuntime")(function* (
    imageReference: string,
  ) {
    // `ensureImage` receives a full image reference (`t3-sandbox:plain-v…`).
    // The sandbox runtime's listing reports repository and tag separately, so
    // the two must be split apart before matching.
    const tagSeparator = imageReference.lastIndexOf(":");
    const repo = tagSeparator === -1 ? imageReference : imageReference.slice(0, tagSeparator);
    const tag = tagSeparator === -1 ? "latest" : imageReference.slice(tagSeparator + 1);
    const listing = yield* runUnchecked({
      command: "sbx",
      args: ["template", "ls"],
      timeout: "30 seconds",
    });
    const rows = sbxTemplateRows(listing?.stdout ?? "");
    if (sbxTemplateHasTag(rows, repo, tag)) {
      return false;
    }
    const savePath = path.join(buildCacheRoot, "image-store", `${tag}.tar`);
    yield* fs.makeDirectory(path.dirname(savePath), { recursive: true }).pipe(Effect.ignore);
    yield* runChecked("image", {
      command: "docker",
      args: ["save", "-o", savePath, imageReference],
      timeout: "15 minutes",
    });
    yield* runChecked("image", {
      command: "sbx",
      args: ["template", "load", savePath],
      timeout: "15 minutes",
    });
    yield* fs.remove(savePath, { force: true }).pipe(Effect.ignore);
    return true;
  });

  const buildImageIfMissing = Effect.fn("sandbox.buildImageIfMissing")(function* (
    template: SandboxTemplatesModule.ResolvedSandboxTemplate,
    imageTag: string,
  ) {
    const inspect = yield* runUnchecked({
      command: "docker",
      args: ["image", "inspect", imageTag, "--format", "{{.Id}}"],
      timeout: "30 seconds",
    });
    if (inspect !== null && inspect.code === 0 && inspect.stdout.trim().length > 0) {
      return false;
    }
    const buildDir = path.join(buildCacheRoot, template.template.manifest.id);
    yield* fs.remove(buildDir, { recursive: true, force: true }).pipe(Effect.ignore);
    yield* templates.materialize({ template, buildDir });
    yield* Effect.logInfo("Building sandbox image", {
      imageTag,
      serverVersion,
      templateId: template.template.manifest.id,
    });
    yield* runChecked("image", {
      command: "docker",
      args: ["build", "--build-arg", `T3_VERSION=${serverVersion}`, "-t", imageTag, buildDir],
      timeout: "30 minutes",
    });
    return true;
  });

  const ensureReceiver = Effect.fn("sandbox.ensureReceiver")(function* () {
    yield* fs.makeDirectory(gitReposDir, { recursive: true }).pipe(Effect.orDie);
    const state = yield* dockerExec([
      "container",
      "inspect",
      SANDBOX_RECEIVER_CONTAINER,
      "--format",
      "{{.State.Running}} {{.HostConfig.NetworkMode}} {{.Config.Image}}",
    ]).pipe(Effect.orElseSucceed(() => null));
    // Reused only while it still has exactly the locked-down shape below; an
    // older receiver (published git daemon) is replaced. The repos live on the
    // host volume and survive the swap.
    if (state !== null && state.trim() === `true none ${SANDBOX_RECEIVER_IMAGE}`) {
      return;
    }
    yield* runUnchecked({
      command: "docker",
      args: ["rm", "-f", SANDBOX_RECEIVER_CONTAINER],
      timeout: "30 seconds",
    });
    yield* runChecked("receiver", {
      command: "docker",
      args: [
        "run",
        "-d",
        "--name",
        SANDBOX_RECEIVER_CONTAINER,
        "--restart",
        "unless-stopped",
        // Reached only through `docker exec` stdio: nothing to listen on.
        "--network",
        "none",
        "--read-only",
        "--tmpfs",
        "/tmp",
        "--cap-drop",
        "ALL",
        "--security-opt",
        "no-new-privileges",
        "--pids-limit",
        "256",
        "-v",
        `${gitReposDir}:/srv/git`,
        "--entrypoint",
        "tail",
        SANDBOX_RECEIVER_IMAGE,
        "-f",
        "/dev/null",
      ],
      timeout: "5 minutes",
    });
  });

  const ensureReceiverRepo = Effect.fn("sandbox.ensureReceiverRepo")(function* (name: string) {
    yield* dockerExec([
      "exec",
      SANDBOX_RECEIVER_CONTAINER,
      "git",
      "init",
      "--bare",
      `/srv/git/${name}.git`,
    ]).pipe(
      Effect.catchCause((cause) =>
        Effect.logWarning("Receiver repo init failed (may already exist)", { name, cause }),
      ),
    );
  });

  // ---- sandbox lifecycle ---------------------------------------------------------

  /** `sbx ls` is line/table oriented; the sandbox name is always the first column. */
  const parseSbxNames = Effect.fn("sandbox.parseSbxNames")(function* () {
    const output = yield* runChecked("create", {
      command: "sbx",
      args: ["ls"],
      timeout: "30 seconds",
    }).pipe(Effect.orElseSucceed(() => ""));
    return new Set(
      output
        .split("\n")
        .map((line) => line.trim().split(/\s+/)[0] ?? "")
        .filter((name) => name.length > 0 && name !== "NAME"),
    );
  });

  const probePortFree = (port: number) =>
    Effect.promise(
      () =>
        new Promise<boolean>((resolve) => {
          const server = NodeNet.createServer();
          server.once("error", () => resolve(false));
          server.once("listening", () => {
            server.close(() => resolve(true));
          });
          server.listen(port, "127.0.0.1");
        }),
    );

  const allocateHostPort = Effect.fn("sandbox.allocateHostPort")(function* () {
    const records = yield* readRecords();
    const takenPorts = new Set(
      records.flatMap((record) => (record.hostPort === null ? [] : [record.hostPort])),
    );
    for (let port = HOST_PORT_RANGE_START; port <= HOST_PORT_RANGE_END; port++) {
      if (takenPorts.has(port)) {
        continue;
      }
      if (yield* probePortFree(port)) {
        return port;
      }
    }
    return yield* commandError("create", "no free host port in the sandbox port range");
  });

  /** Readiness is "the guest t3 server answers its environment probe". */
  const guestEnvironmentProbe = (hostPort: number) =>
    httpClient.get(`http://127.0.0.1:${hostPort}/.well-known/t3/environment`).pipe(
      Effect.timeout("2 seconds"),
      Effect.as(true),
      Effect.orElseSucceed(() => false),
    );

  const waitForGuestReady = Effect.fn("sandbox.waitForGuestReady")(function* (hostPort: number) {
    for (let attempt = 0; attempt < 60; attempt++) {
      if (yield* guestEnvironmentProbe(hostPort)) {
        return;
      }
      yield* Effect.sleep("1 second");
    }
    return yield* commandError(
      "create",
      "the sandbox t3 server did not become ready within 60 seconds",
    );
  });

  const readGuestEnvironmentId = (hostPort: number) =>
    httpClient.get(`http://127.0.0.1:${hostPort}/.well-known/t3/environment`).pipe(
      Effect.flatMap((response) => response.json),
      Effect.flatMap(Schema.decodeUnknownEffect(ExecutionEnvironmentDescriptor)),
      Effect.map((descriptor) => descriptor.environmentId),
      Effect.timeout("5 seconds"),
      Effect.orElseSucceed(() => undefined),
    );

  const mintPairingUrl = Effect.fn("sandbox.mintPairingUrl")(function* (
    name: string,
    hostPort: number,
  ) {
    const output = yield* sbxExec(
      name,
      [
        "t3",
        "auth",
        "pairing",
        "create",
        "--label",
        name,
        "--base-url",
        `http://127.0.0.1:${hostPort}`,
      ],
      "create",
      "2 minutes",
    ).pipe(Effect.orElseSucceed(() => ""));
    return pickPairingUrl(output, hostPort);
  });

  // ---- weContain create options ------------------------------------------------

  /** The project's committed `.sandbox-config`; missing or broken means no defaults. */
  const readProjectOptions = Effect.fn("sandbox.readProjectOptions")(function* (
    projectCwd: string,
  ) {
    const raw = yield* fs
      .readFileString(path.join(projectCwd, SANDBOX_CONFIG_FILE))
      .pipe(Effect.orElseSucceed(() => ""));
    return raw.trim().length === 0 ? {} : parseProjectSandboxConfig(raw);
  });

  /**
   * Hands the project's current `.sandbox-config` to the guest start script,
   * so uncommitted edits (for example gortex excludes) apply on the next boot.
   * Only well-formed, small JSON crosses; it travels base64-encoded as a
   * positional argument and is never interpreted by a shell. A missing or
   * invalid file removes any earlier copy, so the clone's own file applies.
   */
  const pushProjectConfig = Effect.fn("sandbox.pushProjectConfig")(function* (
    name: string,
    projectCwd: string,
  ) {
    const raw = yield* fs
      .readFileString(path.join(projectCwd, SANDBOX_CONFIG_FILE))
      .pipe(Effect.orElseSucceed(() => ""));
    const usable = raw.length > 0 && raw.length <= PROJECT_CONFIG_MAX_BYTES && isJsonObject(raw);
    yield* sbxExec(
      name,
      usable
        ? [
            "sh",
            "-c",
            'mkdir -p "$(dirname "$1")" && printf %s "$2" | base64 -d > "$1"',
            "sh",
            GUEST_HOST_CONFIG_FILE,
            Buffer.from(raw, "utf8").toString("base64"),
          ]
        : ["rm", "-f", GUEST_HOST_CONFIG_FILE],
      "create",
      "1 minute",
    ).pipe(
      Effect.catch((error) =>
        Effect.logWarning("Could not hand .sandbox-config to the sandbox", {
          name,
          detail: error.detail,
        }),
      ),
    );
  });

  // ---- activity log -------------------------------------------------------------
  // Syncs, pushes, channel state and the command log, per sandbox: the newest
  // ACTIVITY_MEMORY_LIMIT in memory, everything appended to a JSONL file that
  // outlives the sandbox so its history can still be evaluated after removal.

  const activityDir = path.join(config.baseDir, "sandboxes", "activity");
  const activityBySandbox = new Map<string, SandboxActivityEvent[]>();
  const pendingActivity = new Map<string, string[]>();
  const channelStatus = new Map<string, SandboxChannelStatus>();
  let activitySequence = 0;

  const activityFile = (sandboxId: string) =>
    path.join(activityDir, `${sandboxId.replace(/[^a-zA-Z0-9_-]/g, "_")}.jsonl`);

  const loadActivity = Effect.fn("sandbox.loadActivity")(function* (sandboxId: string) {
    const cached = activityBySandbox.get(sandboxId);
    if (cached !== undefined) return cached;
    const raw = yield* fs
      .readFileString(activityFile(sandboxId))
      .pipe(Effect.orElseSucceed(() => ""));
    const events = raw
      .split("\n")
      .slice(-ACTIVITY_MEMORY_LIMIT)
      .flatMap((line) => {
        const decoded = decodeActivityLine(line);
        return decoded._tag === "Some" ? [decoded.value] : [];
      });
    activityBySandbox.set(sandboxId, events);
    return events;
  });

  const flushActivity = Effect.gen(function* () {
    if (pendingActivity.size === 0) return;
    const batches = [...pendingActivity.entries()];
    pendingActivity.clear();
    yield* fs.makeDirectory(activityDir, { recursive: true }).pipe(Effect.ignore);
    for (const [sandboxId, lines] of batches) {
      const file = activityFile(sandboxId);
      const size = yield* fs.stat(file).pipe(
        Effect.map((info) => Number(info.size)),
        Effect.orElseSucceed(() => 0),
      );
      if (size > ACTIVITY_FILE_MAX_BYTES) {
        yield* fs.rename(file, `${file}.1`).pipe(Effect.ignore);
      }
      yield* fs
        .writeFileString(file, `${lines.join("\n")}\n`, { flag: "a" })
        .pipe(
          Effect.catchCause((cause) =>
            Effect.logWarning("Failed to persist sandbox activity", { sandboxId, cause }),
          ),
        );
    }
  });

  yield* flushActivity.pipe(
    Effect.andThen(Effect.sleep(ACTIVITY_FLUSH_INTERVAL)),
    Effect.forever,
    Effect.forkDetach,
  );

  const recordActivity = Effect.fn("sandbox.recordActivity")(function* (
    sandbox: { readonly sandboxId: string; readonly name: string },
    entry: Omit<SandboxActivityEvent, "id" | "at" | "sandboxId" | "sandboxName" | "flags"> & {
      readonly flags?: ReadonlyArray<string>;
    },
  ) {
    const events = yield* loadActivity(sandbox.sandboxId);
    activitySequence += 1;
    const event: SandboxActivityEvent = {
      ...entry,
      id: `${(yield* Clock.currentTimeMillis).toString(36)}-${activitySequence.toString(36)}`,
      at: yield* nowIso,
      sandboxId: sandbox.sandboxId,
      sandboxName: sandbox.name,
      flags: entry.flags ?? [],
    };
    events.push(event);
    if (events.length > ACTIVITY_MEMORY_LIMIT) {
      events.splice(0, events.length - ACTIVITY_MEMORY_LIMIT);
    }
    const encoded = yield* encodeActivityLine(event).pipe(Effect.orElseSucceed(() => null));
    if (encoded !== null) {
      const pending = pendingActivity.get(sandbox.sandboxId) ?? [];
      pending.push(encoded);
      pendingActivity.set(sandbox.sandboxId, pending);
    }
  });

  const activity = (input: SandboxActivityInput) =>
    Effect.gen(function* () {
      const records = yield* readRecords();
      const persisted = yield* fs.readDirectory(activityDir).pipe(
        Effect.map((entries) =>
          entries
            .filter((entry) => entry.endsWith(".jsonl"))
            .map((entry) => entry.slice(0, -".jsonl".length)),
        ),
        Effect.orElseSucceed((): string[] => []),
      );
      const sandboxIds =
        input.sandboxId === undefined
          ? [...new Set([...records.map((record) => record.sandboxId), ...persisted])]
          : [input.sandboxId];
      const kinds = input.kinds === undefined ? null : new Set(input.kinds);
      const events: SandboxActivityEvent[] = [];
      for (const sandboxId of sandboxIds) {
        for (const event of yield* loadActivity(sandboxId)) {
          if (kinds !== null && !kinds.has(event.kind)) continue;
          if (input.flaggedOnly === true && event.flags.length === 0) continue;
          events.push(event);
        }
      }
      const limit = input.limit ?? 500;
      return {
        events: events
          .toSorted((left, right) =>
            right.at === left.at
              ? right.id.localeCompare(left.id)
              : right.at.localeCompare(left.at),
          )
          .slice(0, limit),
        channels: records.map(
          (record) =>
            channelStatus.get(record.sandboxId) ?? {
              sandboxId: record.sandboxId,
              connected: false,
              supported: false,
              sudo: false,
              commandLog: false,
              tamper: [],
              since: null,
            },
        ),
      } satisfies SandboxActivityResult;
    });

  // ---- host channel ---------------------------------------------------------------
  // Each running sandbox gets one root session running the guest channel
  // script. Holding it open is also what keeps sbx from stopping the VM (see
  // the keepalive notes below). The channel reports sync requests from
  // `t3-sync`, the command log and tampering with its own safeguards.

  /** Runs the channel when the image has it; older or custom images just idle. */
  const CHANNEL_BOOT = `if [ -x ${GUEST_CHANNEL_PATH} ]; then exec ${GUEST_CHANNEL_PATH}; fi; echo "T3CHANNEL 0"; exec sleep infinity`;

  /**
   * Re-applies the guest's safeguards (no sudo, request/result dirs, command
   * log file) as root before anything of the agent's runs. Images without the
   * channel have nothing to harden.
   */
  const hardenGuest = (name: string) =>
    runChecked("create", {
      command: "sbx",
      args: [
        "exec",
        "-u",
        "root",
        name,
        "--",
        "sh",
        "-c",
        `if [ -x ${GUEST_CHANNEL_PATH} ]; then exec ${GUEST_CHANNEL_PATH} --harden; fi`,
      ],
      timeout: "2 minutes",
    }).pipe(
      Effect.mapError((error) =>
        commandError("create", `could not apply the sandbox safeguards: ${error.detail}`),
      ),
    );

  /** Writes the answer `t3-sync` is waiting for. The text travels as an argument. */
  const answerSyncRequest = (name: string, requestId: string, text: string) =>
    runChecked("syncToHost", {
      command: "sbx",
      args: [
        "exec",
        "-u",
        "root",
        name,
        "--",
        "sh",
        "-c",
        'umask 022 && printf %s "$3" > "$1/.$2" && mv -f "$1/.$2" "$1/$2"',
        "sh",
        GUEST_SYNC_RESULT_DIR,
        requestId,
        text.slice(0, 4000),
      ],
      timeout: "1 minute",
    }).pipe(
      Effect.catch((error) =>
        Effect.logWarning("Could not answer a sandbox sync request", {
          name,
          detail: error.detail,
        }),
      ),
    );

  const agentSyncsInFlight = new Set<string>();
  const lastAgentSync = new Map<string, number>();

  /**
   * A sync the agent asked for with `t3-sync`. The host decides everything:
   * the sandbox comes from the session the request arrived on, never from the
   * request, and requests are serialized and rate limited per sandbox.
   */
  const handleSyncRequest = (sandboxId: string, name: string, requestId: string) =>
    Effect.gen(function* () {
      const now = yield* Clock.currentTimeMillis;
      const last = lastAgentSync.get(sandboxId) ?? 0;
      if (agentSyncsInFlight.has(sandboxId)) {
        return yield* answerSyncRequest(name, requestId, "error: a sync is already running");
      }
      if (now - last < AGENT_SYNC_MIN_INTERVAL_MS) {
        const wait = Math.ceil((AGENT_SYNC_MIN_INTERVAL_MS - (now - last)) / 1000);
        return yield* answerSyncRequest(
          name,
          requestId,
          `error: syncs are rate limited; try again in ${String(wait)}s`,
        );
      }
      agentSyncsInFlight.add(sandboxId);
      const answer = yield* syncToHostAs({ sandboxId }, "agent").pipe(
        Effect.map(
          (result) =>
            `ok: ${String(result.commitCount)} new commit(s) on ${result.branch}` +
            (result.mirroredToReceiver
              ? ", mirrored into the git receiver"
              : "; the git receiver could not be updated"),
        ),
        Effect.catch((error) => Effect.succeed(`error: ${error.message}`)),
        Effect.ensuring(
          Clock.currentTimeMillis.pipe(
            Effect.map((finishedAt) => {
              agentSyncsInFlight.delete(sandboxId);
              lastAgentSync.set(sandboxId, finishedAt);
            }),
          ),
        ),
      );
      yield* answerSyncRequest(name, requestId, answer);
    }).pipe(
      Effect.catchCause((cause) =>
        Effect.logWarning("Sandbox sync request failed", { name, cause }),
      ),
    );

  const handleChannelLine = (sandboxId: string, name: string, line: string) =>
    Effect.gen(function* () {
      const message = parseChannelLine(line);
      const sandbox = { sandboxId, name };
      switch (message.type) {
        case "hello": {
          const supported = message.version > 0;
          channelStatus.set(sandboxId, {
            sandboxId,
            connected: true,
            supported,
            sudo: supported ? message.sudo : true,
            commandLog: supported && message.commandLog,
            tamper: [],
            since: yield* nowIso,
          });
          yield* recordActivity(sandbox, {
            kind: "channel",
            source: "host",
            ok: true,
            summary: supported
              ? `Host channel connected (sudo ${message.sudo ? "on" : "off"}, command log ${message.commandLog ? "on" : "off"})`
              : "Host session connected; this image has no host channel (no t3-sync, no command log)",
          });
          return;
        }
        case "sync":
          yield* recordActivity(sandbox, {
            kind: "sync",
            source: "agent",
            ok: true,
            summary: "Sync requested with t3-sync",
          });
          yield* handleSyncRequest(sandboxId, name, message.requestId).pipe(Effect.forkDetach);
          return;
        case "command": {
          const flags = commandFlags(message.command.cmdline);
          yield* recordActivity(sandbox, {
            kind: "command",
            source: "agent",
            ok: flags.length === 0,
            summary: message.command.cmdline.slice(0, 200),
            command: message.command,
            flags,
          });
          return;
        }
        case "tamper": {
          const current = channelStatus.get(sandboxId);
          if (current !== undefined) {
            channelStatus.set(sandboxId, { ...current, tamper: message.state });
          }
          yield* recordActivity(sandbox, {
            kind: "tamper",
            source: "host",
            ok: message.state.length === 0,
            summary:
              message.state.length === 0
                ? "Safeguards intact"
                : `Safeguards changed inside the sandbox: ${message.state.join(", ")}`,
            flags: [...message.state],
          });
          return;
        }
        case "unknown":
          return;
      }
    });

  /** Holds the channel session until it ends; never fails. */
  const runChannel = (sandboxId: string, name: string) =>
    Effect.scoped(
      Effect.gen(function* () {
        const child = yield* spawner.spawn(
          ChildProcess.make("sbx", ["exec", "-u", "root", name, "--", "sh", "-c", CHANNEL_BOOT], {
            detached: false,
            shell: false,
            stdin: "ignore",
            stdout: "pipe",
            stderr: "ignore",
          }),
        );
        yield* child.stdout.pipe(
          Stream.decodeText(),
          Stream.splitLines,
          Stream.runForEach((line) => handleChannelLine(sandboxId, name, line)),
        );
        yield* child.exitCode.pipe(Effect.ignore);
      }),
    ).pipe(
      Effect.catchCause((cause) => Effect.logWarning("Sandbox channel failed", { name, cause })),
      Effect.ensuring(
        Effect.gen(function* () {
          const current = channelStatus.get(sandboxId);
          if (current?.connected === true) {
            channelStatus.set(sandboxId, { ...current, connected: false });
            yield* recordActivity(
              { sandboxId, name },
              { kind: "channel", source: "host", ok: false, summary: "Host channel closed" },
            );
          }
        }),
      ),
    );

  // ---- network policy ----------------------------------------------------------

  const sandboxIdsByName = Effect.fn("sandbox.sandboxIdsByName")(function* () {
    const records = yield* readRecords();
    return new Map(records.map((record) => [record.name, record.sandboxId] as const));
  });

  const readPolicyRules = Effect.fn("sandbox.readPolicyRules")(function* (
    operation: SandboxCommandError["operation"],
  ) {
    const raw = yield* runChecked(operation, {
      command: "sbx",
      args: ["policy", "ls", "--json"],
      timeout: "1 minute",
    });
    return parsePolicyRules(raw, yield* sandboxIdsByName());
  });

  const addPolicyRule = (
    operation: SandboxCommandError["operation"],
    decision: "allow" | "deny",
    resources: ReadonlyArray<string>,
    sandboxName: string | null,
  ) =>
    runChecked(operation, {
      command: "sbx",
      // Resources are validated against SANDBOX_NETWORK_RESOURCE_PATTERN, which
      // has no comma, so joining cannot smuggle in an extra resource.
      args: [
        "policy",
        decision,
        "network",
        ...(sandboxName === null ? [] : ["--sandbox", sandboxName]),
        resources.join(","),
      ],
      timeout: "1 minute",
    });

  /**
   * Adds the sandbox's own allow/deny hosts on top of the global sbx policy.
   * Scoped rules live exactly as long as the sandbox (`sbx rm` drops them), and
   * only missing ones are added, so re-opening converges without duplicates. A
   * deny the user asked for must never be skipped silently; an allow that did
   * not apply only means less network, so it warns.
   */
  const applyNetworkRules = Effect.fn("sandbox.applyNetworkRules")(function* (
    name: string,
    options: SandboxCreateOptions,
  ) {
    const allow = options.allowHosts ?? [];
    const deny = options.denyHosts ?? [];
    if (allow.length === 0 && deny.length === 0) {
      return null;
    }
    const risky = allow.filter((resource) => sandboxNetworkResourceRisk(resource) !== null);
    if (risky.length > 0) {
      return yield* commandError(
        "create",
        `${risky.join(", ")} would reach the host or the local network; allow it from the network view, which asks for confirmation`,
      );
    }
    const rules = yield* readPolicyRules("create").pipe(
      Effect.mapError((error) =>
        commandError(
          "create",
          `could not read the sbx network policy (check that your sbx version supports 'sbx policy ls --json'): ${error.detail}`,
        ),
      ),
    );
    const missingDeny = missingScopedResources(rules, name, "deny", deny);
    if (missingDeny.length > 0) {
      yield* addPolicyRule("create", "deny", missingDeny, name).pipe(
        Effect.mapError((error) =>
          commandError("create", `could not block ${missingDeny.join(", ")}: ${error.detail}`),
        ),
      );
    }
    const missingAllow = missingScopedResources(rules, name, "allow", allow);
    const allowApplied =
      missingAllow.length === 0 ||
      (yield* addPolicyRule("create", "allow", missingAllow, name).pipe(
        Effect.as(true),
        Effect.catch((error) =>
          Effect.logWarning("sbx policy allow failed", { name, detail: error.detail }).pipe(
            Effect.as(false),
          ),
        ),
      ));
    const parts = [
      ...(allow.length === 0
        ? []
        : [
            allowApplied
              ? `${String(allow.length)} extra hosts allowed`
              : `${String(missingAllow.length)} extra hosts could not be allowed`,
          ]),
      ...(deny.length === 0 ? [] : [`${String(deny.length)} hosts blocked`]),
    ];
    return `Global policy, plus ${parts.join(", ")}`;
  });

  const networkOverview = Effect.gen(function* () {
    yield* availability();
    const rules = yield* readPolicyRules("policy");
    const log = yield* runChecked("policy", {
      command: "sbx",
      args: ["policy", "log", "--json", "--limit", String(NETWORK_LOG_LIMIT)],
      timeout: "1 minute",
    });
    return {
      rules,
      events: parseNetworkLog(log, yield* sandboxIdsByName()),
    } satisfies SandboxNetworkOverviewResult;
  });

  /**
   * Adds a rule for one managed sandbox or for all sandboxes. The sandbox is
   * resolved from the app's own records, never from a name the client sends,
   * and an allow that reaches the host or the local network needs an explicit
   * acknowledgement.
   */
  const policyAddRule = (input: SandboxPolicyAddRuleInput) =>
    Effect.gen(function* () {
      yield* availability();
      const resources = [...new Set(input.resources.map((resource) => resource.toLowerCase()))];
      if (input.decision === "allow" && input.acknowledgeRisk !== true) {
        const risky = resources.filter((resource) => sandboxNetworkResourceRisk(resource) !== null);
        if (risky.length > 0) {
          return yield* commandError(
            "policy",
            `allowing ${risky.join(", ")} reaches the host or the local network; confirm the risk to add it`,
          );
        }
      }
      const record = input.sandboxId === undefined ? null : yield* getRecord(input.sandboxId);
      const sandboxName = record?.name ?? null;
      yield* addPolicyRule("policy", input.decision, resources, sandboxName);
      if (record !== null) {
        yield* recordActivity(record, {
          kind: "policy",
          source: "user",
          ok: true,
          summary: `${input.decision === "allow" ? "Allowed" : "Blocked"} ${resources.join(", ")}`,
        });
      }
      yield* Effect.logInfo("sandbox network rule added", {
        decision: input.decision,
        resources,
        scope: sandboxName ?? "global",
      });
      return yield* networkOverview;
    });

  /** Removes a rule the user added. Built-in sbx groups are never touched. */
  const policyRemoveRule = (input: SandboxPolicyRemoveRuleInput) =>
    Effect.gen(function* () {
      yield* availability();
      const rules = yield* readPolicyRules("policy");
      const rule = rules.find((candidate) => candidate.ruleId === input.ruleId);
      if (rule === undefined) {
        return yield* commandError("policy", `no network rule ${input.ruleId}`);
      }
      if (!rule.removable) {
        return yield* commandError(
          "policy",
          `${rule.name} is a built-in sbx rule; change it with 'sbx policy' if you really need to`,
        );
      }
      yield* runChecked("policy", {
        command: "sbx",
        args: [
          "policy",
          "rm",
          "network",
          ...(rule.sandboxName === null ? [] : ["--sandbox", rule.sandboxName]),
          "--id",
          rule.ruleId,
        ],
        timeout: "1 minute",
      });
      if (rule.sandboxId !== null && rule.sandboxName !== null) {
        yield* recordActivity(
          { sandboxId: rule.sandboxId, name: rule.sandboxName },
          {
            kind: "policy",
            source: "user",
            ok: true,
            summary: `Removed ${rule.decision} rule for ${rule.resources.join(", ")}`,
          },
        );
      }
      yield* Effect.logInfo("sandbox network rule removed", {
        ruleId: rule.ruleId,
        decision: rule.decision,
        resources: rule.resources,
        scope: rule.sandboxName ?? "global",
      });
      return yield* networkOverview;
    });

  /**
   * Gives the guest clone the host project's repository identity as its
   * `upstream` remote. The guest's `origin` is the sandbox git daemon, so
   * without this the sandbox's t3 server names the project after
   * `git://127.0.0.1:9418/...` and the app treats it as a different
   * repository: its own group, and "Run on" cannot switch a chat into it.
   * Best effort; a project without a usable remote just stays separate.
   */
  const linkGuestToHostRepository = Effect.fn("sandbox.linkGuestToHostRepository")(function* (
    name: string,
    projectCwd: string,
    workdir: string,
  ) {
    const remotes = yield* gitRun("create", projectCwd, ["remote", "-v"]).pipe(
      Effect.orElseSucceed(() => ""),
    );
    const upstream = guestUpstreamUrl(remotes);
    if (upstream === null) return;
    yield* sbxExec(
      name,
      [
        "sh",
        "-c",
        'git -C "$1" remote set-url upstream "$2" 2>/dev/null || git -C "$1" remote add upstream "$2"',
        "sh",
        workdir,
        upstream,
      ],
      "create",
      "1 minute",
    ).pipe(
      Effect.catch((error) =>
        Effect.logWarning("Sandbox could not link the clone to the host repository", {
          name,
          detail: error.detail,
        }),
      ),
    );
  });

  /**
   * `sync.ignore` lands in the clone's `.git/info/exclude` (never committed);
   * `sync.skipWorktree` freezes tracked files. Values travel as positional
   * arguments, never spliced into the shell script.
   */
  const applySyncFilters = Effect.fn("sandbox.applySyncFilters")(function* (
    name: string,
    workdir: string,
    options: SandboxCreateOptions,
  ) {
    const ignore = options.syncIgnore ?? [];
    if (ignore.length > 0) {
      yield* sbxExec(
        name,
        [
          "sh",
          "-c",
          'f="$1/.git/info/exclude"; shift; mkdir -p "$(dirname "$f")"; for p in "$@"; do grep -qxF -- "$p" "$f" 2>/dev/null || printf "%s\\n" "$p" >> "$f"; done',
          "sh",
          workdir,
          ...ignore,
        ],
        "create",
        "1 minute",
      ).pipe(
        Effect.catch((error) =>
          Effect.logWarning("Failed to apply sync.ignore", { name, detail: error.detail }),
        ),
      );
    }
    for (const file of options.skipWorktree ?? []) {
      yield* sbxExec(
        name,
        ["git", "-C", workdir, "update-index", "--skip-worktree", "--", file],
        "create",
        "1 minute",
      ).pipe(
        Effect.catch((error) =>
          Effect.logWarning("Failed to freeze file (not tracked?)", {
            name,
            file,
            detail: error.detail,
          }),
        ),
      );
    }
  });

  // ---- gortex warm cache ----------------------------------------------------------
  // The gortex graph lives in ~/.gortex/store plus the workspace's .gortex dir.
  // Restoring a saved copy turns a cold (OOM-prone) full index into an mtime
  // based incremental pass. The checksum is a corruption guard, not a trust
  // boundary: extraction runs as the unprivileged agent and every member is
  // checked against the two cached trees, so a hostile cache gains nothing the
  // agent does not already have — a rejected cache just costs a cold index.

  const cacheDirFor = (projectCwd: string) =>
    path.join(
      gortexCacheRoot,
      `${sanitizeRepoName(path.basename(projectCwd))}-${NodeCrypto.createHash("sha256")
        .update(projectCwd)
        .digest("hex")
        .slice(0, 12)}`,
    );

  /** Streamed: a cached index can be hundreds of megabytes. */
  const sha256File = (filePath: string) =>
    Effect.gen(function* () {
      const hash = NodeCrypto.createHash("sha256");
      yield* fs
        .stream(filePath)
        .pipe(Stream.runForEach((chunk) => Effect.sync(() => hash.update(chunk))));
      return hash.digest("hex");
    }).pipe(Effect.mapError(() => commandError("create", `could not read ${filePath}`)));

  /** The guest clone dir's own name; guest paths are always POSIX. */
  const guestBasename = (workdir: string) =>
    workdir.split("/").findLast((part) => part.length > 0) ?? "";

  const restoreGortexCache = Effect.fn("sandbox.restoreGortexCache")(function* (
    name: string,
    projectCwd: string,
    workdir: string,
  ) {
    const cacheDir = cacheDirFor(projectCwd);
    const manifestRaw = yield* fs
      .readFileString(path.join(cacheDir, GORTEX_CACHE_MANIFEST))
      .pipe(Effect.orElseSucceed(() => ""));
    const manifest = yield* decodeCacheManifest(manifestRaw).pipe(Effect.orElseSucceed(() => null));
    if (manifest === null) {
      return "No saved index yet";
    }
    const actual = yield* sha256File(path.join(cacheDir, GORTEX_CACHE_TARBALL)).pipe(
      Effect.orElseSucceed(() => ""),
    );
    if (actual !== manifest.sha256) {
      return "Saved index failed its checksum; indexing cold";
    }
    const staged = `${GUEST_HOME}/.gortex-cache-restore.tar.gz`;
    // A relative source with cwd set: `C:\...` would read as a sandbox name.
    yield* runChecked("create", {
      command: "sbx",
      args: ["cp", GORTEX_CACHE_TARBALL, `${name}:${staged}`],
      cwd: cacheDir,
      timeout: "10 minutes",
    });
    yield* sbxExec(
      name,
      [
        "sh",
        "-c",
        [
          "set -eu",
          't="$1"; ws="$2"',
          'tar -tvzf "$t" | grep -qvE "^[-d]" && { echo "cache rejected: irregular member type" >&2; exit 1; }',
          'tar -tzf "$t" | grep -qE "(^|/)\\.\\.(/|$)|^/" && { echo "cache rejected: unsafe member path" >&2; exit 1; }',
          'tar -tzf "$t" | grep -qvE "^(\\.gortex/store(/|$)|$ws/\\.gortex(/|$))" && { echo "cache rejected: member outside cached trees" >&2; exit 1; }',
          'mkdir -p "$HOME/.gortex"',
          'tar xzf "$t" -C "$HOME"',
          'rm -f "$t" || true',
        ].join("\n"),
        "sh",
        staged,
        guestBasename(workdir),
      ],
      "create",
      "10 minutes",
    );
    return manifest.commit.length > 0
      ? `Restored index from ${manifest.commit.slice(0, 12)}`
      : "Restored saved index";
  });

  /**
   * Snapshots the index from a clean daemon stop — tarring a live SQLite WAL
   * cost a 73s heal pass on the next start — then restarts and re-tracks, so
   * the sandbox is never left without gortex. Best effort throughout.
   */
  const saveGortexCache = Effect.fn("sandbox.saveGortexCache")(function* (
    name: string,
    projectCwd: string,
    workdir: string,
    /** Wait for a running first index to finish instead of skipping the save. */
    waitForIndex: boolean,
  ) {
    // Stopping the daemon mid-index would snapshot a partial graph and restart
    // the whole index, so only a finished index is saved.
    const indexReady = () =>
      sbxExec(name, ["test", "-f", GUEST_GORTEX_READY_FILE], "create", "1 minute").pipe(
        Effect.as(true),
        Effect.orElseSucceed(() => false),
      );
    let ready = yield* indexReady();
    const attempts = waitForIndex ? GORTEX_INDEX_WAIT_ATTEMPTS : 0;
    for (let attempt = 0; !ready && attempt < attempts; attempt++) {
      yield* Effect.sleep("30 seconds");
      ready = yield* indexReady();
    }
    if (!ready) {
      yield* Effect.logInfo("Skipping the gortex cache save: the first index has not finished", {
        name,
      });
      return;
    }
    const cacheDir = cacheDirFor(projectCwd);
    yield* fs.makeDirectory(cacheDir, { recursive: true }).pipe(Effect.orDie);
    const commit = (yield* sbxExec(
      name,
      ["git", "-C", workdir, "rev-parse", "HEAD"],
      "create",
      "1 minute",
    ).pipe(Effect.orElseSucceed(() => ""))).trim();
    const staged = `${GUEST_HOME}/.gortex-cache-save.tar.gz`;
    yield* sbxExec(name, ["gortex", "daemon", "stop"], "create", "3 minutes").pipe(Effect.ignore);
    yield* sbxExec(
      name,
      [
        "sh",
        "-c",
        [
          "set -eu",
          'out="$1"; ws="$2"',
          "set -- .gortex/store",
          '[ -d "$HOME/$ws/.gortex" ] && set -- "$@" "$ws/.gortex"',
          'tar czf "$out" -C "$HOME" --exclude=.gortex/store/store.sqlite.lock "$@"',
        ].join("\n"),
        "sh",
        staged,
        guestBasename(workdir),
      ],
      "create",
      "10 minutes",
    ).pipe(
      Effect.ensuring(
        sbxExec(
          name,
          ["sh", "-c", 'gortex daemon start --detach && gortex track "$1"', "sh", workdir],
          "create",
          "3 minutes",
        ).pipe(Effect.ignore),
      ),
    );
    const incoming = `${GORTEX_CACHE_TARBALL}.incoming`;
    const incomingPath = path.join(cacheDir, incoming);
    // First gate, on the guest's word: skip anything too big to be worth copying.
    const reportedBytes = Number.parseInt(
      (yield* sbxExec(name, ["stat", "-c", "%s", staged], "create", "1 minute").pipe(
        Effect.orElseSucceed(() => ""),
      )).trim(),
      10,
    );
    if (!Number.isFinite(reportedBytes) || reportedBytes > GORTEX_CACHE_MAX_BYTES) {
      yield* sbxExec(name, ["rm", "-f", staged], "create", "1 minute").pipe(Effect.ignore);
      return yield* commandError("create", "the gortex cache is missing or too large to keep");
    }
    yield* fs.remove(incomingPath, { recursive: true, force: true }).pipe(Effect.ignore);
    yield* runChecked("create", {
      command: "sbx",
      args: ["cp", `${name}:${staged}`, incoming],
      cwd: cacheDir,
      timeout: "10 minutes",
    });
    yield* sbxExec(name, ["rm", "-f", staged], "create", "1 minute").pipe(Effect.ignore);
    // Second gate, on the host's own view. The guest owns the staged path and
    // can swap it for a symlink or a directory; a link kept here would let the
    // next restore copy an arbitrary host file into a sandbox.
    const isLink = yield* fs.readLink(incomingPath).pipe(
      Effect.as(true),
      Effect.orElseSucceed(() => false),
    );
    const info = yield* fs.stat(incomingPath).pipe(Effect.orElseSucceed(() => null));
    if (
      isLink ||
      info === null ||
      info.type !== "File" ||
      Number(info.size) > GORTEX_CACHE_MAX_BYTES
    ) {
      yield* fs.remove(incomingPath, { recursive: true, force: true }).pipe(Effect.ignore);
      return yield* commandError(
        "create",
        "rejected the gortex cache: not a plain file of sane size",
      );
    }
    const sha256 = yield* sha256File(incomingPath);
    yield* fs
      .rename(path.join(cacheDir, incoming), path.join(cacheDir, GORTEX_CACHE_TARBALL))
      .pipe(Effect.mapError(() => commandError("create", "could not store the gortex cache")));
    yield* fs
      .writeFileString(
        path.join(cacheDir, GORTEX_CACHE_MANIFEST),
        yield* encodeCacheManifest({ commit, sha256, savedAt: yield* nowIso }).pipe(
          Effect.mapError(() => commandError("create", "could not encode the cache manifest")),
        ),
      )
      .pipe(Effect.mapError(() => commandError("create", "could not write the cache manifest")));
    yield* Effect.logInfo("Saved gortex warm cache", { name, commit });
  });

  // ---- keepalive supervision ---------------------------------------------------------
  // Docker Sandboxes stops a VM ~30s after its last attached `sbx exec` session
  // ends — and "attached" means the host-side sbx client process is alive; a
  // `sleep infinity` left inside the VM does not count. `sbx exec -d` never
  // returns on Windows, so a timed-out detached exec used to end the session
  // and take the sandbox's t3 server down 30s later. Each running sandbox
  // therefore gets a supervisor that holds one attached session for as long as
  // the sandbox should run, and revives the guest (start-t3 is idempotent) when
  // that session ends because the VM stopped anyway.

  const keepAlives = new Map<string, Fiber.Fiber<void, never>>();

  const superviseSandbox = (sandboxId: string, name: string, bootFirst: boolean) =>
    Effect.gen(function* () {
      let boot = bootFirst;
      for (;;) {
        if (boot) {
          yield* hardenGuest(name)
            .pipe(
              // Sandboxes from before the upstream link get it on their next boot.
              Effect.andThen(
                getRecord(sandboxId).pipe(
                  Effect.orElseSucceed(() => null),
                  Effect.flatMap((record) =>
                    record?.workspaceDir
                      ? linkGuestToHostRepository(name, record.projectCwd, record.workspaceDir)
                      : Effect.void,
                  ),
                ),
              ),
              Effect.andThen(sbxExec(name, ["start-t3"], "create", "10 minutes")),
            )
            .pipe(
              Effect.catch((error) =>
                Effect.logWarning("Sandbox revive failed; retrying", {
                  name,
                  detail: error.detail,
                }),
              ),
            );
        }
        boot = true;
        // Blocks for as long as the VM lives. Ending it lets sbx stop the VM.
        yield* runChannel(sandboxId, name);
        const record = yield* getRecord(sandboxId).pipe(Effect.orElseSucceed(() => null));
        if (record === null || record.status !== "running" || !(yield* parseSbxNames()).has(name)) {
          return;
        }
        yield* Effect.logWarning("Sandbox session ended; reviving the guest", { name });
        yield* Effect.sleep(KEEPALIVE_RETRY_DELAY);
      }
    }).pipe(
      Effect.ensuring(Effect.sync(() => keepAlives.delete(name))),
      Effect.catchCause((cause) => Effect.logWarning("Sandbox keepalive stopped", { name, cause })),
    );

  const ensureKeepAlive = (
    sandboxId: string,
    name: string,
    options: { readonly bootFirst: boolean },
  ) =>
    Effect.gen(function* () {
      if (keepAlives.has(name)) return;
      const fiber = yield* superviseSandbox(sandboxId, name, options.bootFirst).pipe(
        Effect.forkDetach,
      );
      keepAlives.set(name, fiber);
    });

  const stopKeepAlive = (name: string) =>
    Effect.gen(function* () {
      const fiber = keepAlives.get(name);
      keepAlives.delete(name);
      if (fiber !== undefined) {
        yield* Fiber.interrupt(fiber);
      }
    });

  const generateSandboxId = () => `sbx-${NodeCrypto.randomUUID().replaceAll("-", "").slice(0, 16)}`;

  /**
   * Attaching is deliberately explicit: a new chat on a folder that already has
   * a sandbox is offered the choice, never silently joined to it, because two
   * chats sharing one workspace can overwrite each other's uncommitted work.
   */
  const attach = (input: {
    readonly sandboxId: string;
    readonly threadId: SandboxInfo["createdByThreadId"];
  }) =>
    Effect.gen(function* () {
      const record = yield* getRecord(input.sandboxId);
      if (record.threadIds.includes(input.threadId)) {
        return toSandboxInfo(record);
      }
      const updated = yield* updateRecord(input.sandboxId, (current) => ({
        ...current,
        threadIds: [...current.threadIds, input.threadId],
      }));
      return toSandboxInfo(updated);
    });

  const detach = (input: {
    readonly sandboxId: string;
    readonly threadId: SandboxInfo["createdByThreadId"];
  }) =>
    Effect.gen(function* () {
      const record = yield* getRecord(input.sandboxId);
      if (!record.threadIds.includes(input.threadId)) {
        return toSandboxInfo(record);
      }
      const updated = yield* updateRecord(input.sandboxId, (current) => ({
        ...current,
        threadIds: current.threadIds.filter((threadId) => threadId !== input.threadId),
      }));
      return toSandboxInfo(updated);
    });

  /**
   * Persist a half-built sandbox as `error` so it stays listed, removable, and
   * resumable: the next create for this thread and folder finds it, reuses its
   * name and port, and resumes it rather than orphaning the container. A create
   * that fails before the sandbox is named left nothing behind and writes
   * nothing. Persistence is best effort, since failing here would mask the
   * failure the user actually needs to see.
   */
  const recordFailure = (
    input: SandboxCreateRequest,
    started: StartedSandbox | null,
    error: SandboxError,
  ) =>
    started === null
      ? Effect.void
      : Effect.gen(function* () {
          const records = yield* readRecords();
          const now = yield* nowIso;
          const record = buildFailureRecord({
            input,
            started,
            message: error.message,
            now,
          });
          yield* writeRecords([
            record,
            ...records.filter((candidate) => candidate.sandboxId !== record.sandboxId),
          ]);
        }).pipe(Effect.ignore);

  const SKIPPABLE_STEPS = [
    "template",
    "image",
    "receiver",
    "sandbox",
    "network",
    "workspace",
    "cache",
    "ports",
    "boot",
  ] as const satisfies ReadonlyArray<SandboxCreateStep>;

  const createWithProgress = (
    input: SandboxCreateRequest,
    onProgress: (progress: SandboxCreateProgress) => Effect.Effect<void>,
  ) =>
    Effect.gen(function* () {
      // The current step is tracked so a failure anywhere in the pipeline is
      // reported against the step the user is watching.
      const currentStep = yield* Ref.make<SandboxCreateStep>("availability");
      // Set once the sandbox has a name; everything past that point is
      // recoverable state that a retry should reuse rather than recreate.
      const started = yield* Ref.make<StartedSandbox | null>(null);
      const emit = (
        step: SandboxCreateStep,
        status: SandboxCreateProgress["status"],
        detail: string | null = null,
        sandbox: SandboxInfo | null = null,
      ) =>
        Effect.gen(function* () {
          yield* Ref.set(currentStep, step);
          yield* onProgress({ step, status, detail, sandbox });
        });

      return yield* Effect.gen(function* () {
        if (input.attachSandboxId !== undefined) {
          const attached = yield* attach({
            sandboxId: input.attachSandboxId,
            threadId: input.threadId,
          });
          if (attached.status === "running") {
            yield* ensureKeepAlive(attached.sandboxId, attached.name, { bootFirst: true });
          }
          yield* emit("availability", "skipped", "Reusing the running sandbox");
          for (const step of SKIPPABLE_STEPS) {
            yield* emit(step, "skipped", "Reusing the running sandbox");
          }
          yield* emit("ready", "done", `Attached to ${attached.name}`, attached);
          return attached;
        }

        yield* emit("availability", "running");
        yield* availability();
        yield* emit("availability", "done");

        const records = yield* readRecords();
        // A chat that already owns a sandbox for this folder reopens it rather
        // than stacking up a second copy of the same workspace.
        const existing = records.find(
          (record) =>
            record.threadIds.includes(input.threadId) &&
            record.projectCwd === input.projectCwd &&
            record.status !== "removing",
        );
        if (existing !== undefined && existing.status === "running") {
          // After an app restart nobody holds its session; revive if needed.
          yield* ensureKeepAlive(existing.sandboxId, existing.name, { bootFirst: true });
          for (const step of SKIPPABLE_STEPS) {
            yield* emit(step, "skipped", "Sandbox is already running");
          }
          yield* emit("ready", "done", null, toSandboxInfo(existing));
          return toSandboxInfo(existing);
        }

        yield* emit("template", "running");
        const template = yield* resolveTemplate(input.templateId ?? existing?.templateId);
        const templateId = template.template.manifest.id;
        const imageTag = sandboxImageTag({
          templateId,
          version: serverVersion,
          contentHash: template.contentHash,
        });
        const features = templateFeatures(template.template.manifest);
        // Explicit options win; the project's committed .sandbox-config fills
        // the gaps; a resumed sandbox keeps what it was created with.
        const options = resolveCreateOptions(
          input.options ?? existing?.options,
          yield* readProjectOptions(input.projectCwd),
        );
        yield* emit("template", "done", template.template.manifest.name);

        yield* emit("image", "running", `Building ${imageTag}`);
        const built = yield* ensureImage(template, imageTag);
        yield* emit("image", built ? "done" : "skipped", built ? null : "Image already built");

        yield* emit("receiver", "running");
        yield* ensureReceiver();
        yield* emit("receiver", "done");

        // The daemon exports the parent directory, so the repository path is
        // the project's folder name exactly as on disk: case matters inside
        // the Linux guest ("weContain" is not "wecontain").
        const projectFolder = path.basename(input.projectCwd);
        if (!PROJECT_FOLDER_PATTERN.test(projectFolder)) {
          return yield* commandError(
            "create",
            `the project folder name "${projectFolder}" cannot be served to the sandbox; use letters, digits, spaces, ".", "_" or "-"`,
          );
        }
        const repoName = sanitizeRepoName(projectFolder);
        const sandboxId = existing?.sandboxId ?? generateSandboxId();
        const name =
          existing?.name ?? `t3-${repoName.slice(0, 24)}-${sandboxId.slice(-8)}`.toLowerCase();
        // New sandboxes clone into a project-named guest dir; an existing
        // (legacy) record keeps whatever the guest already cloned into.
        const guestWorkdir = existing?.workspaceDir ?? guestWorkspaceDir(input.projectCwd);

        yield* Ref.set(started, {
          sandboxId,
          name,
          templateId,
          image: imageTag,
          hostPort: existing?.hostPort ?? null,
          existing,
          workspaceDir: guestWorkdir,
          options,
        });

        yield* emit("sandbox", "running", name);
        const names = yield* parseSbxNames();
        const createdFresh = !names.has(name);
        if (createdFresh) {
          yield* runChecked("create", {
            command: "sbx",
            args: [
              "create",
              "--clone",
              "--name",
              name,
              // The guest clones into a folder named after the project, unlike
              // the generic "workspace" default the base image bakes in.
              "-e",
              `${SANDBOX_WORKSPACE_ENV}=${guestWorkdir}`,
              // Big repos OOM gortex's indexer at the sbx default ceiling.
              ...(options.memory === undefined ? [] : ["-m", options.memory]),
              ...(options.cpus === undefined ? [] : ["--cpus", String(options.cpus)]),
              "-t",
              imageTag,
              "claude",
              input.projectCwd,
            ],
            timeout: "15 minutes",
          });
        }
        // A sandbox that already exists is reused rather than recreated, which
        // preserves its workspace. `sbx` has no `start`: the first `sbx exec`
        // below starts a stopped sandbox on its own.
        yield* emit("sandbox", "done", name);
        // Before anything of the agent's runs: drop sudo where the template
        // says so and set up the host channel's request/result dirs.
        yield* hardenGuest(name);

        // Re-applied on every open, adding only what is missing.
        yield* emit("network", "running");
        const networkDetail = yield* applyNetworkRules(name, options);
        yield* emit(
          "network",
          networkDetail === null ? "skipped" : "done",
          networkDetail ?? "Global sbx network policy",
        );

        // The project reaches the sandbox through the sandbox-internal git
        // daemon; clone retries absorb slow sbx startup.
        yield* emit("workspace", "running");
        for (let attempt = 0; attempt < 10; attempt++) {
          const clone = yield* sbxExec(
            name,
            [
              "sh",
              "-c",
              // A clone that died half way leaves a directory without a
              // usable .git behind, which would fail every later attempt.
              // Folder and target arrive as arguments, never as shell text.
              'test -d "$2/.git" || { rm -rf "$2"; git clone "git://127.0.0.1:$1/$3" "$2"; }',
              "sh",
              String(GUEST_SBX_GIT_PORT),
              guestWorkdir,
              projectFolder,
            ],
            "create",
            "5 minutes",
          ).pipe(
            Effect.as(null),
            Effect.catch((error) => Effect.succeed(error.detail)),
          );
          if (clone === null) {
            break;
          }
          yield* Effect.logWarning("Sandbox workspace clone failed; retrying", {
            name,
            attempt: attempt + 1,
            detail: clone,
          });
          if (attempt === 9) {
            return yield* commandError(
              "create",
              `failed to attach the project workspace inside the sandbox: ${clone.slice(-600)}`,
            );
          }
          yield* Effect.sleep("3 seconds");
        }
        yield* applySyncFilters(name, guestWorkdir, options);
        yield* linkGuestToHostRepository(name, input.projectCwd, guestWorkdir);
        yield* emit("workspace", "done");

        // Only onto a fresh clone: a reused sandbox already holds live gortex
        // state that a snapshot could clobber.
        const warmCache = features.gortex && options.warmCache !== false;
        if (warmCache && createdFresh) {
          yield* emit("cache", "running");
          const cacheDetail = yield* restoreGortexCache(name, input.projectCwd, guestWorkdir).pipe(
            Effect.catch((error) =>
              Effect.succeed(`Saved index not restored (${error.detail}); indexing cold`),
            ),
          );
          yield* emit("cache", "done", cacheDetail);
        } else {
          yield* emit(
            "cache",
            "skipped",
            warmCache ? "Sandbox keeps its own index" : "No gortex warm cache",
          );
        }

        yield* emit("ports", "running");
        const hostPort = existing?.hostPort ?? (yield* allocateHostPort());
        yield* Ref.update(started, (current) =>
          current === null ? current : { ...current, hostPort },
        );
        yield* runUnchecked({
          command: "sbx",
          args: ["ports", name, "--publish", `127.0.0.1:${hostPort}:${GUEST_T3_PORT}`],
          timeout: "1 minutes",
        });
        yield* emit("ports", "done", `127.0.0.1:${String(hostPort)}`);

        yield* emit(
          "boot",
          "running",
          features.gortex ? "Starting t3; gortex gets a few minutes for its first index" : null,
        );
        yield* pushProjectConfig(name, input.projectCwd);
        yield* sbxExec(name, ["start-t3"], "create", "10 minutes");
        yield* ensureKeepAlive(sandboxId, name, { bootFirst: false });
        yield* emit("boot", "done");

        yield* emit("ready", "running");
        yield* waitForGuestReady(hostPort);
        const pairingUrl = yield* mintPairingUrl(name, hostPort);
        // Captured only on the first boot of a fresh image, before any agent
        // code has run in the guest; later answers from the guest never
        // overwrite it (it decides which saved connection is a sandbox).
        const environmentId =
          existing?.environmentId ??
          (createdFresh ? yield* readGuestEnvironmentId(hostPort) : undefined);

        const now = yield* nowIso;
        const threadIds =
          existing !== undefined && existing.threadIds.includes(input.threadId)
            ? existing.threadIds
            : [...(existing?.threadIds ?? []), input.threadId];
        const record: SandboxRecord = {
          sandboxId,
          name,
          projectId: input.projectId,
          createdByThreadId: existing?.createdByThreadId ?? input.threadId,
          threadIds,
          projectCwd: input.projectCwd,
          templateId,
          status: "running",
          image: imageTag,
          hostPort,
          pairingUrl,
          workspaceDir: guestWorkdir,
          branch: existing?.branch ?? null,
          message: null,
          options,
          ...(environmentId === undefined ? {} : { environmentId }),
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
        };
        yield* writeRecords([
          record,
          ...records.filter((candidate) => candidate.sandboxId !== record.sandboxId),
        ]);
        const info = toSandboxInfo(record);
        yield* emit("ready", "done", null, info);
        // After the pairing link is out: the save stops and restarts the
        // daemon, which nobody should have to wait for.
        if (warmCache) {
          yield* saveGortexCache(name, input.projectCwd, guestWorkdir, true).pipe(
            Effect.catchCause((cause) =>
              Effect.logWarning("Failed to save the gortex warm cache", { name, cause }),
            ),
            Effect.forkDetach,
          );
        }
        return info;
      }).pipe(
        Effect.tapError((error: SandboxError) =>
          Effect.gen(function* () {
            yield* recordFailure(input, yield* Ref.get(started), error);
            const step = yield* Ref.get(currentStep);
            yield* onProgress({ step, status: "failed", detail: error.message, sandbox: null });
          }),
        ),
      );
    });

  const create = (input: SandboxCreateRequest) => createWithProgress(input, () => Effect.void);

  const getRecord = Effect.fn("sandbox.getRecord")(function* (sandboxId: string) {
    const records = yield* readRecords();
    const record = records.find((candidate) => candidate.sandboxId === sandboxId);
    if (record === undefined) {
      return yield* new SandboxNotFoundError({ sandboxId });
    }
    return record;
  });

  const stop = (input: { readonly sandboxId: string }) =>
    Effect.gen(function* () {
      const record = yield* getRecord(input.sandboxId);
      yield* availability();
      yield* stopKeepAlive(record.name);
      yield* runUnchecked({
        command: "sbx",
        args: ["stop", record.name],
        timeout: "5 minutes",
      });
      const updated = yield* updateRecord(input.sandboxId, (current) => ({
        ...current,
        status: "stopped",
        pairingUrl: null,
      }));
      return toSandboxInfo(updated);
    });

  const remove = (input: { readonly sandboxId: string }) =>
    Effect.gen(function* () {
      const record = yield* getRecord(input.sandboxId);
      yield* availability();
      // The index is most complete right before removal; keep it for the next
      // sandbox of this folder. Bounded, and never a reason to keep the box.
      const template = yield* templates
        .get(record.templateId)
        .pipe(Effect.orElseSucceed(() => null));
      if (
        record.status === "running" &&
        template !== null &&
        template.template.manifest.gortex &&
        record.options?.warmCache !== false
      ) {
        yield* saveGortexCache(
          record.name,
          record.projectCwd,
          recordWorkspaceDir(record),
          false,
        ).pipe(
          Effect.timeout("5 minutes"),
          Effect.catchCause((cause) =>
            Effect.logWarning("Skipped the gortex cache save before removal", {
              name: record.name,
              cause,
            }),
          ),
        );
      }
      yield* updateRecord(input.sandboxId, (current) => ({ ...current, status: "removing" }));
      yield* stopKeepAlive(record.name);
      yield* runUnchecked({
        command: "sbx",
        args: ["rm", "--force", record.name],
        timeout: "5 minutes",
      });
      yield* dockerExec([
        "exec",
        SANDBOX_RECEIVER_CONTAINER,
        "rm",
        "-rf",
        `/srv/git/${record.name}.git`,
      ]).pipe(Effect.ignore);
      yield* dropRecord(input.sandboxId);
      return { sandboxId: input.sandboxId };
    });

  // ---- synchronization ---------------------------------------------------------
  // All synchronization runs on the host t3 application: the sandbox is
  // reached through `ext::sbx exec` (git over stdio, no published ports or
  // firewall rules), and the durable mirror is the sbx-git-receiver container
  // ("docker git") reached through `ext::docker exec`.

  /**
   * Git over `sbx exec` stdio points at the guest clone directory. Sandboxes
   * created before per-project dirs carry `workspaceDir: null` and resolve to
   * the legacy fixed path.
   */
  const sandboxGitUrl = (record: SandboxRecord) =>
    `ext::sbx exec ${record.name} -- %S ${recordWorkspaceDir(record)}`;
  const receiverGitUrl = (name: string) =>
    `ext::docker exec -i ${SANDBOX_RECEIVER_CONTAINER} %S /srv/git/${name}.git`;

  const commitInSandbox = Effect.fn("sandbox.commitInSandbox")(function* (
    record: SandboxRecord,
    message: string,
  ) {
    yield* sbxExec(
      record.name,
      [
        "sh",
        "-c",
        `cd ${recordWorkspaceDir(record)} && git add -A && git commit -m '${message.replaceAll("'", `'\\''`)}'`,
      ],
      "syncToHost",
      "5 minutes",
    ).pipe(
      Effect.catchCause((cause) =>
        Effect.logInfo("No sandbox changes to commit", { name: record.name, cause }),
      ),
    );
  });

  const countCommits = Effect.fn("sandbox.countCommits")(function* (input: {
    readonly cwd: string;
    readonly from: string;
    readonly to: string;
  }) {
    const counted = yield* (
      input.from.trim().length === 0
        ? gitRun("syncToHost", input.cwd, ["rev-list", "--count", input.to, "--not", "--remotes"])
        : gitRun("syncToHost", input.cwd, ["rev-list", "--count", `${input.from}..${input.to}`])
    ).pipe(Effect.orElseSucceed(() => ""));
    return Number.parseInt(counted.trim(), 10) || 0;
  });

  const commitSubjects = Effect.fn("sandbox.commitSubjects")(function* (input: {
    readonly cwd: string;
    readonly from: string;
    readonly to: string;
    readonly commitCount: number;
  }) {
    if (input.commitCount === 0) {
      return [];
    }
    const rangeArgs =
      input.from.trim().length === 0
        ? [input.to, "--not", "--remotes"]
        : [`${input.from}..${input.to}`];
    const log = yield* gitRun("syncToHost", input.cwd, [
      "log",
      "--format=%s",
      "-n",
      "20",
      ...rangeArgs,
    ]).pipe(Effect.orElseSucceed(() => ""));
    return log
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
  });

  const syncToHost = (input: {
    readonly sandboxId: string;
    readonly commitMessage?: string | undefined;
  }) => syncToHostAs(input, "user");

  const syncToHostAs = (
    input: {
      readonly sandboxId: string;
      readonly commitMessage?: string | undefined;
    },
    source: SandboxActivityEvent["source"],
  ) =>
    Effect.gen(function* () {
      const record = yield* getRecord(input.sandboxId);
      const sandbox = { sandboxId: record.sandboxId, name: record.name };
      return yield* collectSandboxWork(record, input).pipe(
        Effect.tap((result) =>
          recordActivity(sandbox, {
            kind: "sync",
            source,
            ok: result.mirroredToReceiver,
            summary:
              `${String(result.commitCount)} new commit(s) on ${result.branch}` +
              (result.mirroredToReceiver ? "" : "; receiver not updated") +
              (result.hostRiskPaths.length > 0
                ? `; ${String(result.hostRiskPaths.length)} file(s) host tools act on`
                : ""),
            target: "receiver",
            flags: result.hostRiskPaths.length > 0 ? ["host-risk-files"] : [],
          }),
        ),
        Effect.tapError((error) =>
          recordActivity(sandbox, {
            kind: "sync",
            source,
            ok: false,
            summary: `Sync failed: ${error.message}`,
            target: "receiver",
          }),
        ),
      );
    });

  const collectSandboxWork = (
    record: SandboxRecord,
    input: { readonly commitMessage?: string | undefined },
  ) =>
    Effect.gen(function* () {
      yield* availability();
      if (input.commitMessage !== undefined) {
        yield* commitInSandbox(record, input.commitMessage);
      }

      const sandboxRef = `refs/sandbox/${record.name}`;
      // Whatever the sandbox has checked out, whichever branch the agent chose.
      // Fetched as the remote HEAD, so the sandbox-controlled branch name never
      // becomes an argument here.
      const headRef = `refs/sandbox-head/${record.name}`;
      const branch = `sandbox/${record.name}`;
      const previousBranchHead = (yield* gitRun("syncToHost", record.projectCwd, [
        "rev-parse",
        "--verify",
        "-q",
        branch,
      ]).pipe(Effect.orElseSucceed(() => ""))).trim();

      yield* gitRun("syncToHost", record.projectCwd, [
        "-c",
        "protocol.ext.allow=user",
        "fetch",
        "--force",
        sandboxGitUrl(record),
        `+HEAD:${headRef}`,
        `+refs/heads/*:${sandboxRef}/*`,
      ]);

      yield* gitRun("syncToHost", record.projectCwd, ["branch", "--force", branch, headRef]);

      const commitCount = yield* countCommits({
        cwd: record.projectCwd,
        from: previousBranchHead,
        to: branch,
      });
      const subjects = yield* commitSubjects({
        cwd: record.projectCwd,
        from: previousBranchHead,
        to: branch,
        commitCount,
      });

      // Mirror the collected work into the docker git receiver so it survives
      // sandbox removal and acts as the durable sync point.
      yield* ensureReceiverRepo(record.name);
      const mirroredToReceiver = yield* gitRun("syncToHost", record.projectCwd, [
        "-c",
        "protocol.ext.allow=user",
        "push",
        "--force",
        receiverGitUrl(record.name),
        `${headRef}:refs/heads/work`,
      ]).pipe(
        Effect.as(true),
        Effect.catchCause((cause) =>
          Effect.logWarning("Failed to mirror sandbox work into the git receiver", {
            name: record.name,
            cause,
          }).pipe(Effect.as(false)),
        ),
      );

      yield* updateRecord(record.sandboxId, (current) => ({ ...current, branch }));

      // Files in the new work that host tools would act on by themselves once
      // the branch is checked out; surfaced so they get read before that.
      const riskBase =
        previousBranchHead.length > 0
          ? previousBranchHead
          : (yield* gitRun("syncToHost", record.projectCwd, ["merge-base", "HEAD", branch]).pipe(
              Effect.map((value) => value.trim()),
              Effect.orElseSucceed(() => ""),
            )) || EMPTY_TREE;
      const changedPaths = yield* gitRun("syncToHost", record.projectCwd, [
        "diff",
        "--no-ext-diff",
        "--no-textconv",
        "--no-renames",
        "--name-only",
        "-z",
        riskBase,
        branch,
      ]).pipe(Effect.orElseSucceed(() => ""));
      const hostRiskPaths = changedPaths
        .split("\0")
        .filter((changedPath) => changedPath.length > 0)
        .flatMap((changedPath) => {
          const reason = hostExecutionRisk(changedPath);
          return reason === null ? [] : [{ path: changedPath, reason }];
        });

      return {
        sandboxId: record.sandboxId,
        branch,
        commitCount,
        commitSubjects: subjects,
        mirroredToReceiver,
        hostRiskPaths,
      } satisfies SandboxSyncToHostResult;
    });

  const syncToRemote = (input: {
    readonly sandboxId: string;
    readonly remoteName?: string | undefined;
  }) =>
    Effect.gen(function* () {
      const record = yield* getRecord(input.sandboxId);
      yield* availability();
      const branch = record.branch ?? `sandbox/${record.name}`;
      const branchHead = (yield* gitRun("syncToRemote", record.projectCwd, [
        "rev-parse",
        "--verify",
        "-q",
        branch,
      ]).pipe(Effect.orElseSucceed(() => ""))).trim();
      if (branchHead.length === 0) {
        return yield* commandError(
          "syncToRemote",
          "run a host sync before pushing the sandbox branch",
        );
      }

      const remoteName = input.remoteName ?? "origin";
      const previousRemoteHead = (yield* gitRun("syncToRemote", record.projectCwd, [
        "rev-parse",
        "--verify",
        "-q",
        `${remoteName}/${branch}`,
      ]).pipe(Effect.orElseSucceed(() => ""))).trim();
      const pushedCommitCount = yield* countCommits({
        cwd: record.projectCwd,
        from: previousRemoteHead,
        to: branch,
      });

      yield* gitRun("syncToRemote", record.projectCwd, [
        "push",
        "--set-upstream",
        remoteName,
        branch,
      ]);

      return {
        sandboxId: record.sandboxId,
        branch,
        remoteName,
        pushedCommitCount,
      } satisfies SandboxSyncToRemoteResult;
    });

  // ---- receiver → remote transfer ----------------------------------------------
  // The docker git receiver holds each sandbox's `work` branch (mirrored by
  // syncToHost). It is fetched into the host checkout under
  // refs/receiver/<name>/*, previewed against the remote, optionally re-authored
  // or squashed with `git commit-tree` (the working tree is never touched), and
  // pushed from the host checkout, which is where the user's credentials live.

  /** Network-facing git: never block on an interactive credential prompt. */
  const REMOTE_GIT_ENV: NodeJS.ProcessEnv = { ...EXT_TRANSPORT_ENV, GIT_TERMINAL_PROMPT: "0" };

  const gitRunWith = (
    operation: SandboxCommandError["operation"],
    cwd: string,
    args: ReadonlyArray<string>,
    extra: { readonly env?: NodeJS.ProcessEnv; readonly stdin?: string } = {},
  ) =>
    runChecked(operation, {
      command: "git",
      args,
      cwd,
      env: { ...REMOTE_GIT_ENV, ...extra.env },
      ...(extra.stdin === undefined ? {} : { stdin: extra.stdin }),
      timeout: "10 minutes",
    });

  /** Exit code of a git command that answers with its status (0 yes / 1 no). */
  const gitTest = (cwd: string, args: ReadonlyArray<string>) =>
    runUnchecked({ command: "git", args, cwd, env: REMOTE_GIT_ENV, timeout: "2 minutes" }).pipe(
      Effect.map((result) => result?.code === 0),
    );

  const fetchReceiverWork = Effect.fn("sandbox.fetchReceiverWork")(function* (
    record: SandboxRecord,
    operation: "remotePreview" | "remotePush",
  ) {
    yield* ensureReceiver().pipe(Effect.mapError((error) => commandError(operation, error.detail)));
    const prefix = `refs/receiver/${record.name}`;
    yield* gitRunWith(operation, record.projectCwd, [
      "-c",
      "protocol.ext.allow=user",
      "fetch",
      "--force",
      "--no-tags",
      receiverGitUrl(record.name),
      `+refs/heads/*:${prefix}/*`,
    ]).pipe(
      Effect.mapError((error) =>
        commandError(
          operation,
          `could not read this sandbox's git receiver repo (run "Sync sandbox to host" first): ${error.detail}`,
        ),
      ),
    );
    const sourceSha = (yield* gitRunWith(operation, record.projectCwd, [
      "rev-parse",
      "--verify",
      "-q",
      `${prefix}/work^{commit}`,
    ]).pipe(Effect.orElseSucceed(() => ""))).trim();
    if (sourceSha.length === 0) {
      return yield* commandError(
        operation,
        'the git receiver holds no work for this sandbox yet; run "Sync sandbox to host" first',
      );
    }
    return sourceSha;
  });

  const listRemotes = Effect.fn("sandbox.listRemotes")(function* (cwd: string) {
    const names = (yield* gitRunWith("remotePreview", cwd, ["remote"]).pipe(
      Effect.orElseSucceed(() => ""),
    ))
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    const remotes: Array<{ readonly name: string; readonly url: string }> = [];
    for (const name of names) {
      const url = (yield* gitRunWith("remotePreview", cwd, [
        "remote",
        "get-url",
        "--push",
        name,
      ]).pipe(Effect.orElseSucceed(() => ""))).trim();
      // Never echo an embedded token back to the client.
      remotes.push({ name, url: url.replace(/\/\/[^@/\s]+@/, "//") });
    }
    return remotes;
  });

  const resolveTransferTarget = Effect.fn("sandbox.resolveTransferTarget")(function* (
    record: SandboxRecord,
    operation: "remotePreview" | "remotePush",
    requested: {
      readonly remoteName?: string | undefined;
      readonly targetBranch?: string | undefined;
    },
  ) {
    const remotes = yield* listRemotes(record.projectCwd);
    const remoteName =
      requested.remoteName ?? pickDefaultRemote(remotes.map((remote) => remote.name));
    if (remoteName === null) {
      return yield* commandError(operation, "the host project has no git remote configured");
    }
    if (!remotes.some((remote) => remote.name === remoteName)) {
      return yield* commandError(operation, `unknown git remote: ${remoteName}`);
    }
    const targetBranch = requested.targetBranch ?? defaultTargetBranch(record.name);
    const validBranch = yield* gitTest(record.projectCwd, [
      "check-ref-format",
      "--branch",
      targetBranch,
    ]);
    if (!validBranch) {
      return yield* commandError(operation, `not a valid branch name: ${targetBranch}`);
    }
    return { remotes, remoteName, targetBranch };
  });

  /** Current remote tip, with its objects available locally for comparisons. */
  const remoteTip = Effect.fn("sandbox.remoteTip")(function* (
    cwd: string,
    operation: "remotePreview" | "remotePush",
    remoteName: string,
    targetBranch: string,
  ) {
    const listing = yield* gitRunWith(operation, cwd, [
      "ls-remote",
      "--heads",
      remoteName,
      `refs/heads/${targetBranch}`,
    ]).pipe(
      Effect.mapError((error) =>
        commandError(operation, `could not reach remote ${remoteName}: ${error.detail}`),
      ),
    );
    const remoteSha = listing.trim().split(/\s+/)[0] ?? "";
    if (!/^[0-9a-f]{40,64}$/.test(remoteSha)) {
      return null;
    }
    const present = yield* gitTest(cwd, ["cat-file", "-e", `${remoteSha}^{commit}`]);
    if (!present) {
      yield* gitRunWith(operation, cwd, [
        "fetch",
        "--no-tags",
        remoteName,
        `refs/heads/${targetBranch}`,
      ]);
    }
    return remoteSha;
  });

  /** Everything a transfer compares; shared by preview and push so both agree. */
  const analyzeTransfer = Effect.fn("sandbox.analyzeTransfer")(function* (input: {
    readonly record: SandboxRecord;
    readonly operation: "remotePreview" | "remotePush";
    readonly sourceSha: string;
    readonly remoteName: string;
    readonly targetBranch: string;
    readonly commitLimit: number | null;
  }) {
    const cwd = input.record.projectCwd;
    const remoteSha = yield* remoteTip(cwd, input.operation, input.remoteName, input.targetBranch);
    const remoteIsAncestor =
      remoteSha === null
        ? false
        : yield* gitTest(cwd, ["merge-base", "--is-ancestor", remoteSha, input.sourceSha]);
    const relation = remoteRelation({ remoteSha, sourceSha: input.sourceSha, remoteIsAncestor });
    const rangeArgs =
      remoteSha === null
        ? [input.sourceSha, "--not", `--remotes=${input.remoteName}`]
        : [`${remoteSha}..${input.sourceSha}`];

    const total = Number.parseInt(
      (yield* gitRunWith(input.operation, cwd, ["rev-list", "--count", ...rangeArgs])).trim(),
      10,
    );
    const log = yield* gitRunWith(input.operation, cwd, [
      "log",
      "--topo-order",
      "--reverse",
      `--format=${COMMIT_LOG_FORMAT}`,
      ...(input.commitLimit === null ? [] : ["-n", String(input.commitLimit)]),
      ...rangeArgs,
    ]);
    const commits = parseCommitLog(log);
    return {
      remoteSha,
      relation,
      commits,
      totalCommits: Number.isFinite(total) ? total : commits.length,
    };
  });

  const hostIdentity = Effect.fn("sandbox.hostIdentity")(function* (cwd: string) {
    const read = (key: string) =>
      gitRunWith("remotePreview", cwd, ["config", "--get", key]).pipe(
        Effect.map((value) => value.trim()),
        Effect.orElseSucceed(() => ""),
      );
    const identity = { name: yield* read("user.name"), email: yield* read("user.email") };
    const valid =
      identity.name.length > 0 &&
      !/[<>\n]/.test(identity.name) &&
      /^[^\s<>@]+@[^\s<>@]+$/.test(identity.email);
    return valid ? (identity satisfies SandboxGitIdentity) : null;
  });

  const remotePreview = (input: SandboxRemotePreviewInput) =>
    Effect.gen(function* () {
      const record = yield* getRecord(input.sandboxId);
      yield* availability();
      const sourceSha = yield* fetchReceiverWork(record, "remotePreview");
      const target = yield* resolveTransferTarget(record, "remotePreview", input);
      const analysis = yield* analyzeTransfer({
        record,
        operation: "remotePreview",
        sourceSha,
        remoteName: target.remoteName,
        targetBranch: target.targetBranch,
        commitLimit: PREVIEW_COMMIT_LIMIT,
      });

      // What the remote branch would change by: against the current tip when
      // there is one, else against the base the new commits grow from.
      const oldest = analysis.commits[0];
      const diffBase =
        analysis.remoteSha ??
        (oldest !== undefined && oldest.parents[0] !== undefined ? oldest.parents[0] : EMPTY_TREE);
      const files =
        analysis.relation === "up-to-date"
          ? []
          : parseDiffSummary(
              yield* gitRunWith("remotePreview", record.projectCwd, [
                "diff",
                "--no-ext-diff",
                "--no-textconv",
                "--no-renames",
                "--numstat",
                "-z",
                diffBase,
                sourceSha,
              ]),
              yield* gitRunWith("remotePreview", record.projectCwd, [
                "diff",
                "--no-ext-diff",
                "--no-textconv",
                "--no-renames",
                "--name-status",
                "-z",
                diffBase,
                sourceSha,
              ]),
            );

      return {
        sandboxId: record.sandboxId,
        sourceSha,
        remotes: target.remotes,
        remoteName: target.remoteName,
        targetBranch: target.targetBranch,
        remoteSha: analysis.remoteSha,
        relation: analysis.relation,
        commits: analysis.commits.map(({ parents: _parents, ...commit }) => commit),
        commitsTruncated: analysis.totalCommits > analysis.commits.length,
        files,
        additions: files.reduce((sum, file) => sum + (file.additions ?? 0), 0),
        deletions: files.reduce((sum, file) => sum + (file.deletions ?? 0), 0),
        hostIdentity: yield* hostIdentity(record.projectCwd),
      } satisfies SandboxRemotePreviewResult;
    });

  const remotePush = (input: SandboxRemotePushInput) =>
    Effect.gen(function* () {
      const record = yield* getRecord(input.sandboxId);
      const sandbox = { sandboxId: record.sandboxId, name: record.name };
      return yield* publishReceiverWork(input).pipe(
        Effect.tap((result) =>
          recordActivity(sandbox, {
            kind: "remote-push",
            source: "user",
            ok: true,
            summary:
              `${String(result.pushedCommitCount)} commit(s) pushed` +
              (result.rewritten ? ", re-authored" : "") +
              (result.forced ? ", replaced the remote branch" : ""),
            target: `${result.remoteName}/${result.targetBranch}`,
            flags: result.forced ? ["forced"] : [],
          }),
        ),
        Effect.tapError((error) =>
          recordActivity(sandbox, {
            kind: "remote-push",
            source: "user",
            ok: false,
            summary: `Push failed: ${error.message}`,
            ...(input.remoteName === undefined
              ? {}
              : {
                  target: `${input.remoteName}/${input.targetBranch ?? "?"}`,
                }),
          }),
        ),
      );
    });

  const publishReceiverWork = (input: SandboxRemotePushInput) =>
    Effect.gen(function* () {
      const record = yield* getRecord(input.sandboxId);
      yield* availability();
      const cwd = record.projectCwd;

      const sourceSha = yield* fetchReceiverWork(record, "remotePush");
      if (sourceSha !== input.expectedSourceSha) {
        return yield* commandError(
          "remotePush",
          `the git receiver moved since the preview (now ${sourceSha.slice(0, 12)}); review the transfer again before pushing`,
        );
      }
      const target = yield* resolveTransferTarget(record, "remotePush", input);
      const analysis = yield* analyzeTransfer({
        record,
        operation: "remotePush",
        sourceSha,
        remoteName: target.remoteName,
        targetBranch: target.targetBranch,
        commitLimit: null,
      });

      const result = (pushedSha: string, pushedCommitCount: number, rewritten: boolean) =>
        ({
          sandboxId: record.sandboxId,
          remoteName: target.remoteName,
          targetBranch: target.targetBranch,
          pushedSha,
          previousRemoteSha: analysis.remoteSha,
          pushedCommitCount,
          rewritten,
          forced: analysis.relation === "diverged",
        }) satisfies SandboxRemotePushResult;

      if (analysis.relation === "up-to-date" || analysis.commits.length === 0) {
        return { ...result(analysis.remoteSha ?? sourceSha, 0, false), forced: false };
      }
      if (analysis.relation === "diverged" && input.force !== true) {
        return yield* commandError(
          "remotePush",
          `${target.remoteName}/${target.targetBranch} has commits the sandbox work does not contain; allow replacing it to force the push`,
        );
      }

      let identity: SandboxGitIdentity | null = null;
      if (input.authorMode === "host") {
        identity = yield* hostIdentity(cwd);
        if (identity === null) {
          return yield* commandError(
            "remotePush",
            "the host project has no usable git user.name / user.email; pick a custom author instead",
          );
        }
      } else if (input.authorMode === "custom") {
        if (input.author === undefined) {
          return yield* commandError("remotePush", "a custom author needs a name and an email");
        }
        identity = input.author;
      }

      const identityEnv = (who: SandboxGitIdentity, authoredAt?: string): NodeJS.ProcessEnv => ({
        GIT_AUTHOR_NAME: who.name,
        GIT_AUTHOR_EMAIL: who.email,
        ...(authoredAt === undefined ? {} : { GIT_AUTHOR_DATE: authoredAt }),
        GIT_COMMITTER_NAME: who.name,
        GIT_COMMITTER_EMAIL: who.email,
      });

      let pushedSha = sourceSha;
      let pushedCommitCount = analysis.commits.length;
      let rewritten = false;

      if (input.squash) {
        const oldest = analysis.commits[0]!;
        const newest = analysis.commits.at(-1)!;
        // On a fast-forward the squash lands on the remote tip; otherwise on the
        // base the sandbox work actually grew from.
        const parent =
          analysis.relation === "fast-forward" ? analysis.remoteSha : (oldest.parents[0] ?? null);
        const author = identity ?? { name: newest.authorName, email: newest.authorEmail };
        const baseMessage =
          input.squashMessage?.trim() || composeSquashMessage(record.name, analysis.commits);
        const message =
          identity !== null && input.coAuthorTrailer === true
            ? withCoAuthorTrailers(baseMessage, distinctAuthors(analysis.commits), identity)
            : `${baseMessage.replace(/\s+$/, "")}\n`;
        pushedSha = (yield* gitRunWith(
          "remotePush",
          cwd,
          [
            "commit-tree",
            `${sourceSha}^{tree}`,
            ...(parent === null ? [] : ["-p", parent]),
            "-F",
            "-",
          ],
          {
            env:
              identity === null
                ? { GIT_AUTHOR_NAME: author.name, GIT_AUTHOR_EMAIL: author.email }
                : identityEnv(author),
            stdin: message,
          },
        )).trim();
        pushedCommitCount = 1;
        rewritten = true;
      } else if (identity !== null) {
        const mapped = new Map<string, string>();
        for (const commit of analysis.commits) {
          const original = yield* gitRunWith("remotePush", cwd, [
            "log",
            "-1",
            "--format=%B",
            commit.sha,
          ]);
          const message =
            input.coAuthorTrailer === true
              ? withCoAuthorTrailers(
                  original,
                  [{ name: commit.authorName, email: commit.authorEmail }],
                  identity,
                )
              : original;
          const parents = rewrittenParents(commit.parents, mapped);
          const newSha = (yield* gitRunWith(
            "remotePush",
            cwd,
            [
              "commit-tree",
              `${commit.sha}^{tree}`,
              ...parents.flatMap((parent) => ["-p", parent]),
              "-F",
              "-",
            ],
            { env: identityEnv(identity, commit.authoredAt), stdin: message },
          )).trim();
          mapped.set(commit.sha, newSha);
        }
        pushedSha = mapped.get(sourceSha) ?? sourceSha;
        rewritten = true;
      }

      yield* gitRunWith("remotePush", cwd, [
        "push",
        ...(analysis.relation === "diverged" && analysis.remoteSha !== null
          ? [`--force-with-lease=refs/heads/${target.targetBranch}:${analysis.remoteSha}`]
          : []),
        target.remoteName,
        `${pushedSha}:refs/heads/${target.targetBranch}`,
      ]);
      // Traceability: the exact commit published from this sandbox.
      yield* gitRunWith("remotePush", cwd, [
        "update-ref",
        `refs/sandbox-pushed/${record.name}`,
        pushedSha,
      ]).pipe(Effect.ignore);

      return result(pushedSha, pushedCommitCount, rewritten);
    });

  const list = Effect.fn("sandbox.list")(function* () {
    const records = yield* readRecords();
    if (records.length === 0) {
      return [];
    }
    const liveNames = yield* parseSbxNames();
    const reconciled = records.map((record): SandboxRecord => {
      if (record.status === "removing") {
        return record;
      }
      const live = liveNames.has(record.name);
      if (record.status === "running" && !live) {
        return { ...record, status: "stopped", pairingUrl: null };
      }
      if (record.status === "stopped" && live) {
        return { ...record, status: "running" };
      }
      return record;
    });
    if (!reconciledMatches(reconciled, records)) {
      yield* writeRecords(reconciled);
    }
    return reconciled.map(toSandboxInfo);
  });

  // Sandboxes this app left running lose their session whenever the app exits;
  // take them back over on startup. Best effort: without Docker it just logs.
  yield* Effect.gen(function* () {
    const records = yield* readRecords();
    const running = records.filter((record) => record.status === "running");
    if (running.length === 0) return;
    const liveNames = yield* parseSbxNames();
    for (const record of running) {
      if (liveNames.has(record.name)) {
        yield* ensureKeepAlive(record.sandboxId, record.name, { bootFirst: true });
      }
    }
  }).pipe(
    Effect.catchCause((cause) =>
      Effect.logWarning("Could not resume sandbox keepalives", { cause }),
    ),
    Effect.forkDetach,
  );

  return SandboxManager.of({
    list: list(),
    create,
    createWithProgress,
    attach,
    detach,
    stop,
    remove,
    syncToHost,
    syncToRemote,
    remotePreview,
    remotePush,
    networkOverview,
    policyAddRule,
    policyRemoveRule,
    activity,
    templateList: templates.list,
    templateSave: templates.save,
    templateRemove: templates.remove,
    templateSetDefault: templates.setDefault,
    templateExport: templates.exportBundle,
    templateImport: templates.importBundle,
    templateValidate: templates.validate,
  });
});

/**
 * Fills in fields added when sandboxes moved from per-thread to per-folder
 * ownership. Records written before that change name their owning thread in
 * `threadId` and carry no template, and would otherwise be discarded as corrupt.
 */
export function migrateLegacyRecords(raw: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return raw;
  }
  if (!Array.isArray(parsed)) {
    return raw;
  }
  const migrated = parsed.map((entry) => {
    if (typeof entry !== "object" || entry === null) {
      return entry;
    }
    const record = entry as Record<string, unknown>;
    const legacyThreadId = record["threadId"];
    return {
      ...record,
      ...(record["createdByThreadId"] === undefined && typeof legacyThreadId === "string"
        ? { createdByThreadId: legacyThreadId }
        : {}),
      ...(record["threadIds"] === undefined && typeof legacyThreadId === "string"
        ? { threadIds: [legacyThreadId] }
        : {}),
      ...(record["templateId"] === undefined ? { templateId: DEFAULT_SANDBOX_TEMPLATE_ID } : {}),
      ...(record["workspaceDir"] === undefined ? { workspaceDir: null } : {}),
    };
  });
  return JSON.stringify(migrated);
}

function parseRecords(raw: string, statePath: string) {
  const empty: ReadonlyArray<SandboxRecord> = [];
  if (raw.trim().length === 0) {
    return Effect.succeed(empty);
  }
  return decodeRecords(migrateLegacyRecords(raw)).pipe(
    Effect.tapError(() =>
      Effect.logWarning("Discarding corrupt sandbox state file", { statePath }),
    ),
    Effect.orElseSucceed(() => empty),
  );
}

/**
 * The pairing link from a guest's `t3 auth pairing create` output. The guest
 * is untrusted — the agent can shadow `t3` on its PATH — and the client pairs
 * with this link automatically, so only a link to exactly the sandbox's own
 * published loopback port is accepted; anything else yields no link at all.
 */
export function pickPairingUrl(output: string, hostPort: number): string | null {
  const expectedOrigin = `http://127.0.0.1:${String(hostPort)}`;
  for (const candidate of output.match(/https?:\/\/\S+/g) ?? []) {
    let url: URL;
    try {
      url = new URL(candidate);
    } catch {
      continue;
    }
    if (url.origin === expectedOrigin && url.username === "" && url.password === "") {
      return url.href;
    }
  }
  return null;
}

function sanitizeRepoName(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "project"
  );
}

/**
 * Rows of `sbx template ls`. The runtime prints fully-qualified repositories
 * (`docker.io/docker/sandbox-templates`, `docker.io/library/t3-sandbox`;
 * short names are Docker's implicit `library/` namespace) in whitespace-padded
 * columns led by the repository, then the tag.
 */
export function sbxTemplateRows(
  listing: string,
): ReadonlyArray<{ readonly repo: string; readonly tag: string }> {
  const normalizeRepo = (repo: string) => repo.replace(/^docker\.io\/(library\/)?/, "");
  return listing.split("\n").flatMap((line) => {
    const [repo, tag] = line.trim().split(/\s+/);
    return repo !== undefined &&
      tag !== undefined &&
      repo.length > 0 &&
      tag.length > 0 &&
      repo !== "REPOSITORY"
      ? [{ repo: normalizeRepo(repo), tag }]
      : [];
  });
}

export function sbxTemplateHasTag(
  rows: ReadonlyArray<{ readonly repo: string; readonly tag: string }>,
  repo: string,
  tag: string,
): boolean {
  return rows.some((row) => row.repo === repo && row.tag === tag);
}

/** Reconciliation only ever rewrites status and pairingUrl, so those decide the write. */
function reconciledMatches(
  reconciled: ReadonlyArray<SandboxRecord>,
  records: ReadonlyArray<SandboxRecord>,
): boolean {
  return reconciled.every((record, index) => {
    const previous = records[index];
    return (
      previous !== undefined &&
      record.status === previous.status &&
      record.pairingUrl === previous.pairingUrl
    );
  });
}

export const layer = Layer.effect(SandboxManager, make()).pipe(
  Layer.provide(ProcessRunner.layer),
  Layer.provide(SandboxTemplatesModule.layer),
  Layer.provide(FetchHttpClient.layer),
);

/**
 * The guest's `upstream` URL for a host project, from `git remote -v`: the
 * host's primary remote reduced to its repository identity
 * (`github.com/owner/repo`) and written as a plain https URL. Only the
 * identity crosses into the sandbox, never the host's URL itself, so
 * credentials or local paths in a remote cannot leak. Null when the host has
 * no remote that names a hosted repository.
 */
export function guestUpstreamUrl(remoteVerbose: string): string | null {
  const remote = pickPrimaryRemote(parseRemoteFetchUrls(remoteVerbose));
  if (remote === null) return null;
  const key = normalizeGitRemoteUrl(remote.remoteUrl);
  return HOSTED_REPOSITORY_KEY.test(key) ? `https://${key}.git` : null;
}

/** `host.tld/owner/repo[/...]`: a dotted host and at least two path segments. */
const HOSTED_REPOSITORY_KEY =
  /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+(?:\/[a-z0-9._~-]+){2,}$/;
