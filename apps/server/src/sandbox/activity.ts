/**
 * Pure readers for what the host channel sends (see guestChannel.ts) and the
 * rules that flag logged commands worth a look.
 *
 * Everything after a channel keyword is written from inside the sandbox, so it
 * is sanitized, size-capped and only ever stored and displayed as data.
 */

import type { SandboxCommandRecord } from "@t3tools/contracts";

import { SYNC_REQUEST_ID_PATTERN } from "./guestChannel.ts";

const MAX_LINE = 8192;
const MAX_CMDLINE = 4000;
const MAX_CWD = 1024;

/** Drops terminal control sequences and other control characters (keeps tabs). */
export const sanitizeGuestText = (value: string, max: number) =>
  // oxlint-disable-next-line no-control-regex -- stripping control characters is the point
  value.replace(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/g, "").slice(0, max);

export type ChannelMessage =
  | {
      readonly type: "hello";
      readonly version: number;
      readonly sudo: boolean;
      readonly commandLog: boolean;
    }
  | { readonly type: "sync"; readonly requestId: string }
  | { readonly type: "command"; readonly command: SandboxCommandRecord }
  | { readonly type: "tamper"; readonly state: ReadonlyArray<string> }
  | { readonly type: "unknown" };

export function parseChannelLine(raw: string): ChannelMessage {
  const line = raw.length > MAX_LINE ? raw.slice(0, MAX_LINE) : raw;
  const space = line.indexOf(" ");
  const keyword = space === -1 ? line : line.slice(0, space);
  const rest = space === -1 ? "" : line.slice(space + 1);
  switch (keyword) {
    case "T3CHANNEL": {
      const [version, ...fields] = rest.split(" ");
      const flag = (name: string) => fields.includes(`${name}=1`);
      return {
        type: "hello",
        version: Number(version) || 0,
        sudo: flag("sudo"),
        commandLog: flag("commandLog"),
      };
    }
    case "SYNC": {
      const requestId = rest.trim();
      return SYNC_REQUEST_ID_PATTERN.test(requestId)
        ? { type: "sync", requestId }
        : { type: "unknown" };
    }
    case "CMD": {
      const command = parseSnoopyLine(rest);
      return command === null ? { type: "unknown" } : { type: "command", command };
    }
    case "TAMPER": {
      const state = rest
        .split(" ")
        .map((entry) => entry.trim())
        .filter((entry) => /^[a-z-]{1,40}$/.test(entry) && entry !== "none");
      return { type: "tamper", state };
    }
    default:
      return { type: "unknown" };
  }
}

/** `uid|pid|ppid|cwd|cmdline`, as configured in SNOOPY_INI. */
export function parseSnoopyLine(line: string): SandboxCommandRecord | null {
  const parts = line.split("|");
  if (parts.length < 5) return null;
  const [uid, pid, ppid, cwd, ...cmd] = parts;
  const toInt = (value: string | undefined) =>
    value !== undefined && /^[0-9]{1,10}$/.test(value) ? Number(value) : null;
  const uidValue = toInt(uid);
  const pidValue = toInt(pid);
  const ppidValue = toInt(ppid);
  if (uidValue === null || pidValue === null || ppidValue === null) return null;
  const cmdline = sanitizeGuestText(cmd.join("|"), MAX_CMDLINE);
  if (cmdline.trim().length === 0) return null;
  return {
    uid: uidValue,
    pid: pidValue,
    ppid: ppidValue,
    cwd: sanitizeGuestText(cwd ?? "", MAX_CWD),
    cmdline,
  };
}

interface CommandRule {
  readonly flag: string;
  readonly test: (cmdline: string, program: string) => boolean;
}

const COMMAND_RULES: ReadonlyArray<CommandRule> = [
  {
    flag: "privilege",
    test: (cmd, program) =>
      ["sudo", "su", "doas", "pkexec"].includes(program) || / sudo /.test(cmd),
  },
  {
    flag: "log-tamper",
    test: (cmd) => /ld\.so\.preload|snoopy|\/var\/log\/t3|t3-channel|\/etc\/t3\//.test(cmd),
  },
  {
    flag: "download-exec",
    test: (cmd) => /\b(curl|wget)\b[^|]*\|\s*(sudo\s+)?(ba|z|da|k)?sh\b/.test(cmd),
  },
  {
    flag: "decode-exec",
    test: (cmd) => /base64\s+(-d|--decode)[^|]*\|\s*(ba|z|da)?sh\b/.test(cmd),
  },
  {
    flag: "network-tool",
    test: (_cmd, program) =>
      ["nc", "ncat", "netcat", "socat", "ssh", "scp", "sftp", "telnet", "nmap", "ftp"].includes(
        program,
      ),
  },
  {
    flag: "credentials",
    test: (cmd, program) =>
      ["env", "printenv"].includes(program) ||
      /\.credentials|\.git-credentials|\.ssh\/|\.config\/gh\b|\/proc\/[0-9a-z]+\/environ|\.netrc|\.npmrc/.test(
        cmd,
      ),
  },
  {
    flag: "persistence",
    test: (cmd, program) =>
      ["crontab", "systemctl", "at", "update-rc.d"].includes(program) ||
      /chmod\s+([ugoa]*\+s|[0-7]?[4-7][0-7]{3})\b/.test(cmd),
  },
  {
    flag: "git-remote",
    test: (cmd, program) =>
      program === "git" && /\s(push|remote\s+(add|set-url)|config\s+.*url)\b/.test(cmd),
  },
  {
    flag: "package-install",
    test: (cmd, program) =>
      (["apt", "apt-get", "dpkg"].includes(program) && /\s(install|-i)\b/.test(cmd)) ||
      (["pip", "pip3", "uv", "pipx"].includes(program) && /\sinstall\b/.test(cmd)) ||
      (["npm", "pnpm", "yarn", "bun"].includes(program) && /\s(install|add|i)\s+\S/.test(cmd)) ||
      (["cargo", "go", "gem"].includes(program) && /\sinstall\b/.test(cmd)),
  },
  {
    flag: "container-escape",
    test: (cmd, program) =>
      program === "docker" &&
      /--privileged|--pid[= ]host|-v\s+\/:|--volume[= ]\/:|--cap-add/.test(cmd),
  },
];

export const programName = (cmdline: string) => {
  const first = cmdline.trimStart().split(/\s+/)[0] ?? "";
  return first.slice(first.lastIndexOf("/") + 1);
};

/** The rule flags a command line trips; empty for an ordinary command. */
export function commandFlags(cmdline: string): string[] {
  const program = programName(cmdline);
  return COMMAND_RULES.filter((rule) => rule.test(cmdline, program)).map((rule) => rule.flag);
}
