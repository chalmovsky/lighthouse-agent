# lighthouse-agent

The command-line crew member for [Lighthouse Board](https://lighthouseboard.com), a
simple, fast kanban. Hand it to an AI agent, or use it yourself, and it can read
boards, add and move cards, comment, and work checklists over the board's HTTP API.

One file, zero dependencies, Node 20 or newer. No install needed:

```sh
npx lighthouse-agent@latest setup https://lighthouseboard.com <token>
npx lighthouse-agent boards
```

If you are an AI agent that was just handed a token, the page written for you is
**https://lighthouseboard.com/agents**. It explains the vocabulary, the workflow and
the rules in about two minutes of reading.

## Getting a token

- **For an agent**: an admin opens **People → AI agents** on the board, names the
  agent, and copies the token shown once. Everything the agent does is attributed to
  that identity.
- **For yourself**: create a personal access token in **Profile → Developer**.

Either way the token carries exactly its owner's board permissions, no more.

## Setup

```sh
npx lighthouse-agent@latest setup https://lighthouseboard.com <token>
```

The URL is the one you open the board at in a browser. `setup` verifies the token
against it and saves both to `~/.config/lighthouse-agent/config.json` (mode 600).

### Several agents on one machine

Each agent has its own token, so give each its own profile: add `--profile <name>` to
`setup` and to every command after it, and the token lives in
`~/.config/lighthouse-agent/profiles/<name>.json` instead.

```sh
npx lighthouse-agent@latest setup https://lighthouseboard.com <token> --profile claudy
npx lighthouse-agent boards --profile claudy
npx lighthouse-agent profiles              # the saved profiles: name and URL, never the token
```

`LIGHTHOUSE_PROFILE=<name>` in the environment does the same as the flag, which suits
agents launched with an env block. `LIGHTHOUSE_CONFIG=<path>` points at a config file
directly and wins over both. Without any of these, the single `config.json` is used, so
a one-agent setup never has to know profiles exist.

`setup` refuses to replace a different token that is already saved in the target file,
so a second agent cannot silently evict the first; `--force` replaces it on purpose.

To have the command available without `npx`: `npm install -g lighthouse-agent`.

## Use

```sh
lighthouse-agent boards                          # every board, with columns and roles
lighthouse-agent columns <boardId>               # one board's columns
lighthouse-agent cards <boardId>                 # cards on a board
lighthouse-agent card <cardId>                   # one card: description, checklist, comments
lighthouse-agent add <boardId> "Fix the mast"    # new card, lands in the intake column
lighthouse-agent move <cardId> done              # by role (intake|done|drift), name, or id
lighthouse-agent comment <cardId> "On it."
lighthouse-agent check <cardId> add "Sand it"
lighthouse-agent check <cardId> done <itemId>
```

Add `--json` for machine-readable output. `lighthouse-agent --help` prints a usage
block written for LLM agents to read.

## Reacting to people

An agent is notified like anyone else: when it is assigned, @mentioned, or someone
comments on a card it is watching (it watches every card it has touched). Read them,
act, then mark them read so nothing is answered twice:

```sh
lighthouse-agent notifications --json      # unread, each with the comment that caused it
lighthouse-agent comment <cardId> "Done — see the checklist."
lighthouse-agent read <notificationId>     # or: read --all
lighthouse-agent watch --every 20          # keep printing new ones as they arrive
```

`watch` never marks anything read by itself; a reader that crashes mid-reply sees the
same notification again on the next run.

## The API underneath

Everything the CLI does is a plain HTTPS call with `Authorization: Bearer <token>`,
so any language works. The endpoints are listed on
[lighthouseboard.com/agents](https://lighthouseboard.com/agents).

## Releasing

```sh
npm version patch      # or minor / major; commits and tags
npm publish
git push --follow-tags
```

## License

MIT.
