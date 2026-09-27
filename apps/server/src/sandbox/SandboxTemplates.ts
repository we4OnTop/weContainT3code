/**
 * Sandbox template store.
 *
 * A template is a folder bundle: `template.json` (the manifest), an optional
 * hand-written `Dockerfile`, and any extra files the image build copies in.
 * Built-in templates live in code rather than on disk so they cannot be
 * corrupted and always track the app; everything else lives under
 * `<baseDir>/sandboxes/templates/<id>/`.
 *
 * Import and export move a bundle as a gzipped tarball. Import is the only
 * path that accepts foreign paths, so it is also the only place that has to be
 * paranoid: entries are rejected unless they are plain files on a relative,
 * non-escaping path, and both the entry count and the total size are capped.
 */

import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as FileSystem from "effect/FileSystem";
import * as Layer from "effect/Layer";
import * as Path from "effect/Path";
import * as Schema from "effect/Schema";
import * as NodeCrypto from "node:crypto";
import * as NodeStream from "node:stream";
import * as NodeZlib from "node:zlib";
import { Parser as TarParser, type ReadEntry as TarReadEntry } from "tar";

import {
  BUILTIN_SANDBOX_TEMPLATE_IDS,
  DEFAULT_SANDBOX_TEMPLATE_ID,
  SANDBOX_CLI_IDS,
  SandboxCommandError,
  SandboxTemplate,
  SandboxTemplateInvalidError,
  SandboxTemplateManifest,
  SandboxTemplateNotFoundError,
  SandboxTemplateReadOnlyError,
  type SandboxTemplateIssue,
  type SandboxTemplateListResult,
  type SandboxTemplateSaveInput,
  type SandboxTemplateValidateResult,
} from "@t3tools/contracts";

import * as ServerConfigModule from "../config.ts";
import {
  SANDBOX_DEFAULT_BASE_IMAGE,
  SANDBOX_DOCKER_BASE_IMAGE,
  guestBuildFiles,
  renderDockerfile,
  renderStartScript,
  templateFeatures,
} from "./image.ts";

const MANIFEST_FILE = "template.json";
const DOCKERFILE_FILE = "Dockerfile";
const START_SCRIPT_FILE = "start-t3";
const SETTINGS_FILE = "sandbox-templates.json";

/** Import guards. Bundles are hand-authored config, not payloads. */
const MAX_BUNDLE_ENTRIES = 64;
const MAX_BUNDLE_BYTES = 4 * 1024 * 1024;
const MAX_ENTRY_BYTES = 1024 * 1024;

export type SandboxTemplateError =
  | SandboxTemplateNotFoundError
  | SandboxTemplateInvalidError
  | SandboxTemplateReadOnlyError
  | SandboxCommandError;

/** A template plus everything needed to build an image from it. */
export interface ResolvedSandboxTemplate {
  readonly template: SandboxTemplate;
  /** Extra bundle files, keyed by their bundle-relative path. */
  readonly files: ReadonlyMap<string, Uint8Array>;
  /** Stable hash of the effective build inputs; feeds the image tag. */
  readonly contentHash: string;
}

export class SandboxTemplates extends Context.Service<
  SandboxTemplates,
  {
    readonly list: Effect.Effect<SandboxTemplateListResult, SandboxTemplateError>;
    readonly get: (
      templateId: string,
    ) => Effect.Effect<ResolvedSandboxTemplate, SandboxTemplateError>;
    readonly save: (
      input: SandboxTemplateSaveInput,
    ) => Effect.Effect<SandboxTemplate, SandboxTemplateError>;
    readonly remove: (
      templateId: string,
    ) => Effect.Effect<
      { readonly templateId: string; readonly defaultTemplateId: string },
      SandboxTemplateError
    >;
    readonly setDefault: (
      templateId: string,
    ) => Effect.Effect<{ readonly defaultTemplateId: string }, SandboxTemplateError>;
    readonly exportBundle: (
      templateId: string,
    ) => Effect.Effect<
      { readonly templateId: string; readonly fileName: string; readonly contentBase64: string },
      SandboxTemplateError
    >;
    readonly importBundle: (input: {
      readonly fileName: string;
      readonly contentBase64: string;
      readonly overwrite?: boolean | undefined;
    }) => Effect.Effect<SandboxTemplate, SandboxTemplateError>;
    readonly validate: (
      input: SandboxTemplateSaveInput,
    ) => Effect.Effect<SandboxTemplateValidateResult, never>;
    /** Writes the build context (Dockerfile, entrypoint, extra files) into `buildDir`. */
    readonly materialize: (input: {
      readonly template: ResolvedSandboxTemplate;
      readonly buildDir: string;
    }) => Effect.Effect<void, SandboxTemplateError>;
  }
>()("t3/sandbox/SandboxTemplates") {}

const BUILTIN_MANIFESTS: ReadonlyArray<SandboxTemplateManifest> = [
  {
    id: "plain",
    name: "Plain",
    description:
      "Every provider CLI T3 Code supports, a version-matched t3 server, and nothing else. Fastest to build.",
    baseImage: SANDBOX_DEFAULT_BASE_IMAGE,
    clis: SANDBOX_CLI_IDS,
    gortex: false,
    env: {},
    setupCommands: [],
  },
  {
    id: "gortex",
    name: "Gortex",
    description:
      "The plain sandbox plus the gortex code-intelligence daemon, tracking the workspace.",
    baseImage: SANDBOX_DEFAULT_BASE_IMAGE,
    clis: SANDBOX_CLI_IDS,
    gortex: true,
    env: {},
    setupCommands: [],
  },
  {
    id: "wecontain",
    name: "weContain",
    description:
      "The gortex sandbox plus weContain's agent tooling: a private dockerd, dreamfeed repo-change feed, lateral goal loops, openspec, the headroom and serena MCP servers, and a command log streamed to the host. The agent has no sudo.",
    baseImage: SANDBOX_DOCKER_BASE_IMAGE,
    clis: SANDBOX_CLI_IDS,
    gortex: true,
    env: {},
    setupCommands: [],
    docker: true,
    dreamfeed: true,
    lateral: true,
    openspec: true,
    headroom: true,
    serena: true,
    commandLog: true,
    sudo: false,
  },
];

const isBuiltin = (templateId: string): boolean =>
  (BUILTIN_SANDBOX_TEMPLATE_IDS as ReadonlyArray<string>).includes(templateId);

const ManifestJson = Schema.fromJsonString(SandboxTemplateManifest);
const decodeManifestJson = Schema.decodeUnknownEffect(ManifestJson);
const encodeManifestJson = Schema.encodeEffect(ManifestJson);

const SettingsJson = Schema.fromJsonString(Schema.Struct({ defaultTemplateId: Schema.String }));
const decodeSettings = Schema.decodeUnknownEffect(SettingsJson);
const encodeSettings = Schema.encodeEffect(SettingsJson);

const templateError = (detail: string) =>
  new SandboxCommandError({ operation: "template", detail });

const ENV_KEY_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Semantic checks on top of schema decoding. Errors block a save; warnings are
 * surfaced in the editor but do not.
 */
export function collectTemplateIssues(input: {
  readonly manifest: SandboxTemplateManifest;
  readonly dockerfile: string | undefined;
}): ReadonlyArray<SandboxTemplateIssue> {
  const issues: SandboxTemplateIssue[] = [];
  const error = (field: string | null, message: string) =>
    issues.push({ severity: "error", field, message });
  const warn = (field: string | null, message: string) =>
    issues.push({ severity: "warning", field, message });

  const { manifest } = input;

  if (/\s/.test(manifest.baseImage)) {
    error("baseImage", "Base image must not contain whitespace.");
  }
  if (manifest.baseImage.length > 0 && !/^[a-zA-Z0-9._:/@-]+$/.test(manifest.baseImage)) {
    error("baseImage", "Base image contains characters Docker will not accept.");
  }
  if (!manifest.baseImage.includes("@sha256:") && !manifest.baseImage.includes(":")) {
    warn("baseImage", "Base image has no tag or digest; builds will drift with the upstream tag.");
  }

  if (manifest.clis.length === 0) {
    warn("clis", "No provider CLI is installed; agents cannot run in this sandbox.");
  }
  const seenClis = new Set<string>();
  for (const cli of manifest.clis) {
    if (seenClis.has(cli)) {
      error("clis", `Duplicate CLI: ${cli}.`);
    }
    seenClis.add(cli);
  }

  for (const key of Object.keys(manifest.env)) {
    if (!ENV_KEY_PATTERN.test(key)) {
      error("env", `Invalid environment variable name: ${key}.`);
    }
  }

  manifest.setupCommands.forEach((command, index) => {
    if (command.trim().length === 0) {
      error("setupCommands", `Setup command ${index + 1} is empty.`);
    }
    if (command.includes("\n")) {
      error("setupCommands", `Setup command ${index + 1} spans multiple lines; use one per entry.`);
    }
  });

  const features = templateFeatures(manifest);
  if (features.docker && !manifest.baseImage.includes("-docker")) {
    warn(
      "docker",
      "Docker inside the sandbox needs a `*-docker` base image (docker/sandbox-templates:claude-code-docker); this base likely ships no dockerd.",
    );
  }
  if (!features.sudo && features.docker) {
    warn(
      "sudo",
      "The agent can still reach the in-sandbox dockerd, and docker access is root-equivalent inside the sandbox; turn docker off for a sandbox without root.",
    );
  }
  if (!manifest.gortex && manifest.gortexExclude !== undefined) {
    warn("gortexExclude", "gortex is off, so the exclude list has no effect.");
  }
  for (const pattern of manifest.gortexExclude ?? []) {
    if (pattern.trim().length === 0 || /[\n\r]/.test(pattern)) {
      error("gortexExclude", "gortex exclude patterns must be single, non-empty lines.");
    }
  }

  const dockerfile = input.dockerfile;
  if (dockerfile !== undefined) {
    if (!/^\s*FROM\s+/mu.test(dockerfile)) {
      error("dockerfile", "Dockerfile has no FROM instruction.");
    }
    if (!dockerfile.includes(START_SCRIPT_FILE)) {
      error(
        "dockerfile",
        `Dockerfile must COPY ${START_SCRIPT_FILE} into the image; the sandbox boots through it.`,
      );
    }
    if (!dockerfile.includes("T3_VERSION")) {
      warn(
        "dockerfile",
        "Dockerfile never uses T3_VERSION, so the guest t3 server may not match this app.",
      );
    }
  }

  return issues;
}

const hashContent = (parts: ReadonlyArray<string | Uint8Array>): string => {
  const hash = NodeCrypto.createHash("sha256");
  for (const part of parts) {
    hash.update(typeof part === "string" ? part : Buffer.from(part));
  }
  return hash.digest("hex");
};

/** Rejects absolute paths, drive letters, and any `..` traversal. */
export function isSafeBundlePath(entryPath: string): boolean {
  if (entryPath.length === 0 || entryPath.length > 200) return false;
  if (entryPath.startsWith("/") || entryPath.startsWith("\\")) return false;
  if (/^[a-zA-Z]:/.test(entryPath)) return false;
  const segments = entryPath.split(/[/\\]/u);
  return segments.every((segment) => segment.length > 0 && segment !== "." && segment !== "..");
}

export const make = Effect.fn("SandboxTemplates.make")(function* () {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const config = yield* ServerConfigModule.ServerConfig;

  const templatesDir = path.join(config.baseDir, "sandboxes", "templates");
  const settingsPath = path.join(config.stateDir, SETTINGS_FILE);

  const templateDir = (templateId: string) => path.join(templatesDir, templateId);

  const readDefaultTemplateId = Effect.fn("sandboxTemplates.readDefault")(function* () {
    const raw = yield* fs.readFileString(settingsPath).pipe(Effect.orElseSucceed(() => ""));
    if (raw.trim().length === 0) {
      return DEFAULT_SANDBOX_TEMPLATE_ID;
    }
    const settings = yield* decodeSettings(raw).pipe(
      Effect.orElseSucceed(() => ({ defaultTemplateId: DEFAULT_SANDBOX_TEMPLATE_ID })),
    );
    return settings.defaultTemplateId;
  });

  const writeDefaultTemplateId = Effect.fn("sandboxTemplates.writeDefault")(function* (
    defaultTemplateId: string,
  ) {
    yield* fs.makeDirectory(path.dirname(settingsPath), { recursive: true }).pipe(Effect.orDie);
    const json = yield* encodeSettings({ defaultTemplateId }).pipe(
      Effect.mapError(() => templateError("failed to encode template settings")),
    );
    yield* fs
      .writeFileString(settingsPath, json)
      .pipe(Effect.mapError(() => templateError("failed to persist template settings")));
  });

  const builtinResolved = (manifest: SandboxTemplateManifest): ResolvedSandboxTemplate => {
    const dockerfile = renderDockerfile(manifest);
    const startScript = renderStartScript(manifest);
    return {
      template: {
        manifest,
        builtin: true,
        dockerfile,
        customDockerfile: false,
        files: [],
        updatedAt: "",
      },
      files: new Map(),
      contentHash: hashContent([dockerfile, startScript, ...guestBuildFiles(manifest).values()]),
    };
  };

  /** Reads one on-disk bundle. Returns null when the folder is not a template. */
  const readStoredTemplate = Effect.fn("sandboxTemplates.readStored")(function* (
    templateId: string,
  ) {
    const dir = templateDir(templateId);
    const manifestPath = path.join(dir, MANIFEST_FILE);
    const raw = yield* fs.readFileString(manifestPath).pipe(Effect.orElseSucceed(() => ""));
    if (raw.trim().length === 0) {
      return null;
    }
    const manifest = yield* decodeManifestJson(raw).pipe(Effect.orElseSucceed(() => null));
    if (manifest === null) {
      return null;
    }

    const storedDockerfile = yield* fs
      .readFileString(path.join(dir, DOCKERFILE_FILE))
      .pipe(Effect.orElseSucceed(() => null));
    const customDockerfile = storedDockerfile !== null && storedDockerfile.trim().length > 0;
    const dockerfile = customDockerfile ? storedDockerfile : renderDockerfile(manifest);
    const startScript = renderStartScript(manifest);

    const entries = yield* fs.readDirectory(dir).pipe(Effect.orElseSucceed(() => []));
    const files = new Map<string, Uint8Array>();
    for (const entry of entries) {
      if (entry === MANIFEST_FILE || entry === DOCKERFILE_FILE) continue;
      const stat = yield* fs.stat(path.join(dir, entry)).pipe(Effect.orElseSucceed(() => null));
      if (stat === null || stat.type !== "File") continue;
      const bytes = yield* fs
        .readFile(path.join(dir, entry))
        .pipe(Effect.orElseSucceed(() => null));
      if (bytes === null) continue;
      files.set(entry, bytes);
    }

    const stat = yield* fs.stat(manifestPath).pipe(Effect.orElseSucceed(() => null));
    const updatedAt =
      stat?.mtime !== undefined && stat.mtime._tag === "Some" ? stat.mtime.value.toISOString() : "";

    const resolved: ResolvedSandboxTemplate = {
      template: {
        manifest,
        builtin: false,
        dockerfile,
        customDockerfile,
        files: [...files.entries()].map(([filePath, bytes]) => ({
          path: filePath,
          byteLength: bytes.byteLength,
        })),
        updatedAt,
      },
      files,
      contentHash: hashContent([
        dockerfile,
        startScript,
        ...guestBuildFiles(manifest).values(),
        ...files.values(),
      ]),
    };
    return resolved;
  });

  const listStored = Effect.fn("sandboxTemplates.listStored")(function* () {
    const entries = yield* fs.readDirectory(templatesDir).pipe(Effect.orElseSucceed(() => []));
    const stored: ResolvedSandboxTemplate[] = [];
    for (const entry of entries) {
      if (isBuiltin(entry)) continue;
      const stat = yield* fs
        .stat(path.join(templatesDir, entry))
        .pipe(Effect.orElseSucceed(() => null));
      if (stat === null || stat.type !== "Directory") continue;
      const resolved = yield* readStoredTemplate(entry);
      if (resolved !== null) {
        stored.push(resolved);
      }
    }
    return stored;
  });

  const list = Effect.gen(function* () {
    const stored = yield* listStored();
    const defaultTemplateId = yield* readDefaultTemplateId();
    const templates = [
      ...BUILTIN_MANIFESTS.map((manifest) => builtinResolved(manifest).template),
      ...stored.map((entry) => entry.template),
    ];
    // A deleted default silently falls back rather than breaking every create.
    const known = new Set(templates.map((template) => template.manifest.id));
    return {
      templates,
      defaultTemplateId: known.has(defaultTemplateId)
        ? defaultTemplateId
        : DEFAULT_SANDBOX_TEMPLATE_ID,
    } satisfies SandboxTemplateListResult;
  });

  const get = Effect.fn("sandboxTemplates.get")(function* (templateId: string) {
    const builtin = BUILTIN_MANIFESTS.find((manifest) => manifest.id === templateId);
    if (builtin !== undefined) {
      return builtinResolved(builtin);
    }
    const stored = yield* readStoredTemplate(templateId);
    if (stored === null) {
      return yield* new SandboxTemplateNotFoundError({ templateId });
    }
    return stored;
  });

  const validate = (input: SandboxTemplateSaveInput) =>
    Effect.sync(() => {
      const issues = collectTemplateIssues({
        manifest: input.manifest,
        dockerfile: input.dockerfile,
      });
      return {
        valid: issues.every((issue) => issue.severity !== "error"),
        issues,
      } satisfies SandboxTemplateValidateResult;
    });

  const writeBundle = Effect.fn("sandboxTemplates.writeBundle")(function* (input: {
    readonly manifest: SandboxTemplateManifest;
    readonly dockerfile: string | undefined;
    readonly files: ReadonlyMap<string, Uint8Array>;
  }) {
    const issues = collectTemplateIssues({
      manifest: input.manifest,
      dockerfile: input.dockerfile,
    });
    if (issues.some((issue) => issue.severity === "error")) {
      return yield* new SandboxTemplateInvalidError({ templateId: input.manifest.id, issues });
    }

    const dir = templateDir(input.manifest.id);
    yield* fs.makeDirectory(dir, { recursive: true }).pipe(Effect.orDie);

    const manifestJson = yield* encodeManifestJson(input.manifest).pipe(
      Effect.mapError(() => templateError("failed to encode template manifest")),
    );
    yield* fs
      .writeFileString(path.join(dir, MANIFEST_FILE), `${manifestJson}\n`)
      .pipe(Effect.mapError(() => templateError("failed to write template manifest")));

    if (input.dockerfile === undefined) {
      yield* fs.remove(path.join(dir, DOCKERFILE_FILE), { force: true }).pipe(Effect.ignore);
    } else {
      yield* fs
        .writeFileString(path.join(dir, DOCKERFILE_FILE), input.dockerfile)
        .pipe(Effect.mapError(() => templateError("failed to write template Dockerfile")));
    }

    for (const [filePath, bytes] of input.files) {
      const target = path.join(dir, filePath);
      yield* fs.makeDirectory(path.dirname(target), { recursive: true }).pipe(Effect.orDie);
      yield* fs
        .writeFile(target, bytes)
        .pipe(Effect.mapError(() => templateError(`failed to write template file ${filePath}`)));
    }

    const resolved = yield* readStoredTemplate(input.manifest.id);
    if (resolved === null) {
      return yield* templateError("template disappeared immediately after being written");
    }
    return resolved.template;
  });

  const save = Effect.fn("sandboxTemplates.save")(function* (input: SandboxTemplateSaveInput) {
    if (isBuiltin(input.manifest.id)) {
      return yield* new SandboxTemplateReadOnlyError({ templateId: input.manifest.id });
    }
    const existing = yield* readStoredTemplate(input.manifest.id);
    return yield* writeBundle({
      manifest: input.manifest,
      dockerfile: input.dockerfile,
      files: existing?.files ?? new Map(),
    });
  });

  const remove = Effect.fn("sandboxTemplates.remove")(function* (templateId: string) {
    if (isBuiltin(templateId)) {
      return yield* new SandboxTemplateReadOnlyError({ templateId });
    }
    const existing = yield* readStoredTemplate(templateId);
    if (existing === null) {
      return yield* new SandboxTemplateNotFoundError({ templateId });
    }
    yield* fs
      .remove(templateDir(templateId), { recursive: true, force: true })
      .pipe(Effect.mapError(() => templateError(`failed to delete template ${templateId}`)));

    let defaultTemplateId = yield* readDefaultTemplateId();
    if (defaultTemplateId === templateId) {
      defaultTemplateId = DEFAULT_SANDBOX_TEMPLATE_ID;
      yield* writeDefaultTemplateId(defaultTemplateId);
    }
    return { templateId, defaultTemplateId };
  });

  const setDefault = Effect.fn("sandboxTemplates.setDefault")(function* (templateId: string) {
    yield* get(templateId);
    yield* writeDefaultTemplateId(templateId);
    return { defaultTemplateId: templateId };
  });

  const exportBundle = Effect.fn("sandboxTemplates.export")(function* (templateId: string) {
    const resolved = yield* get(templateId);
    const manifestJson = yield* encodeManifestJson(resolved.template.manifest).pipe(
      Effect.mapError(() => templateError("failed to encode template manifest")),
    );

    // Built-in bundles exist only in memory, so the export is rendered on the
    // fly — that is also what makes a builtin a usable starting point for a
    // custom template.
    const entries = new Map<string, Uint8Array>([
      [MANIFEST_FILE, Buffer.from(`${manifestJson}\n`, "utf8")],
      ...resolved.files,
    ]);
    if (resolved.template.customDockerfile || resolved.template.builtin) {
      entries.set(DOCKERFILE_FILE, Buffer.from(resolved.template.dockerfile, "utf8"));
    }

    const archive = yield* Effect.try({
      try: () => createTarball(entries),
      catch: (cause) => templateError(`failed to pack template bundle: ${String(cause)}`),
    });

    return {
      templateId,
      fileName: `${templateId}.t3sandbox.tgz`,
      contentBase64: Buffer.from(archive).toString("base64"),
    };
  });

  const importBundle = Effect.fn("sandboxTemplates.import")(function* (input: {
    readonly fileName: string;
    readonly contentBase64: string;
    readonly overwrite?: boolean | undefined;
  }) {
    const archive = Buffer.from(input.contentBase64, "base64");
    if (archive.byteLength === 0) {
      return yield* templateError("the imported bundle is empty");
    }
    if (archive.byteLength > MAX_BUNDLE_BYTES) {
      return yield* templateError(
        `the imported bundle is larger than ${String(MAX_BUNDLE_BYTES / 1024 / 1024)} MB`,
      );
    }

    const entries = yield* Effect.tryPromise({
      try: () => readTarball(archive),
      catch: (cause) => templateError(`failed to read template bundle: ${String(cause)}`),
    });

    const manifestBytes = entries.get(MANIFEST_FILE);
    if (manifestBytes === undefined) {
      return yield* templateError(`the bundle has no ${MANIFEST_FILE} at its root`);
    }

    const manifestRaw = Buffer.from(manifestBytes).toString("utf8");
    const manifest = yield* decodeManifestJson(manifestRaw).pipe(
      Effect.mapError(
        (cause) =>
          new SandboxTemplateInvalidError({
            templateId: input.fileName,
            issues: [
              {
                severity: "error",
                field: null,
                message: `${MANIFEST_FILE} is not a valid template manifest: ${cause.message}`,
              },
            ],
          }),
      ),
    );

    if (isBuiltin(manifest.id)) {
      return yield* new SandboxTemplateReadOnlyError({ templateId: manifest.id });
    }
    if (input.overwrite !== true) {
      const existing = yield* readStoredTemplate(manifest.id);
      if (existing !== null) {
        return yield* templateError(
          `a template with id ${manifest.id} already exists; re-import with overwrite to replace it`,
        );
      }
    }

    const dockerfileBytes = entries.get(DOCKERFILE_FILE);
    const dockerfile =
      dockerfileBytes === undefined ? undefined : Buffer.from(dockerfileBytes).toString("utf8");

    const extraFiles = new Map<string, Uint8Array>();
    for (const [entryPath, bytes] of entries) {
      if (entryPath === MANIFEST_FILE || entryPath === DOCKERFILE_FILE) continue;
      extraFiles.set(entryPath, bytes);
    }

    return yield* writeBundle({ manifest, dockerfile, files: extraFiles });
  });

  const materialize = Effect.fn("sandboxTemplates.materialize")(function* (input: {
    readonly template: ResolvedSandboxTemplate;
    readonly buildDir: string;
  }) {
    yield* fs.makeDirectory(input.buildDir, { recursive: true }).pipe(Effect.orDie);
    yield* fs
      .writeFileString(
        path.join(input.buildDir, DOCKERFILE_FILE),
        input.template.template.dockerfile,
      )
      .pipe(Effect.mapError(() => templateError("failed to stage the template Dockerfile")));
    yield* fs
      .writeFileString(
        path.join(input.buildDir, START_SCRIPT_FILE),
        renderStartScript(input.template.template.manifest),
      )
      .pipe(Effect.mapError(() => templateError("failed to stage the sandbox entrypoint")));
    // Guest services first, so a bundle file of the same name deliberately
    // overrides the one T3 Code ships.
    const staged = new Map([
      ...guestBuildFiles(input.template.template.manifest),
      ...input.template.files,
    ]);
    for (const [filePath, bytes] of staged) {
      const target = path.join(input.buildDir, filePath);
      yield* fs.makeDirectory(path.dirname(target), { recursive: true }).pipe(Effect.orDie);
      yield* fs
        .writeFile(target, bytes)
        .pipe(Effect.mapError(() => templateError(`failed to stage template file ${filePath}`)));
    }
  });

  // Seeding the default only when nothing is configured keeps an explicit
  // choice sticky across restarts and upgrades.
  const configuredDefault = yield* readDefaultTemplateId().pipe(
    Effect.orElseSucceed(() => DEFAULT_SANDBOX_TEMPLATE_ID),
  );
  yield* Effect.logDebug("Sandbox templates ready", {
    templatesDir,
    defaultTemplateId: configuredDefault,
  });

  return {
    list,
    get,
    save,
    remove,
    setDefault,
    exportBundle,
    importBundle,
    validate,
    materialize,
  } as const;
});

const TAR_BLOCK_SIZE = 512;

/** Writes one ustar header block for a regular file. */
function tarHeaderBlock(entryPath: string, size: number): Buffer {
  const block = Buffer.alloc(TAR_BLOCK_SIZE);
  const writeString = (value: string, offset: number, length: number) => {
    block.write(value, offset, length - 1, "utf8");
  };
  // Octal, NUL-terminated, zero-padded — the classic tar number encoding.
  const writeOctal = (value: number, offset: number, length: number) => {
    block.write(value.toString(8).padStart(length - 1, "0"), offset, length - 1, "ascii");
  };

  writeString(entryPath, 0, 100);
  writeOctal(0o644, 100, 8);
  writeOctal(0, 108, 8);
  writeOctal(0, 116, 8);
  writeOctal(size, 124, 12);
  writeOctal(0, 136, 12);
  block.write("        ", 148, 8, "ascii"); // checksum placeholder
  block.write("0", 156, 1, "ascii"); // regular file
  block.write("ustar\0", 257, 6, "ascii");
  block.write("00", 263, 2, "ascii");

  let checksum = 0;
  for (const byte of block) {
    checksum += byte;
  }
  block.write(`${checksum.toString(8).padStart(6, "0")}\0 `, 148, 8, "ascii");
  return block;
}

/**
 * Packs bundle entries into a gzipped tarball, in memory. The input is always
 * our own manifest and files, so a minimal ustar writer is enough — node-tar's
 * Pack only streams from real filesystem paths.
 */
export function createTarball(entries: ReadonlyMap<string, Uint8Array>): Uint8Array {
  const blocks: Buffer[] = [];
  for (const [entryPath, bytes] of entries) {
    if (Buffer.byteLength(entryPath, "utf8") > 99) {
      throw new Error(`template file path is too long for a tar entry: ${entryPath}`);
    }
    blocks.push(tarHeaderBlock(entryPath, bytes.byteLength));
    blocks.push(Buffer.from(bytes));
    const remainder = bytes.byteLength % TAR_BLOCK_SIZE;
    if (remainder !== 0) {
      blocks.push(Buffer.alloc(TAR_BLOCK_SIZE - remainder));
    }
  }
  // Two zero blocks terminate the archive.
  blocks.push(Buffer.alloc(TAR_BLOCK_SIZE * 2));
  return NodeZlib.gzipSync(Buffer.concat(blocks));
}

/**
 * Reads a gzipped tarball into flat entries. Anything that is not a plain file
 * on a safe relative path is dropped rather than trusted.
 */
export async function readTarball(archive: Uint8Array): Promise<Map<string, Uint8Array>> {
  const entries = new Map<string, Uint8Array>();
  let totalBytes = 0;

  const parser = new TarParser({
    strict: true,
    filter: (entryPath: string) => isSafeBundlePath(entryPath),
  });

  const done = new Promise<void>((resolve, reject) => {
    parser.on("entry", (entry: TarReadEntry) => {
      if (entry.type !== "File") {
        entry.resume();
        return;
      }
      if (entries.size >= MAX_BUNDLE_ENTRIES) {
        parser.abort(new Error(`bundles are limited to ${String(MAX_BUNDLE_ENTRIES)} files`));
        entry.resume();
        return;
      }
      const chunks: Buffer[] = [];
      let entryBytes = 0;
      entry.on("data", (chunk: Buffer) => {
        entryBytes += chunk.byteLength;
        totalBytes += chunk.byteLength;
        if (entryBytes > MAX_ENTRY_BYTES || totalBytes > MAX_BUNDLE_BYTES) {
          parser.abort(new Error("the bundle expands to more than the allowed size"));
          return;
        }
        chunks.push(chunk);
      });
      entry.on("end", () => {
        entries.set(entry.path.replaceAll("\\", "/"), Buffer.concat(chunks));
      });
    });
    parser.on("error", reject);
    parser.on("end", () => resolve());
  });

  NodeStream.Readable.from([Buffer.from(archive)]).pipe(parser as unknown as NodeStream.Writable);
  await done;
  return entries;
}

export const layer = Layer.effect(SandboxTemplates, make());
