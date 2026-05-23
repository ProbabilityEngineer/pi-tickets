# pi-tickets

Lightweight pi extension for [`tk`](https://github.com/) ticket workflows.

It adds one compact tool and one user command:

- `ticket` — list, inspect, create, start, close, and note tk tickets.
- `/tickets` — initialize or inspect tickets from the prompt UI.

The extension intentionally avoids injecting ticket lists into context. Agents can call the tool when ticket context is useful. Ticket actions may modify `.tickets/`; they should not touch code unless the task requires it.

## Command

```bash
/tickets init
/tickets ready
/tickets list
/tickets show <id>
/tickets create <title>
/tickets start <id>
/tickets note <id> <text>
/tickets close <id>
```

`/tickets init` creates `.tickets/.gitkeep` so ticket tracking can be committed before the first ticket exists.

## Tool actions

```json
{ "action": "ready", "limit": 10 }
{ "action": "list", "status": "open" }
{ "action": "show", "id": "abc-123" }
{ "action": "create", "title": "Add feature", "description": "...", "acceptance": "...", "type": "feature", "priority": 2 }
{ "action": "start", "id": "abc-123" }
{ "action": "close", "id": "abc-123" }
{ "action": "note", "id": "abc-123", "note": "Investigation notes..." }
```

`tk create` initializes `.tickets/` if needed.

## Install

```bash
pi install git:github.com/ProbabilityEngineer/pi-tickets
```

For local testing:

```bash
pi -e ./index.ts
```

## Development

```bash
npm install
npm run lint
```
