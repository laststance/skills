# Host compatibility

disk-map needs the **same agent that invoked the skill** to keep running local commands on the Mac being inspected: `start` once, then `next` / `assess` / `respond` / `heartbeat` in a loop, then `stop`. It never starts a replacement agent and never edits host settings. If a host blocks a step, follow the host's normal approval flow or stop and tell the user.

Common requirements on every host:

- The command runs on the target Mac (not a cloud VM, container or remote sandbox). `start` refuses non-macOS platforms with exit code 2.
- The runtime is a detached `node` process bound to `127.0.0.1`. The host must allow a background process to outlive one command and allow loopback networking. If the host kills child processes when a command ends, the next `next` call exits 4 (`runtime-unreachable`); tell the user the host cannot keep the session alive.
- Writing the reply/assessment JSON files and reading `~/Library/Application Support/disk-map/` must be allowed.
- Cleanup moves into `~/.Trash`. Some macOS privacy settings (Full Disk Access for the terminal/host app) are needed for this; without them the move fails closed and is reported as `failed`. Do not change privacy settings for the user.
- Each `next` call waits up to 25 seconds. Hosts with a per-command timeout below 30 seconds need a shorter `--timeout`.

## Hosts

| Host | Execution requirement | Notes |
|---|---|---|
| Claude Code | Bash tool on the local Mac with normal permissions | The Bash tool returns after `start`; the detached runtime keeps running. Approve the `node …/disk-map.mjs` commands when asked. |
| Codex CLI | Local command execution; the sandbox must allow loopback networking and a background process | With a restrictive sandbox, the host may ask to run `start` outside the sandbox; use its normal approval prompt, never a config change. |
| Codex Desktop | Same as Codex CLI, in a local (not cloud) task | Cloud tasks run elsewhere; `start` must report the platform and stop. |
| Devin CLI | Local mode (not `--cloud`); skills discovered from `.agents/skills` | Cloud mode runs on another machine; do not use it for this skill. |
| Cursor | Local Agent mode with terminal and file tools | Background/cloud agents run elsewhere and cannot inspect this Mac. |
| OpenClaw | Exec and file tools directed at the target Mac (host execution, not a gateway container) | Check where exec runs before `start`; a container would scan the wrong filesystem. |

## Verification record

A host passes only with a live round trip: the viewer posts a question about a fixture region, the invoking host agent receives it with `next`, writes the answer itself, and the answer appears in the same viewer session. Help output, discovery listings and mocked transports are not a pass.

| ID | Host | Version | Evidence | Result |
|---|---|---|---|---|
| H3 | Claude Code | 2.1.300 | 2026-10-18 on the reference Mac (macOS 26.7.1, Node 24.22.0): disposable fixture; this Claude Code session ran `start`, `next` (received `scan-complete`), `assess` (`.next` → safe/selected, recording → review), then `next` received the viewer chat message with the `.next` candidate context, the session wrote the reply and ran `respond`; the reply appeared in the viewer chat (checked with browser automation) | **Pass** |
| H1 | Codex Desktop | — | Not run | **Unverified** — needs a local Codex Desktop task on a Mac with this skill installed |
| H2 | Codex CLI | — | Not run | **Unverified** — needs an interactive `codex` session that invokes the skill and services `next` |
| H4 | Devin CLI | — | Not run (CLI present; `devin skills paths` lists `.agents/skills`) | **Unverified** — needs a local-mode Devin session |
| H5 | Cursor | — | Not run | **Unverified** — needs Cursor Agent (local) with terminal tools |
| H6 | OpenClaw | — | Not run | **Unverified** — needs an OpenClaw agent whose exec targets the Mac host |

Six-host verification is **not complete**. Each unverified host needs a person (or an authorized session) to run the fixture flow interactively in that host, because driving those hosts from another agent would start a separate, separately billed agent process and new visible chats, which this skill and its verification rules do not allow.

### Fixture flow for a host check

1. Create a disposable fixture (any folder with a Git-ignored `.next` and a personal-looking file) and an empty Trash folder, e.g. under `$TMPDIR`.
2. In the host, invoke the skill: `start --root <fixture>/home --home <fixture>/home --state-dir <fixture>/state --trash-dir <fixture>/trash --open`.
3. Let the host agent assess the `scan-complete` event.
4. In the viewer, select `.next`, choose *Ask in chat*, send a question.
5. Pass when the host agent's own answer appears in the viewer chat. Record the host version, the commands it ran, and the result in the table above.
6. End the session in the viewer; the host should receive `session-ended` and run `stop`. Delete the fixture.
