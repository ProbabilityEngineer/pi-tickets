# pi-tickets

Lightweight pi extension for [`tk`](https://github.com/) ticket workflows.

It adds one compact tool:

- `ticket` — list, inspect, create, start, close, and note tk tickets.

The extension intentionally avoids injecting ticket lists into context. Agents can call the tool when ticket context is useful.

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
