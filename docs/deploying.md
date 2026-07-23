# How to deploy Clarity CRM

Clarity CRM ships as a Docker image built from the repo, with two Compose files: one for SQLite (the zero-config default) and one for Postgres. This guide covers getting either one running, what every environment variable does, how to move between the two providers, backups, a Railway recipe, and the one thing these artifacts deliberately do not do for you (TLS).

## Before you start

- **Docker Engine with the Compose plugin.** Check with `docker compose version`.
- **A clone of this repository.** That is the whole toolchain — you do not need Node, `npm install`, or a generated Prisma client on the host. The image builds all of that inside itself.
- **Port 3000 free** on the host.
- **Room for the image.** The built image measures 543 MB for the SQLite variant and 544 MB for the Postgres one; the build itself needs more than that in layer cache.

Docker Compose reads variables from a file called `.env` in the repository root. That is a different file from the `.env.local` used for host development (see the [Getting Started tutorial](tutorial-getting-started.md)) — Compose does not read `.env.local`. Both are git-ignored.

**Keep that `.env` in place for as long as the stack exists.** Compose interpolates variables before it does anything at all, so with the file deleted even `docker compose down` refuses to run:

```
error while interpolating services.app.environment.SESSION_SECRET: required variable SESSION_SECRET is missing a value: set SESSION_SECRET in .env
```

## Quickstart: SQLite

```bash
git clone https://github.com/ChrisScottThomas/clarity-crm.git
cd clarity-crm

cat > .env <<EOF
SESSION_SECRET=$(openssl rand -hex 32)
CRM_PASSWORD=change-me-to-a-real-password
EOF

docker compose up -d
```

The first run builds the image, which takes a few minutes. After that, wait for the container to report healthy:

```bash
docker compose ps
```

`STATUS` reads `Up ... (healthy)` once the check passes, and `Up ... (health: starting)` until then. The healthcheck's `start_period` is 30s and its `interval` is 15s, but the measured worst case from container start to a database-backed `200` was 2.4s, so it is normally healthy on the first probe. If it is not, `docker compose logs app` shows the boot sequence — schema apply, then server start. To poll the endpoint directly:

```bash
curl -fsS http://localhost:3000/api/health
```

```json
{"status":"ok"}
```

To block a script until it comes up, the repo ships a poller — `scripts/wait-for-health.sh http://localhost:3000/api/health 90`, which reported healthy after 3s against a local stack. `/api/health` memoizes its result for 5s and collapses concurrent checks into a single query, so polling it hard is cheap.

Now open **http://localhost:3000**, and log in with the `CRM_PASSWORD` you set.

To stop it, keeping your data:

```bash
docker compose down
```

## Quickstart: Postgres

Same shape, a different Compose file, and one extra secret. The Postgres file is self-contained — it starts its own `postgres:16` service and does **not** layer on `docker-compose.yml`, so do not combine them with two `-f` flags.

```bash
git clone https://github.com/ChrisScottThomas/clarity-crm.git
cd clarity-crm

cat > .env <<EOF
SESSION_SECRET=$(openssl rand -hex 32)
CRM_PASSWORD=change-me-to-a-real-password
POSTGRES_PASSWORD=$(openssl rand -hex 16)
EOF

docker compose -f docker-compose.postgres.yml up -d
```

Check it the same way — note that `-f` is required on **every** subsequent command, or Compose falls back to the SQLite file:

```bash
docker compose -f docker-compose.postgres.yml ps
curl -fsS http://localhost:3000/api/health
```

```json
{"status":"ok"}
```

Open **http://localhost:3000**. Stop with:

```bash
docker compose -f docker-compose.postgres.yml down
```

## Environment variables

Compose sets `DATABASE_URL` and `NODE_ENV` itself; everything else it reads from your `.env`. "Required in production" means `NODE_ENV=production`, which both Compose files set.

| Variable | Required in production | Default | What happens when it is missing |
| --- | --- | --- | --- |
| `SESSION_SECRET` | **Yes** | none | **Fail-closed.** Compose refuses to start the service at all (`set SESSION_SECRET in .env`). If you bypass Compose and run the image directly, the server refuses to boot: `SESSION_SECRET is required in production but was missing or empty.` (`lib/env.ts`, wired in via `instrumentation.ts`). |
| `CRM_PASSWORD` | **Yes** | none | **Fail-closed**, identically: Compose refuses to start; a raw `docker run` refuses to boot with `CRM_PASSWORD is required in production but was missing or empty.` |
| `DATABASE_URL` | Set for you | `file:./data/clarity.db` (SQLite compose and the app's own fallback); `postgres://…@db:5432/…` assembled from the `POSTGRES_*` values (Postgres compose) | Falls back to the SQLite default. A URL whose scheme is neither `file:` nor `postgres://`/`postgresql://` **refuses to boot** — the container entrypoint rejects it first (`FATAL: unsupported DATABASE_URL`), and `assertDatabaseUrl()` in `lib/env.ts` would reject it again at server start. A recognised-but-mismatched scheme is a separate failure: see [Switching provider](#switching-provider-requires-a-rebuild). |
| `TEAM_EMAILS` | No | `alex@example.com,jordan@example.com` | The placeholder addresses are used. Email sync then treats those placeholders as "our side" instead of your real mailboxes, so outbound-message matching is wrong until you set it. Comma-separated. |
| `ANTHROPIC_API_KEY` | No | none | Everything works except AI lead scoring: `POST /api/leads/{id}/score` logs `AI scoring failed` and returns `500 {"error":"scoring failed"}`. No other feature touches it. |
| `DATABASE_POOL_MAX` | No (Postgres only) | `10` via the Postgres Compose file; unset otherwise, which leaves the `pg` driver's own default of 10 | Ignored entirely on SQLite. A value that is not a positive integer throws at startup: `DATABASE_POOL_MAX must be a positive integer`. See [Scale & production data](../README.md#scale--production-data) for how to size it. |
| `POSTGRES_PASSWORD` | **Yes**, for the Postgres compose file | none | Compose refuses to start: `set POSTGRES_PASSWORD in .env`. Read only by `docker-compose.postgres.yml`. |
| `POSTGRES_USER` | No | `clarity` | Defaults to `clarity`. Read only by `docker-compose.postgres.yml`; it feeds both the database service and the `DATABASE_URL` handed to the app. |
| `POSTGRES_DB` | No | `clarity` | Defaults to `clarity`. Read only by `docker-compose.postgres.yml`, same as above. |

The fail-closed behaviour of `SESSION_SECRET` and `CRM_PASSWORD` is deliberate. Earlier versions fell back to a well-known dev value; a deployment that silently accepted `dev-insecure-secret-do-not-use-in-production` is worse than one that will not start. Outside production the dev fallbacks remain, so local work is unaffected.

## Switching provider requires a rebuild

**One image serves exactly one database provider.** Next.js inlines the generated Prisma client — schema text included — into `.next/server/chunks` at build time, so the provider is a build input (`ARG DB_PROVIDER` in the `Dockerfile`), not a runtime setting. Editing `DATABASE_URL` does not switch it. Regenerating the client at boot does not switch it either; that was tried and does not take effect.

To switch, rebuild:

```bash
# SQLite -> Postgres
docker compose down
docker compose -f docker-compose.postgres.yml up -d --build

# Postgres -> SQLite
docker compose -f docker-compose.postgres.yml down
docker compose up -d --build
```

Note that this does not move your data. The two providers use different volumes; migrating content between them is a separate export/import job this guide does not cover.

### What happens if you try the URL-only route

The container **refuses to boot**, on purpose. `docker-entrypoint.sh` compares the scheme of `DATABASE_URL` against the provider baked into the image (`CLARITY_DB_PROVIDER`) and exits non-zero on a mismatch, printing the rebuild command:

```
FATAL: this image was built for 'sqlite', but DATABASE_URL is 'postgres'.
The Prisma client is compiled into the server bundle and cannot be swapped at runtime.
Rebuild for the provider you want:
  docker build --build-arg DB_PROVIDER=postgres -t clarity-crm .
or, with compose:
  docker compose -f docker-compose.postgres.yml up -d --build   # Postgres
  docker compose up -d --build                                  # SQLite
```

This guard exists because the failure it replaces is far worse. Without it the app starts, passes a naive liveness probe, serves `/login` with a `200` — and returns `500` on every query. That is an observed failure from the design spike, not a hypothesis. A container that dies at boot with a printed fix is the better outcome.

For choosing between the two providers in the first place — write concurrency, multiple app instances, managed backups — see [Scale & production data](../README.md#scale--production-data) in the README.

## Volumes and backup

Each Compose file declares one named volume:

| Provider | Volume | Contents |
| --- | --- | --- |
| SQLite | `clarity-data` | mounted at `/app/data`; the database is the single file `/app/data/clarity.db` |
| Postgres | `clarity-pgdata` | mounted at `/var/lib/postgresql/data`; the Postgres data directory |

Compose prefixes volumes with the project name, which defaults to the directory name — so from a clone in `clarity-crm/`, `docker volume ls` shows `clarity-crm_clarity-data`. Use the unprefixed names in Compose commands and the prefixed ones in `docker volume` commands.

`docker compose down` leaves the volumes alone. **`docker compose down -v` deletes them, and with them all your data.**

Back up SQLite by copying the file out of the container:

```bash
docker compose cp app:/app/data/clarity.db ./clarity-backup-$(date +%F).db
```

That works against a running container, but it is a hot copy of a file that may be mid-write. For a backup you intend to restore from, `docker compose stop app` first and start it again afterwards.

Back up Postgres with `pg_dump`:

```bash
docker compose -f docker-compose.postgres.yml exec db \
  pg_dump -U clarity clarity > clarity-backup-$(date +%F).sql
```

(Substitute your `POSTGRES_USER` / `POSTGRES_DB` if you changed them from the `clarity` defaults.)

Take a backup **before any schema change on a database holding real data.** This project applies schema with `prisma db push` and keeps no migration history, and the entrypoint runs `db push` on every boot with no data-loss override flag: additive changes apply, destructive ones stop the boot rather than silently dropping columns. The rules around that — including why you should never script `--accept-data-loss`, and the trigger for adopting real migrations — are in [Scale & production data](../README.md#scale--production-data).

## Deploying to Railway

> **Not verified.** Unlike the quickstarts above, this recipe has not been run end to end against Railway. It is derived from the artifacts in this repo — the `Dockerfile`, the entrypoint, and the health route — and describes what must be true of the service. Railway's console changes; treat the specifics of *where* each setting lives as something to find, not something quoted here.

Railway builds from the `Dockerfile`, which is all this app needs. What the service must end up with:

1. **Build from the Dockerfile, with `DB_PROVIDER=postgres`.** The default build arg is `sqlite`, and SQLite on a platform with ephemeral filesystems is a data-loss trap. The image must be built with `--build-arg DB_PROVIDER=postgres`, or it will refuse to boot against a Postgres URL — that is the guard doing its job, not a bug. If your platform gives you no way to pass a build argument, change the `ARG DB_PROVIDER=sqlite` default at the top of the `Dockerfile` in your fork; it is one line and has the same effect.
2. **A managed Postgres attached to the project**, with `DATABASE_URL` set from the database's own connection variable rather than typed by hand. It must start `postgres://` or `postgresql://`; anything else fails at boot.
3. **`SESSION_SECRET` and `CRM_PASSWORD` as service variables.** Both are mandatory — the server will not start without them. Generate the secret with `openssl rand -hex 32`; do not reuse a value from a `.env` you have committed anywhere.
4. **`ANTHROPIC_API_KEY` and `TEAM_EMAILS`** if you want AI scoring and correct email matching. Both optional.
5. **The healthcheck pointed at `/api/health`.** That path is exempt from the auth gate (`proxy.ts`) precisely so probes are not redirected to `/login`. It returns `200 {"status":"ok"}` only when a real database round-trip succeeds, and `503` otherwise. Allow at least 30 seconds of grace at start — the container applies the schema before it serves.
6. **`DATABASE_POOL_MAX` kept modest if you scale replicas.** The app opens a pool per instance; `replicas × DATABASE_POOL_MAX` must stay under the database's connection limit. On a small managed Postgres with more than one replica, 3–5 is a sane starting point.
7. **No volume needed.** All state is in Postgres.

Railway terminates TLS for you, which resolves the caveat below. If you deploy anywhere that does not, read on.

## TLS and reverse proxies are out of scope

These artifacts serve **plain HTTP on port 3000**. There is no TLS termination, no certificate handling, and no reverse proxy in this repo. That is the operator's job, and deliberately so — the sensible choice differs per platform.

If you need to do it yourself, put a proxy in front of the container:

- **[Caddy](https://caddyserver.com/)** — obtains and renews certificates automatically; a two-line `Caddyfile` reverse-proxying to `app:3000` is usually the whole configuration.
- **[Traefik](https://traefik.io/)** — more moving parts, but integrates with Docker labels if you are already running a multi-service stack.

### The session cookie is `Secure` in production, so bare HTTP cannot hold a login

This is the part that bites, because the symptom does not look like a TLS problem. The session cookie is set with `secure: process.env.NODE_ENV === 'production'` (`lib/auth.ts`), and both Compose files set `NODE_ENV=production`. A running container confirms it — the successful login response carries:

```
Set-Cookie: clarity_session=…; Path=/; Expires=…; Max-Age=2592000; Secure; HttpOnly; SameSite=lax
```

A browser will not store a `Secure` cookie received over plain `http://` on a normal hostname. What the operator actually sees on a bare-HTTP deployment:

1. `/login` loads fine.
2. They enter the **correct** password and submit.
3. The server accepts it, sets the cookie, and answers `303 See Other` → `/pipeline`.
4. The browser discarded the cookie, so `proxy.ts` finds no valid session and answers `307` → `/login`.
5. **The login page shows no error message** — the "Incorrect password" text only renders for `/login?error=1`, and that redirect carries no error parameter.

So it looks like a login form that silently does nothing, forever, no matter how correct the password is. Nothing in the logs says "TLS". If you hit that, the answer is HTTPS, not the password.

The quickstarts above are unaffected because browsers treat `http://localhost` as a secure context and will store `Secure` cookies from it. That exception is browser behaviour and applies to `localhost` only — the moment you serve the same container on a real hostname over plain HTTP, logins stop working.
