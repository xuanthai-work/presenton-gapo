# Contributing to Presenton Gapo

This repository is a **web-only fork** of Presenton. There is no Electron desktop app and no MCP server. The supported runtime is Docker Compose.

## Quick links

- **Repo:** https://github.com/xuanthai-work/presenton-gapo
- **Local setup:** [setup-presonton.md](./setup-presonton.md)
- **Architecture:** [docs/architecture/README.md](./docs/architecture/README.md)

## Current contribution scope

Work happens in:

- `servers/fastapi` — Python backend
- `servers/nextjs` — Next.js frontend
- `docker-compose.yml`, `Dockerfile`, `Dockerfile.dev`
- `docs/` — architecture and operator docs

LLM, image, and web-search providers are intentionally small: OpenAI, Google Gemini, and OpenAI-compatible (`custom`). Do not reintroduce dropped providers (Anthropic, Bedrock, in-app Ollama, ComfyUI, MCP, Electron, Tavily, Exa, Brave) unless that is an explicit product decision.

Exception: SearXNG is the self-hosted fallback when `auto` has no native search (`LLM=custom`). Do not restore Tavily/Exa/Brave or other dropped providers.

## How to contribute

### Bugs

Open an issue with steps to reproduce, expected vs actual behavior, and logs.

### Features

Start with an issue explaining the problem and proposed solution.

### Code

1. Fork the repository
2. Create a branch
3. Implement the change
4. Open a pull request

Example branch names:

```
feature/add-template-support
fix/export-pptx-error
docs/update-readme
```

## Development setup

### Prerequisites

- Docker Desktop (WSL2 on Windows)
- Git
- Node.js 20+ and Python 3.11 + `uv` if you run tests outside Docker

### Run the app

Copy `.env.example` to `.env`, fill one LLM provider, then:

```powershell
docker compose up development --build
```

App: http://localhost:5001

Production-style image:

```powershell
docker compose up production --build
```

Do not use `production-gpu` / `development-gpu` — those services were removed. The Presenton container calls LLMs over HTTP; GPU belongs on a separate AI server if you self-host models.

## Before opening a PR

- Keep the change small and focused
- Explain what and why
- Run the relevant tests (`servers/fastapi` pytest, Next.js lint/build)
- For UI changes, include screenshots

## AI-assisted contributions

PRs created with AI tools are welcome. Mention that the PR is AI-assisted, what you tested, and that you reviewed the generated code.

## Code of conduct

See [CODE_OF_CONDUCT.md](./CODE_OF_CONDUCT.md).
