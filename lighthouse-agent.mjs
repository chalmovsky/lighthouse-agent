#!/usr/bin/env node
// lighthouse-agent — put an AI agent (or yourself) to work on a Lighthouse Board board.
//
// Zero dependencies, Node >= 20. Talks to the board's HTTP API with an access token
// minted by "Bring an AI agent" on the People page, or a personal token from the
// profile's Developer section. The guide written for agents, with the API underneath,
// is https://lighthouseboard.com/agents.
//
// Source: https://github.com/chalmovsky/lighthouse-agent

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const CONFIG_DIR = join(homedir(), ".config", "lighthouse-agent");
const PROFILE_NAME = /^[A-Za-z0-9._-]+$/;
const VERSION = createRequire(import.meta.url)("./package.json").version;

const HELP = `lighthouse-agent ${VERSION}: work a Lighthouse Board board from the command line

Guide for agents (vocabulary, workflow, rules, the HTTP API):
  https://lighthouseboard.com/agents

SETUP
  lighthouse-agent setup <url> <token>   Save the board's URL (the one you open in a
                                         browser) and access token, then verify them.
                                         Refuses to replace a different token already
                                         saved: add --profile <name> for another agent,
                                         or --force to replace on purpose.
  lighthouse-agent profiles              The saved profiles (name and URL, never the token).

READ
  lighthouse-agent boards                Every board you can see, with its columns.
  lighthouse-agent columns <boardId>     One board's columns (id, roles, name).
  lighthouse-agent cards <boardId>       Open and closed cards on a board.
  lighthouse-agent card <cardId>         One card in full: description, checklist, comments.
  lighthouse-agent notifications [--all] What you were told: assigned, mentioned, or a
                                         comment on a card you watch. Unread only, unless
                                         --all. Each carries the comment that caused it.
  lighthouse-agent watch [--every <s>]   Keep polling (default every 30 s) and print each
                                         new notification as it arrives, until stopped.

WRITE
  lighthouse-agent add <boardId> <title> [--desc <text>]   Create a card. It lands in the
                                                           board's intake column.
  lighthouse-agent move <cardId> <column>                  Move a card. <column> is a role
                                                           ("intake", "done", "drift"), a
                                                           column name, or an id.
  lighthouse-agent comment <cardId> <text>                 Comment on a card.
  lighthouse-agent check <cardId> add <text>               Append a checklist item.
  lighthouse-agent check <cardId> done <itemId>            Tick a checklist item.
  lighthouse-agent check <cardId> undo <itemId>            Untick a checklist item.
  lighthouse-agent read <notificationId...> | read --all   Mark notifications read.

OPTIONS
  --json             Print raw JSON instead of tables (recommended for agents).
  --profile <name>   Use a named profile, so several agents can share one machine.
                     Each keeps its own token in ~/.config/lighthouse-agent/profiles/.
                     LIGHTHOUSE_PROFILE=<name> does the same; LIGHTHOUSE_CONFIG=<path>
                     points at a config file directly. Without any of these, the one
                     config at ~/.config/lighthouse-agent/config.json is used.
  --help             This text.
  --version          Print the version.

NOTES FOR AGENTS
  - Ids are opaque strings; take them from earlier output, never invent them.
  - Columns have no fixed names. Address one by ROLE when you can: "done" is
    whichever column that board uses for finished work.
  - Moving a card into the "done" column closes it; moving it out reopens it.
  - A role can be unset on a board. Then that move is refused rather than
    guessing a column — check "lighthouse-agent columns <boardId>" first.
  - You see exactly the boards your token's owner can see. A 404 can mean
    "exists, but not yours to see."
  - Every write is attributed to your AI agent identity on the board.
  - To react to people: poll "lighthouse-agent notifications --json", act on each
    (a mention or a comment usually wants a reply on that card), then mark them
    read with "lighthouse-agent read <id...>" so you never answer twice.
`;

/** One notification, one line: who did what on which card, and what they said. */
function notificationLine(n) {
  const what =
    n.kind === "assigned"
      ? "assigned you"
      : n.kind === "mentioned"
        ? "mentioned you"
        : "commented";
  const said = n.comment ? `  — ${JSON.stringify(n.comment.body)}` : "";
  return `${n.id}  ${n.actor.name} ${what} on #${n.cardNumber} ${n.cardTitle} (card ${n.cardId})${said}`;
}

/** Roles are what an agent should address a column by, so they lead the line. */
function roleTag(column) {
  const roles = column.roles ?? [];
  return roles.length ? `[${roles.join(",")}] ` : "";
}

function fail(message) {
  console.error(`lighthouse-agent: ${message}`);
  process.exit(1);
}

/**
 * Where this run's config lives. One machine can host several agents, each with its own
 * token: a profile is just a separate file. The plain config.json stays the default so
 * a single-agent setup never has to know profiles exist.
 */
function configPath(profile) {
  if (process.env.LIGHTHOUSE_CONFIG) return process.env.LIGHTHOUSE_CONFIG;
  if (!profile) return join(CONFIG_DIR, "config.json");
  if (!PROFILE_NAME.test(profile)) {
    fail(`profile names use letters, digits, ".", "_" and "-" only (got "${profile}")`);
  }
  return join(CONFIG_DIR, "profiles", `${profile}.json`);
}

function loadConfig(path, profile) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    const how = profile ? ` --profile ${profile}` : "";
    fail(`not set up yet. Run: lighthouse-agent setup <url> <token>${how} (config: ${path})`);
  }
}

async function request(config, method, path, body) {
  let response;
  try {
    response = await fetch(`${config.url}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${config.token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    fail(`could not reach ${config.url} (${error.message ?? error})`);
  }
  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    fail(`unexpected response (${response.status}): ${text.slice(0, 200)}`);
  }
  if (!response.ok) {
    fail(`${response.status} ${json?.error ?? text.slice(0, 200)}`);
  }
  return json;
}

const argv = process.argv.slice(2);
const asJson = argv.includes("--json");
const args = argv.filter((a) => a !== "--json");

function flag(name) {
  const index = args.indexOf(`--${name}`);
  if (index === -1) return undefined;
  const value = args[index + 1];
  args.splice(index, 2);
  return value;
}

function out(data, plain) {
  console.log(asJson ? JSON.stringify(data, null, 2) : plain(data));
}

const profile = flag("profile") ?? process.env.LIGHTHOUSE_PROFILE ?? undefined;
const CONFIG_PATH = configPath(profile);
const command = args[0];

if (!command || command === "--help" || command === "help") {
  console.log(HELP);
  process.exit(0);
}

if (command === "--version" || command === "version") {
  console.log(VERSION);
  process.exit(0);
}

if (command === "setup") {
  const force = args.includes("--force");
  const [, url, token] = args.filter((a) => a !== "--force");
  if (!url || !token) fail("usage: lighthouse-agent setup <url> <token> [--profile <name>] [--force]");
  const config = { url: url.replace(/\/+$/, ""), token };
  // A second agent on the same machine must not silently evict the first: its token
  // would be gone from disk with nothing to say so. Profiles keep them apart.
  if (!force && existsSync(CONFIG_PATH)) {
    let existing = null;
    try {
      existing = JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
    } catch {
      /* unreadable: treat as absent */
    }
    if (existing && existing.token !== token) {
      fail(
        `already set up for ${existing.url} (${CONFIG_PATH}). ` +
          `To add another agent, give it a profile: lighthouse-agent setup <url> <token> --profile <name>. ` +
          `To replace this one on purpose, add --force.`,
      );
    }
  }
  const { boards } = await request(config, "GET", "/api/boards");
  mkdirSync(dirname(CONFIG_PATH), { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", { mode: 0o600 });
  console.log(
    `Aboard. ${boards.length} board${boards.length === 1 ? "" : "s"} in sight. Config: ${CONFIG_PATH}`,
  );
  process.exit(0);
}

if (command === "profiles") {
  // Names and URLs only: a token is never printed, not even here.
  const entries = [];
  const read = (name, path) => {
    try {
      entries.push({ name, url: JSON.parse(readFileSync(path, "utf8")).url, path });
    } catch {
      /* not set up, or unreadable: not a profile */
    }
  };
  read("(default)", join(CONFIG_DIR, "config.json"));
  let files = [];
  try {
    files = readdirSync(join(CONFIG_DIR, "profiles")).filter((f) => f.endsWith(".json"));
  } catch {
    /* no profiles directory yet */
  }
  for (const file of files.sort()) {
    read(file.slice(0, -5), join(CONFIG_DIR, "profiles", file));
  }
  out(entries, (data) =>
    data.length
      ? data.map((e) => `${e.name.padEnd(16)} ${e.url}`).join("\n")
      : "No profiles yet. Run: lighthouse-agent setup <url> <token> [--profile <name>]",
  );
  process.exit(0);
}

const config = loadConfig(CONFIG_PATH, profile);

/** GET /api/notifications, unread unless asked for everything. */
async function fetchNotifications(all) {
  const { notifications } = await request(
    config,
    "GET",
    `/api/notifications${all ? "?all=1" : ""}`,
  );
  return notifications;
}

switch (command) {
  case "notifications": {
    const all = args.includes("--all");
    const notifications = await fetchNotifications(all);
    out(notifications, (data) =>
      data.length ? data.map(notificationLine).join("\n") : "Nothing new.",
    );
    break;
  }

  case "read": {
    const all = args.includes("--all");
    const ids = args.slice(1).filter((a) => a !== "--all");
    if (!all && ids.length === 0) {
      fail("usage: lighthouse-agent read <notificationId...> | lighthouse-agent read --all");
    }
    const result = await request(config, "POST", "/api/notifications/read", all ? { all: true } : { ids });
    out(result, (r) => `Marked ${r.marked} read.`);
    break;
  }

  case "watch": {
    // Prints each unread notification once as it appears and never marks anything
    // read: that is the reader's job, after acting, so a crash mid-reply loses nothing.
    const every = Math.max(5, Number(flag("every") ?? 30) || 30);
    const seen = new Set();
    let first = true;
    for (;;) {
      for (const n of (await fetchNotifications(false)).reverse()) {
        if (seen.has(n.id)) continue;
        seen.add(n.id);
        console.log(asJson ? JSON.stringify(n) : notificationLine(n));
      }
      if (first && !asJson) console.error(`watching every ${every}s — Ctrl-C to stop`);
      first = false;
      await new Promise((resolve) => setTimeout(resolve, every * 1000));
    }
  }

  case "boards": {
    const { boards } = await request(config, "GET", "/api/boards");
    out(boards, (data) =>
      data
        .map(
          (b) =>
            `${b.id}  ${b.name}\n` +
            b.columns
              .map((c) => `    ${c.id}  ${roleTag(c)}${c.name}`)
              .join("\n"),
        )
        .join("\n"),
    );
    break;
  }

  case "columns": {
    const boardId = args[1] ?? fail("usage: lighthouse-agent columns <boardId>");
    const { columns } = await request(config, "GET", `/api/boards/${boardId}/columns`);
    out(columns, (data) =>
      data.map((c) => `${c.id}  ${roleTag(c)}${c.name}`).join("\n"),
    );
    break;
  }

  case "cards": {
    const boardId = args[1] ?? fail("usage: lighthouse-agent cards <boardId>");
    const { cards } = await request(config, "GET", `/api/boards/${boardId}/cards`);
    out(cards, (data) =>
      data
        .map(
          (c) =>
            `${c.id}  #${c.number}  ${c.state === "closed" ? "[shipped] " : ""}${
              c.lit ? "[lit] " : ""
            }${c.title}`,
        )
        .join("\n"),
    );
    break;
  }

  case "card": {
    const cardId = args[1] ?? fail("usage: lighthouse-agent card <cardId>");
    const { card } = await request(config, "GET", `/api/cards/${cardId}`);
    out(card, (c) => {
      const lines = [`#${c.number} ${c.title}  (${c.state})${c.lit ? "  💡 lit" : ""}`];
      if (c.description) lines.push("", c.description.trim());
      if (c.checklist.length) {
        lines.push("", "Checklist:");
        for (const item of c.checklist) {
          lines.push(`  [${item.done ? "x" : " "}] ${item.id}  ${item.text}`);
        }
      }
      if (c.comments.length) {
        lines.push("", "Comments:");
        for (const comment of c.comments) {
          lines.push(`  ${new Date(comment.createdAt).toISOString()}  ${comment.body}`);
        }
      }
      return lines.join("\n");
    });
    break;
  }

  case "add": {
    const description = flag("desc");
    const [, boardId, title] = args;
    if (!boardId || !title) fail("usage: lighthouse-agent add <boardId> <title> [--desc <text>]");
    const created = await request(config, "POST", "/api/cards", {
      boardId,
      title,
      description,
    });
    out(created, (c) => `Card created: ${c.id}`);
    break;
  }

  case "move": {
    const [, cardId, column] = args;
    if (!cardId || !column) fail("usage: lighthouse-agent move <cardId> <column>");
    await request(config, "POST", `/api/cards/${cardId}/move`, { column });
    out({ ok: true }, () => `Moved to ${column}.`);
    break;
  }

  case "comment": {
    const [, cardId, body] = args;
    if (!cardId || !body) fail("usage: lighthouse-agent comment <cardId> <text>");
    const created = await request(config, "POST", `/api/cards/${cardId}/comments`, {
      body,
    });
    out(created, (c) => `Comment added: ${c.id}`);
    break;
  }

  case "check": {
    const [, cardId, action, value] = args;
    if (!cardId || !action) {
      fail("usage: lighthouse-agent check <cardId> add <text> | done <itemId> | undo <itemId>");
    }
    if (action === "add") {
      if (!value) fail("usage: lighthouse-agent check <cardId> add <text>");
      const created = await request(config, "POST", `/api/cards/${cardId}/checklist`, {
        text: value,
      });
      out(created, (c) => `Item added: ${c.id}`);
    } else if (action === "done" || action === "undo") {
      if (!value) fail(`usage: lighthouse-agent check <cardId> ${action} <itemId>`);
      await request(config, "POST", `/api/cards/${cardId}/checklist/${value}`, {
        done: action === "done",
      });
      out({ ok: true }, () => (action === "done" ? "Checked." : "Unchecked."));
    } else {
      fail(`unknown checklist action "${action}". Use add, done or undo`);
    }
    break;
  }

  default:
    fail(`unknown command "${command}". Run lighthouse-agent --help`);
}
