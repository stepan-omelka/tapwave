# 🤝 Contributing

## 🧰 Prerequisites

- [Java](https://adoptium.net) 21; Maven comes with the wrapper, `backend/mvnw`
- [Node.js](https://nodejs.org/en/download) 24 with npm 11
- [Docker](https://docs.docker.com/desktop/), for the local database and the backend's integration tests
- Only for [adding a song](./docs/adding-a-song.md): Python 3 with numpy

## 💻 Development

Start at [`ARCHITECTURE.md`](./ARCHITECTURE.md) when you do not know which part a change belongs to.

Run it locally, each command in its own terminal from the repo root:

```sh
docker compose up -d                       # PostgreSQL 18 on localhost:5433
cd backend && ./mvnw spring-boot:run       # API on :8081; generates the maps on first start
cd frontend && npm install && npm start    # the game on http://localhost:4201, /api proxied to :8081
```

| Port   | What                                                         |
| :----- | :----------------------------------------------------------- |
| `5433` | PostgreSQL from `docker-compose.yml` (user, password and database: `tapwave`) |
| `8081` | Spring Boot (`PORT` overrides it; Render sets 10000)         |
| `4201` | `ng serve`; the dev server proxies `/api` to `:8081`         |

Other common tasks:

```sh
# every backend test (needs Docker)
cd backend && ./mvnw test

# every frontend test, once
cd frontend && npx ng test --watch=false

# production build of the frontend (type checks and bundle budgets)
cd frontend && npx ng build

# format the frontend files you changed (see Code style)
cd frontend && npx prettier --write src/app/game/engine.ts

# the production image, as Render builds it
docker buildx build --platform linux/amd64 -t tapwave .

# a psql shell on the local database
docker compose exec db psql -U tapwave
```

Environment variables and their defaults are in the
[backend README](./backend/README.md#️-configuration).

### Code style

The frontend has a Prettier config (`frontend/.prettierrc`, `frontend/.editorconfig`), but not every
file follows it, so format only the files you change; a whole-tree format would bury the change
in noise. The backend has no formatter; match the surrounding code (records for values and DTOs, constructor
injection). The conventions that matter for each part are in its README.

### Testing

Test layers and where each test lives are described in
[`docs/testing-strategy.md`](./docs/testing-strategy.md).

### Comments and documentation

When a comment or doc earns its place, where it goes and the shape a project README takes are
defined in [`docs/comments-and-docs-policy.md`](./docs/comments-and-docs-policy.md).

### Domain terminology

The game's vocabulary is in [`docs/glossary.md`](./docs/glossary.md).

## 🔀 Git

There is one long-lived branch, `main`, and changes are committed to it directly.

### Commit messages

A short imperative subject that says what changed and, where it is not obvious, why. The body
explains the why at more length when needed; the how is in the diff. A commit that only touches
the README may start with `README:`.

### Pushing deploys

**Every push to `main` is a production deploy.** Render rebuilds the Docker image and replaces the
live service a few minutes later, and the image build skips the tests. So before pushing:

1. Run both test suites.
2. Scan what the push adds for secrets. Stop if a real one matches; documentation placeholders such
   as `user:password@host` match too.

   ```sh
   git log -p origin/main..HEAD | grep '^+' | grep -iE "password|secret|token|api[_-]?key|npg_|BEGIN .*KEY|://[^/ :@]+:[^/ @]+@"
   ```

3. Put `[skip render]` in the commit message of a change that cannot affect the running service,
   such as docs or tests only. Render then skips the build, which saves free build minutes.

Afterwards, check that the deploy went live: see [`docs/deployment.md`](./docs/deployment.md).
