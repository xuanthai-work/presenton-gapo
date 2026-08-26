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
copy. Pin this commit (hobby fronting service is `proxy` on 80/443):

`9f29728b378fba9453a8c78e1c4039aa018f2629`

```bash
git clone --filter=blob:none --no-checkout https://github.com/PostHog/posthog.git deploy/posthog/upstream
git -C deploy/posthog/upstream fetch --depth 1 origin 9f29728b378fba9453a8c78e1c4039aa018f2629
git -C deploy/posthog/upstream checkout 9f29728b378fba9453a8c78e1c4039aa018f2629
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

The pinned hobby compose publishes Caddy as service **`proxy`** on host `80:80`
and `443:443`. Our compose file **replaces** those ports (`ports: !override`)
with **`8010:80`** only — it does not append, so host 80/443 stay free. If a
newer upstream revision renames that service, update `deploy/posthog/docker-compose.yml`
to override whichever service currently publishes 80, still mapping `8010:80`.
Requires Docker Compose 2.24+ for the `!override` YAML tag.

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
  TLS for `DOMAIN=localhost`. Local HTTP is the intended setup (`SITE_URL=http://localhost:8010`).
  If Caddy still refuses, keep the `proxy` override at `8010:80` and check the
  proxy container logs.
- **`include` / `extends` path errors:** the hobby file `extends` its
  `docker-compose.base.yml` relative to the `upstream/` folder. If Compose
  cannot resolve those paths from the parent folder, run Compose with its
  working directory inside `deploy/posthog/upstream/` and add a sibling
  override file that remaps **`proxy`** with `ports: !override` to `8010:80`.
  The command must still use `--project-name gslide-posthog` and the UI is still at
  `localhost:8010`.