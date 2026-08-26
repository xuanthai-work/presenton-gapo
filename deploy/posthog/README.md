# PostHog for GSlide error reporting

A **standalone**, self-hosted PostHog stack that GSlide reports errors to.
This is a **separate Compose project** from GSlide — it is NOT started by the
repo-root `docker-compose.yml`, GSlide never `depends_on` it, and no PostHog
container is built into the GSlide image.

GSlide sends only error reports (browser crashes and failed generate / export /
stream / save actions) here. No usage funnels, no session replay.

## RAM warning

The PostHog hobby stack is heavy: it runs ClickHouse, Kafka, Postgres, Redis,
and the PostHog web/worker services. Expect roughly **8 GB of extra RAM** when
running. **GSlide runs fine without this stack** — start it only when you want
the error-reporting UI.

## Prerequisites

- Docker Desktop (Windows works; no Linux-only shell required).
- ~8 GB free RAM.

## Bootstrap (once)

The PostHog hobby compose bind-mounts files from a PostHog git checkout, so the
upstream repo must exist on disk. It is gitignored here so you keep your own
shallow copy:

```bash
git clone --depth 1 https://github.com/PostHog/posthog.git deploy/posthog/upstream
```

Copy the env template and set a secret:

```bash
cp deploy/posthog/.env.example deploy/posthog/.env
# edit deploy/posthog/.env — set POSTHOG_SECRET to a long random string
```

`DOMAIN=localhost` and `SITE_URL=http://localhost:8010` are already set in
`.env.example` for local use.

## Start / stop

```bash
# start (separate project — does not touch GSlide)
docker compose --project-name gslide-posthog -f deploy/posthog/docker-compose.yml up

# stop
docker compose --project-name gslide-posthog -f deploy/posthog/docker-compose.yml down
```

The PostHog UI is served at **http://localhost:8010**.

> A repo-root `docker compose down` for GSlide does **not** stop PostHog,
> because they use distinct project names (`gslide-posthog` vs GSlide's project).

### Port note

The PostHog hobby compose publishes its web container on host port 80. This
file remaps it to **8010** so it never collides with GSlide (5001) or SearXNG
(8080). If `include` + the `web` port override does not work with your version
of the hobby file (some revisions name the fronting service `proxy` or use
Caddy on a different port), edit the `services:` override in
`deploy/posthog/docker-compose.yml` to remap whichever service publishes port
80/8000 to `8010:80` (or `8010:8000`). The README command and port stay the
same.

## First run — point GSlide at PostHog

1. Start the stack above and open http://localhost:8010.
2. Create your admin user and a project.
3. Copy the project's **public** API key (starts with `phc_…`).
4. In the **repo-root** `.env`:
   - `POSTHOG_PROJECT_API_KEY=<phc_… key>`
   - `POSTHOG_HOST=http://localhost:8010`
   - `DISABLE_ANONYMOUS_TRACKING=false`
5. Recreate **only** the GSlide container so it picks up the new env:

```bash
docker compose up -d --force-recreate production
```

`POSTHOG_HOST` must be browser-reachable. Never use a Docker-internal hostname
like `http://posthog:8000` — the user's browser cannot resolve it. Use
`http://localhost:8010` (or a LAN IP / HTTPS host).

## Verify

- Trigger a save or generate failure in GSlide; an error event appears in the
  PostHog UI.
- The browser Network tab should show requests to `localhost:8010` and **no**
  requests to `api-eu.mixpanel.com`.

## Troubleshooting

- **Caddy refuses HTTP on localhost:** the hobby stack may try to provision
  TLS for `DOMAIN=localhost`. If it does not bind cleanly, remap the web
  container's listen port to host `8010` (see the Port note) and set
  `SITE_URL=http://localhost:8010`.
- **`include` / `extends` path errors:** the hobby file `extends` its
  `docker-compose.base.yml` relative to the `upstream/` folder. If Compose
  cannot resolve those paths from the parent folder, run Compose with its
  working directory inside `deploy/posthog/upstream/` and add a sibling
  override file that only remaps the web/proxy service port to `8010`. The
  command must still use `--project-name gslide-posthog` and the UI is still at
  `localhost:8010`.