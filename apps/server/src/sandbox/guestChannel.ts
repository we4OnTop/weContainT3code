/**
 * The guest half of the host channel: a root-owned script the T3 host keeps
 * running in a `sbx exec -u root` session for every running sandbox, and the
 * `t3-sync` command the agent uses to ask the host for a git sync.
 *
 * Trust direction: the channel writes fixed-form lines to the host
 * (`T3CHANNEL`, `SYNC <id>`, `CMD <line>`, `TAMPER <state>`). Everything after
 * the keyword is sandbox-controlled data. The only thing the agent can put in a
 * request is a file name, which the channel accepts solely as a hex id; the
 * host re-validates it and decides everything else (which sandbox, what to
 * sync, rate limits). The sandbox never gets a network path to the receiver.
 */

export const GUEST_CHANNEL_PATH = "/usr/local/lib/t3/host-channel";
export const GUEST_SYNC_COMMAND_PATH = "/usr/local/bin/t3-sync";
export const GUEST_FEATURES_FILE = "/etc/t3/features";
export const GUEST_SYNC_REQUEST_DIR = "/var/lib/t3-channel/requests";
export const GUEST_SYNC_RESULT_DIR = "/var/lib/t3-channel/results";
export const GUEST_COMMAND_LOG = "/var/log/t3/commands.log";

export const CHANNEL_FILE = "t3-host-channel";
export const SYNC_COMMAND_FILE = "t3-sync";

/** Ubuntu's snoopy package, pinned; the build fails rather than drift. */
export const SNOOPY_VERSION = "2.5.2-1build1";

/** A sync request id: what `t3-sync` generates (32 hex chars). */
export const SYNC_REQUEST_ID_PATTERN = /^[a-f0-9]{16,64}$/;

/**
 * snoopy writes one line per exec, in the process that execs, so the fields
 * are whatever that process says. `|` separates the fixed fields; the command
 * line comes last because it is the only one that may contain `|` freely.
 */
export const SNOOPY_INI = `[snoopy]
message_format = "%{uid}|%{pid}|%{ppid}|%{cwd}|%{cmdline}"
output = file:${GUEST_COMMAND_LOG}
error_logging = n
`;

export const HOST_CHANNEL_SCRIPT = `#!/usr/bin/env bash
# T3 host channel. Runs as root in a session the T3 host holds open; stdout
# goes to the host. Keep the loop free of external programs: with the command
# log on, every exec would be logged every tick.
set -u

FEATURES=${GUEST_FEATURES_FILE}
REQ=${GUEST_SYNC_REQUEST_DIR}
RES=${GUEST_SYNC_RESULT_DIR}
LOG=${GUEST_COMMAND_LOG}

SUDO=1
COMMAND_LOG=0
if [ -f "$FEATURES" ]; then
  while IFS='=' read -r key value; do
    case "$key" in
      sudo) SUDO=$value ;;
      commandLog) COMMAND_LOG=$value ;;
    esac
  done < "$FEATURES"
fi

harden() {
  if [ "$SUDO" != 1 ]; then
    # sbx may restore its sudoers drop-in when the VM starts.
    rm -f /etc/sudoers.d/agent
    gpasswd -d agent sudo >/dev/null 2>&1 || true
  fi
  mkdir -p "$REQ" "$RES"
  chown root:root "$REQ" "$RES"
  # Anyone may drop a request; nobody but root can list or read them.
  chmod 1733 "$REQ"
  chmod 0755 "$RES"
  find "$RES" -type f -mmin +60 -delete 2>/dev/null
  if [ "$COMMAND_LOG" = 1 ]; then
    mkdir -p "\${LOG%/*}"
    chown root:root "\${LOG%/*}"
    chmod 0755 "\${LOG%/*}"
    if [ -L "$LOG" ] || [ ! -f "$LOG" ]; then
      rm -f "$LOG"
      : > "$LOG"
    fi
    # Every process appends as itself; only root reads it back.
    chown root:root "$LOG"
    chmod 0622 "$LOG"
    # Start each session small; the host keeps the history.
    if [ "$(stat -c %s "$LOG" 2>/dev/null || echo 0)" -gt 67108864 ]; then
      : > "$LOG"
    fi
  fi
}

harden
if [ "\${1:-}" = "--harden" ]; then
  exit 0
fi

# One channel per sandbox. A host session that died leaves its channel (and
# the command-log follower, reparented to init) behind in the VM, since
# nothing tells them; the next channel retires every one of them.
for pid in $(pgrep -f "^(/usr/bin/)?bash ${GUEST_CHANNEL_PATH}\\$|^tail -n 0 -F ${GUEST_COMMAND_LOG}\\$"); do
  [ "$pid" != "$$" ] && kill "$pid" 2>/dev/null
done
# Leaving for any reason takes the command-log follower along. A write to a
# closed session raises SIGPIPE, which would otherwise skip the EXIT trap.
trap 'pkill -P $$ 2>/dev/null' EXIT
trap 'exit 0' PIPE HUP TERM

printf 'T3CHANNEL 1 sudo=%s commandLog=%s\\n' "$SUDO" "$COMMAND_LOG"

if [ "$COMMAND_LOG" = 1 ]; then
  tail -n 0 -F "$LOG" 2>/dev/null | while IFS= read -r line; do
    printf 'CMD %s\\n' "$line"
  done &
fi

# A FIFO nobody writes to: \`read -t\` on it sleeps without an exec.
TICK=/var/lib/t3-channel/tick
[ -p "$TICK" ] || { rm -f "$TICK"; mkfifo -m 0600 "$TICK"; }
exec 9<>"$TICK"

last_state=
tick=0
while :; do
  # Heartbeat: the only way to notice the host session is gone is a write.
  tick=$((tick + 1))
  if [ $((tick % 15)) -eq 0 ]; then
    printf 'PING\\n'
  fi
  for request in "$REQ"/*; do
    [ -e "$request" ] || [ -L "$request" ] || continue
    id=\${request##*/}
    rm -f -- "$request"
    if [[ $id =~ ^[a-f0-9]{16,64}$ ]]; then
      printf 'SYNC %s\\n' "$id"
    fi
  done

  state=
  if [ "$COMMAND_LOG" = 1 ]; then
    preload=
    [ -f /etc/ld.so.preload ] && preload=$(< /etc/ld.so.preload)
    [[ $preload == *libsnoopy.so* ]] || state="$state command-log-disabled"
  fi
  if [ "$SUDO" != 1 ] && [ -e /etc/sudoers.d/agent ]; then
    state="$state sudo-restored"
    rm -f /etc/sudoers.d/agent
  fi
  if [ "$state" != "$last_state" ]; then
    printf 'TAMPER %s\\n' "\${state:- none}"
    last_state=$state
  fi

  read -r -t 2 -u 9 _ || true
done
`;

export const SYNC_COMMAND_SCRIPT = `#!/usr/bin/env bash
# t3-sync: ask the T3 host to collect this sandbox's committed work into the
# host checkout and the git receiver. The sandbox has no network path to the
# receiver; the host does the transfer and writes the outcome back here.
set -u

REQ=${GUEST_SYNC_REQUEST_DIR}
RES=${GUEST_SYNC_RESULT_DIR}
WAIT=\${T3_SYNC_WAIT:-300}
WORKSPACE=\${T3_SANDBOX_WORKSPACE:-$HOME/workspace}

case "\${1:-}" in
  -h|--help)
    echo "usage: t3-sync   (commit first; only committed work on the checked-out branch is synced)"
    exit 0
    ;;
esac

if [ -n "$(git -C "$WORKSPACE" status --porcelain 2>/dev/null)" ]; then
  echo "t3-sync: uncommitted changes in $WORKSPACE are not synced; commit them first." >&2
fi

id=$(od -An -N16 -tx1 /dev/urandom | tr -d ' \\n')
if ! : > "$REQ/$id" 2>/dev/null; then
  echo "t3-sync: the host channel is not set up ($REQ); is this a T3 sandbox?" >&2
  exit 2
fi

for ((i = 0; i < WAIT; i++)); do
  if [ -f "$RES/$id" ]; then
    cat "$RES/$id"
    echo
    case "$(head -c 3 "$RES/$id")" in
      ok:) exit 0 ;;
      *) exit 1 ;;
    esac
  fi
  sleep 1
done
echo "t3-sync: no answer from the host after \${WAIT}s (is T3 Code running on the host?)" >&2
exit 3
`;
