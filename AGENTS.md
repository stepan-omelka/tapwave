# ✨ Instructions for AI agents

- Refer to [`README.md`](./README.md) for what Tapwave is, its gameplay rules and its anti-cheat.
- Refer to [`ARCHITECTURE.md`](./ARCHITECTURE.md) for how the parts fit together, the life of a play,
  and the rules that are implemented twice.
- Refer to [`CONTRIBUTING.md`](./CONTRIBUTING.md) for running it locally, Git habits and what a push
  to `main` does.
- Refer to the [glossary](./docs/glossary.md) for the game's terms (circle, slider, OD, judgement, …).
- Read [`backend/README.md`](./backend/README.md) or [`frontend/README.md`](./frontend/README.md)
  before changing anything in that part.

## Where the traps are

- The scoring rules exist in Java, in TypeScript and in the live engine:
  [rules implemented twice](./ARCHITECTURE.md#️-rules-implemented-twice).
- A map is generated once and never changes, here or in production:
  [Maps](./backend/README.md#️-maps).
- A push to `main` deploys without running tests, and maps are generated only after the new instance
  is live: [how a deploy happens](./docs/deployment.md#-how-a-deploy-happens).
- "Offset" and "lead-in" each mean more than one thing: [glossary](./docs/glossary.md).

## What belongs in an `AGENTS.md`

These files are for **gotchas and hard-to-explore findings**, the things an agent would otherwise
only learn by getting burnt.

- **Never** restate what other documentation already says; link to it instead.
- **Never** restate what a single file's own comments state plainly. An agent reading that file
  already has it, and a second copy here is one that will go stale.
- A non-obvious conclusion that only emerges from comments and code scattered across several files
  **is** hard to find, and does belong here.

## Changing the code

Verify a change with both test suites. The backend's integration tests need a running Docker daemon.

```sh
cd backend && ./mvnw test                  # JUnit, Testcontainers on PostgreSQL 18
cd frontend && npx ng test --watch=false   # Vitest
cd frontend && npx ng build                # type checks and bundle budgets
cd frontend && npx prettier --check src    # formatting
```

Comments describe the code as it stands, never how it used to look: no "was X, now Y", no
"moved from Z". **The git history is the record.** The one exception is code that looks wrong but
is right; there, say what breaks if it is changed back. See the
[comments and docs policy](./docs/comments-and-docs-policy.md).

**Never commit** unless explicitly asked to. **Never push** unless explicitly asked to: a push to
`main` is a production deploy, and nothing runs the tests on the way. Read
[`CONTRIBUTING.md`](./CONTRIBUTING.md#-git) first.
