# ☁️ Deployment

Tapwave runs for free at [tapwave.onrender.com](https://tapwave.onrender.com): the service on
[Render](https://render.com), the database on [Neon](https://neon.tech).

> [!IMPORTANT]
> **No payment method is on file at either provider, and none may ever be added**, not even "just for
> verification". Without a card, a free service that hits a limit is suspended until the next month
> instead of being billed. If a change would need a paid plan, find another way.

## 🗺️ What runs where

| What       | Where                                                                                                            | Settings                                                                                         |
| :--------- | :--------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------- |
| Service    | Render web service `tapwave` ([dashboard](https://dashboard.render.com/web/srv-dbpkk7qfngtc73fmrre0)), free plan | Docker from the root `Dockerfile`, Frankfurt, health check `/actuator/health/liveness`, described in `render.yaml` |
| Database   | Neon project `tapwave` ([console](https://console.neon.tech/app/projects/sparkling-credit-05461985)), free plan  | AWS Frankfurt (`aws-eu-central-1`), PostgreSQL 18, direct (unpooled) connection                  |
| Source     | [github.com/stepan-omelka/tapwave](https://github.com/stepan-omelka/tapwave), branch `main`                     | The Render GitHub app has access, so every push deploys                                          |

The only setting on Render is the secret environment variable `DATABASE_URL`, Neon's **direct**
connection string; see the [backend README](../backend/README.md#️-configuration) for what reads
it. Flyway needs a session, and Neon's pooler runs in transaction mode, so the pooled URL would not
work. Render sets `PORT` itself.

On the owner's machine the same URL is in the git-ignored `.env.local` as `DATABASE_URL_UNPOOLED`.
Never print it, put it on a command line or commit it.

## 🚀 How a deploy happens

1. A push to `main` reaches Render through its GitHub app. A commit whose message contains
   `[skip render]` is ignored.
2. Render builds the `Dockerfile`: the Angular build is copied into the Spring Boot jar, **without
   running the tests**. This takes one to two minutes.
3. The new instance starts and runs any new Flyway migration. Spring needs about 70 s to start on
   the free 0.1 CPU, and the instance takes over as soon as `/actuator/health/liveness` answers.
4. **Only then are new maps generated** (`BeatmapSeeder` runs after startup, and liveness is already
   up). So for a moment the live site can lack a new map, and a map that fails to generate, for
   example because its rhythm file is missing, crashes the instance after it has taken over. Restart
   the backend locally after any change to `tapwave.seed.maps`, before pushing.

To check a deploy, open the service's _Events_ and _Logs_ in the Render dashboard. An agent with
the Render MCP server can call `list_events` (look for `deploy_started` with trigger `new_commit`,
then `deploy_ended`), `get_deploy` (status `live`) and `list_logs` with a text filter such as
`*Started TapwaveApplication*` or `*ERROR*`.

## 📏 Free-tier limits

Render's numbers are from the workspace's [billing page](https://dashboard.render.com/billing), Neon's from
[neon.com/pricing](https://neon.com/pricing), both as of November 2026. Free tiers change.

| Limit                                         | What it means here                                                                                                                                         |
| :-------------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Render: sleeps after 15 minutes without traffic | The first visit afterwards waits a minute or two while the service starts. There is deliberately no keep-awake ping.                                    |
| Render: 750 instance hours a month            | Per **workspace**, shared with the owner's other free services, so Tapwave must not be kept awake around the clock.                                      |
| Render: 5 GB outbound bandwidth a month       | Per workspace, and the tightest limit: the songs are 1.5–6.6 MB each. `WebCacheConfig` lets browsers keep bundles for a year and songs for 30 days, and responses are gzipped. If traffic grows, serve the MP3s from GitHub Pages. |
| Render: 500 build minutes a month             | Per workspace; a deploy takes about two. Use `[skip render]` for changes that cannot affect the service.                                                 |
| Neon: scales to zero after 5 idle minutes     | Hikari closes idle connections after a minute (`minimum-idle: 0`), so the database sleeps whenever nobody plays.                                          |
| Neon: 100 CU-hours a month                    | About 400 hours at the smallest size. Anything that queries the database while nobody plays (a keep-awake ping plus the play-token cleanup that runs every 10 minutes) would spend them. |
| Neon: 1 GB storage                            | The maps and scores take a few MB.                                                                                                                         |

Going over a Render limit suspends **every** free service in the workspace until the month ends.
The usage meters are on [dashboard.render.com/billing](https://dashboard.render.com/billing).

## 🧯 When something goes wrong

| Symptom                                                         | Cause                                                                              | Fix                                                                                                                       |
| :-------------------------------------------------------------- | :--------------------------------------------------------------------------------- | :------------------------------------------------------------------------------------------------------------------------ |
| Deploy fails with `Connection to localhost:5433 refused`        | `DATABASE_URL` is missing, so the local default applies                           | Render → service → _Environment_ → add `DATABASE_URL` → _Save, rebuild, and deploy_                                     |
| A push did not deploy                                           | `[skip render]` in the message, or the Render GitHub app lost access to the repo   | Check the service's _Events_ for `commit_ignored`; otherwise give the app access and save _Settings → Build → Source_ again, then push |
| The Blueprint shows "error" after a change in the dashboard     | The Blueprint was not re-synced                                                     | Harmless as long as a Blueprint plan reports no changes                                                                   |
| Startup fails in Flyway validation                              | An already applied migration file was edited                                        | Revert it and put the change in a new `V<n>__….sql`                                                                       |
| The new instance goes live, then crashes with `rhythm file … not found` | A map spec names a rhythm file that is not on the classpath; maps are generated after the health check passes | Fix the spec or add the file, and restart the backend locally before pushing again |
| Startup fails: a map with an audio file has no license          | A new map spec lacks `license` or `source-url`                                      | See [adding a song](./adding-a-song.md)                                                                                    |
| The site answers 503 or the service shows as suspended          | A workspace limit ran out                                                           | Wait for the next month; check the meters on the billing page                                                             |

## 🗄️ Working with the live database

Run `psql` in a container, so the URL never reaches a command line:

```sh
docker run --rm -it --env-file .env.local postgres:18 sh -c 'psql "$DATABASE_URL_UNPOOLED"'
```

List rows before deleting any, and delete only what you created.

A stored map never changes; to regenerate one, see [Maps](../backend/README.md#️-maps) in the
backend README.

## 🏗️ Setting it up from scratch

1. **Neon**, with the CLI signed in. `--org-id` avoids an interactive prompt (`neon orgs list`
   shows it); the JSON output contains the password, so keep only the id:

   ```sh
   neon projects create --name tapwave --region-id aws-eu-central-1 --pg-version 18 --org-id <org> -o json | jq -r .project.id
   { printf 'DATABASE_URL_UNPOOLED='; neon connection-string --project-id <id>; } >> .env.local
   ```

2. **Render GitHub app**: give it access to the repository **first**. A service created without it
   never redeploys on push.
3. **Render Blueprint**: _New → Blueprint_, pick the repository. Render reads `render.yaml` and asks
   for `DATABASE_URL`. Paste the direct Neon URL **before** approving: an approved sync with an empty
   value deploys without a database.
4. Wait for the first deploy, then play a map and submit a score to check the leaderboard end to end.

To try the production image locally first:

```sh
docker buildx build --platform linux/amd64 -t tapwave .
docker run --rm --memory 512m -p 10000:10000 -e PORT=10000 --env-file .env.local tapwave
```

The image is tuned for Render's 512 MB instance
(`-XX:MaxRAMPercentage=75 -XX:+UseSerialGC -XX:TieredStopAtLevel=1`) and runs at about 370 MB.
