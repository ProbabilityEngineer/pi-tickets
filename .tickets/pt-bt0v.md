---
id: pt-bt0v
status: closed
deps: []
links: []
created: 2026-06-02T00:33:12Z
type: feature
priority: 2
assignee: ProbabilityEngineer
---
# Support ticket tool cwd parameter

Allow Pi agents to manage tk tickets in repos other than the current Pi cwd without manually writing .tickets files or shelling out with cd.

## Acceptance Criteria

- ticket tool accepts optional cwd/path parameter for all actions.
- update path resolution and tk subprocess use the provided cwd.
- /tickets command optionally supports --cwd <path> for user-facing actions.
- Tool guidance mentions using cwd for other repos.
- README documents cross-repo usage.
- npm run lint passes.

