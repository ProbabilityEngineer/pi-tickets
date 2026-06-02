# pi-tickets

Compact tk ticket workflow tools for Pi agents with low prompt overhead.

`pi-tickets` gives Pi agents a small, explicit interface to [`tk`](https://github.com/radutopala/ticket) tickets without injecting ticket lists into every prompt. It provides one compact model-visible `ticket` tool for listing, creating, starting, updating, noting, and closing tickets, plus a `/tickets` command for user-facing ticket actions. Ticket state stays in the repo's `.tickets/` files, so real project work can be reviewed and committed like any other project artifact.

## Install

From npm:

```bash
pi install npm:pi-tickets
```

From GitHub:

```bash
pi install git:github.com/ProbabilityEngineer/pi-tickets
```

For project-local install, add `-l`:

```bash
pi install -l git:github.com/ProbabilityEngineer/pi-tickets
```

## Requirements

Install [`tk`](https://github.com/radutopala/ticket) so the `tk` executable is on `PATH`.

## Command

```bash
/tickets init
/tickets ready
/tickets list
/tickets show <id>
/tickets create <title>
/tickets start <id>
/tickets status <id> <open|in_progress|closed>
/tickets note <id> <text>
/tickets close <id>
```

`/tickets init` creates `.tickets/.gitkeep` so ticket tracking can be committed before the first ticket exists.

## Tool actions

One compact model-visible tool:

```text
ticket action: ready/list/show/create/start/close/note/status/update
# Optional: cwd=/path/to/repo for tickets in another repository
```

Examples:

```json
{ "action": "ready", "limit": 10 }
{ "action": "list", "status": "open" }
{ "action": "show", "id": "abc-123" }
{ "action": "create", "title": "Add feature", "description": "...", "acceptance": "...", "type": "feature", "priority": 2 }
{ "action": "start", "id": "abc-123" }
{ "action": "close", "id": "abc-123" }
{ "action": "note", "id": "abc-123", "note": "Investigation notes..." }
{ "action": "status", "id": "abc-123", "status": "in_progress" }
{ "action": "update", "id": "abc-123", "title": "Better title", "acceptance": "Updated criteria" }
```

`tk create` initializes `.tickets/` if needed. For another repository, pass the ticket tool `cwd` parameter or use `/tickets --cwd <repo> ...`; the extension runs `tk` in that repository instead of requiring agents to write `.tickets/` files manually.

## Prompt overhead

`pi-tickets` avoids automatic ticket-list injection. Agents can call the `ticket` tool when ticket context is useful, keeping prompts small and cache-friendly.

## Development

```bash
npm install
npm run lint
```
