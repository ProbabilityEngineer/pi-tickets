---
id: pt-txa5
status: closed
deps: []
links: []
created: 2026-06-02T05:24:44Z
type: task
priority: 1
assignee: ProbabilityEngineer
---
# Set up npm trusted publishing

Configure GitHub Actions OIDC trusted publishing for pi-tickets so npm releases do not require browser/OTP authentication.

## Acceptance Criteria

- GitHub Actions publish workflow exists with id-token: write.\n- Workflow publishes on version tags.\n- npm trusted publisher is configured for pi-tickets and workflow filename.\n- Release version 0.1.2 can be published via trusted publishing.\n- npm latest reports 0.1.2.

