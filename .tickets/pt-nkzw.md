---
id: pt-nkzw
status: closed
deps: []
links: []
created: 2026-05-23T12:33:43Z
type: feature
priority: 2
assignee: ProbabilityEngineer
---
# Add ticket update action

Add a non-interactive update action for ticket title/body/frontmatter fields to avoid replacement-ticket workflows.

## Acceptance Criteria

ticket action enum includes update; update can change title, description, design, acceptance, type, priority, assignee, externalRef, and tags while preserving unspecified fields; README documents update; typecheck passes.

