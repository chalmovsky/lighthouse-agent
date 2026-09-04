#!/usr/bin/env node
// lighthouse-agent — put an AI agent (or yourself) to work on a Lighthouse Board board.
//
// Zero dependencies, Node >= 20. Talks to the board's HTTP API with an access token
// minted by "Bring an AI agent" on the People page, or a personal token from the
// profile's Developer section. The guide written for agents, with the API underneath,
// is https://lighthouseboard.com/agents.
//
// Source: https://github.com/chalmovsky/lighthouse-agent

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const CONFIG_PATH = join(homedir(), ".config", "lighthouse-agent", "config.json");
const VERSION = createRequire(import.meta.url)("./package.json").version;

const HELP = `lighthouse-agent ${VERSION}: work a Lighthouse Board board from the command line

Guide for agents (vocabulary, workflow, rules, the HTTP API):
  https://lighthouseboard.com/agents

SETUP
  lighthouse-agent setup <url> <token>   Save the board's URL (the one you open in a
                                         browser) and access token, then verify them.

READ
  lighthouse-agent boards                Every board you can see, with its columns.
  lighthouse-agent columns <boardId>     One board's columns (id, roles, name).
  lighthouse-agent cards <boardId>       Open and closed cards on a board.
  lighthouse-agent card <cardId>         One card in full: description, checklist, comments.

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

OPTIONS
  --json     Print raw JSON instead of tables (recommended for agents).
  --help     This text.
  --version  Print the version.

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
`;

/** Roles are what an agent should address a column by, so they lead the line. */
function roleTag(column) {
  const roles = column.roles ?? [];
  return roles.length ? `[${roles.join(",")}] ` : "";
}

function fail(message) {
  console.error(`lighthouse-agent: ${message}`);
  process.exit(1);
}

function loadConfig() {
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
  } catch {
    fail(`not set up yet. Run: lighthouse-agent setup <url> <token> (config: ${CONFIG_PATH})`);
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
  const [, url, token] = args;
  if (!url || !token) fail("usage: lighthouse-agent setup <url> <token>");
  const config = { url: url.replace(/\/+$/, ""), token };
  const { boards } = await request(config, "GET", "/api/boards");
  mkdirSync(dirname(CONFIG_PATH), { recursive: true });
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + "\n", { mode: 0o600 });
  console.log(
    `Aboard. ${boards.length} board${boards.length === 1 ? "" : "s"} in sight. Config: ${CONFIG_PATH}`,
  );
  process.exit(0);
}

const config = loadConfig();

switch (command) {
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
