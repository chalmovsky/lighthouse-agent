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
