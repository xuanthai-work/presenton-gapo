# Setup Presenton Gapo (Docker)

Repo: [https://github.com/xuanthai-work/presenton-gapo](https://github.com/xuanthai-work/presenton-gapo)

Fork của Presenton. Điểm khác quan trọng: `docker-compose.yml` **không dùng image sẵn** (`ghcr.io/presenton/presenton:latest` bị comment), mà **build từ source**. Trên Windows, cách chạy ổn định nhất là clone + Compose, không phải `docker run` image chính thức.

Mở app tại **http://localhost:5001**. Dữ liệu (deck, upload, Mem0, SQLite) nằm trong volume `./app_data`.

---

## 1. Chuẩn bị

- Docker Desktop (WSL2)
- Git
- RAM khuyến nghị: ≥ 8 GB (build image khá nặng: Python + Next.js + Chromium + spaCy + FastEmbed)

Clone và vào thư mục:

```powershell
git clone https://github.com/xuanthai-work/presenton-gapo.git
cd presenton-gapo
```

Tạo file `.env` cạnh `docker-compose.yml` (Compose tự đọc file này).

---

## 2. Chạy bằng Docker Compose (khuyến nghị)

**Production (build image):**

```powershell
docker compose up production --build
```

Lần đầu sẽ lâu. Sau đó mở http://localhost:5001.

**Dev (hot-reload, mount source):**

```powershell
docker compose up development --build
```

**GPU (NVIDIA + NVIDIA Container Toolkit):**

```powershell
docker compose up production-gpu --build
```

Đổi port host:

```powershell
$env:PRESENTON_HTTP_HOST_PORT=8080
docker compose up production --build
```

Lần đầu, UI sẽ bắt tạo tài khoản admin (hoặc set `AUTH_USERNAME` / `AUTH_PASSWORD` như mục 6).

---

## 3. Cấu hình LLM (bắt buộc để generate)

Chọn **một** provider bằng `LLM=...`. Chỉ cần key/model của provider đó.

### OpenAI (phổ biến nhất)

```dotenv
LLM=openai
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4.1
CAN_CHANGE_KEYS=true
```

### Google Gemini

```dotenv
LLM=google
GOOGLE_API_KEY=...
GOOGLE_MODEL=models/gemini-2.0-flash
```

### Anthropic

```dotenv
LLM=anthropic
ANTHROPIC_API_KEY=...
ANTHROPIC_MODEL=claude-3-5-sonnet-20241022
```

### Ollama trên máy host (local)

1. Cài Ollama, rồi:

```powershell
ollama pull llama3.2:3b
```

2. Trong `.env`:

```dotenv
LLM=ollama
OLLAMA_URL=http://host.docker.internal:11434
OLLAMA_MODEL=llama3.2:3b
START_OLLAMA=false
```

`START_OLLAMA=false` là mặc định: container **không** tự chạy Ollama. Container gọi Ollama trên host qua `host.docker.internal`. Trên Docker Desktop Windows/Mac cái này thường hoạt động sẵn.

### OpenAI-compatible (vLLM, LiteLLM, OpenRouter-style, v.v.)

```dotenv
LLM=custom
CUSTOM_LLM_URL=http://host.docker.internal:8000/v1
CUSTOM_LLM_API_KEY=...
CUSTOM_MODEL=your-model-id
```

Các giá trị `LLM` khác: `azure`, `vertex`, `bedrock`, `openrouter`, `fireworks`, `together`, `cerebras`, `deepseek`, `litellm`, `lmstudio`, `codex`.

`CAN_CHANGE_KEYS=false` khóa key trên UI (hữu ích khi deploy nội bộ). Để `true` hoặc để trống nếu muốn đổi provider trong Settings.

---

## 4. Mem0 (memory theo từng presentation)

Mem0 **bật mặc định** (`MEM0_ENABLED=true`). Dùng Qdrant + SQLite local, lưu dưới `/app_data/mem0`. Image Docker đã cài sẵn spaCy `en_core_web_sm` và cache FastEmbed.

**Điểm dễ vướng:** Mem0 **không** dùng LLM chính. Compose mặc định trỏ Mem0 sang Ollama:

| Biến | Default |
|---|---|
| `MEM0_ENABLED` | `true` |
| `MEM0_LLM_MODEL` | `OLLAMA_MODEL` hoặc `llama3.1:latest` |
| `MEM0_LLM_API_KEY` | `ollama` |
| `MEM0_LLM_BASE_URL` | `OLLAMA_URL` hoặc `http://host.docker.internal:11434` |
| `MEM0_DIR` | `/app_data/mem0` |
| `MEM0_EMBEDDER_PROVIDER` | `fastembed` |
| `MEM0_EMBEDDER_MODEL` | `BAAI/bge-small-en-v1.5` |
| `MEM0_EMBEDDING_DIMS` | `384` |

### Nếu LLM chính là OpenAI nhưng không có Ollama

Cách A — tắt Mem0:

```dotenv
MEM0_ENABLED=false
```

Cách B — cho Mem0 dùng cùng OpenAI:

```dotenv
MEM0_ENABLED=true
MEM0_LLM_BASE_URL=https://api.openai.com/v1
MEM0_LLM_API_KEY=sk-...
MEM0_LLM_MODEL=gpt-4.1-mini
```

### Nếu dùng Ollama cho cả generate lẫn Mem0

Pull thêm model memory (default là `llama3.1:latest`, nặng hơn `llama3.2:3b`):

```powershell
ollama pull llama3.1:latest
```

Hoặc cho Mem0 dùng cùng model nhỏ:

```dotenv
MEM0_LLM_MODEL=llama3.2:3b
MEM0_LLM_BASE_URL=http://host.docker.internal:11434
MEM0_LLM_API_KEY=ollama
```

Embedder chạy local trong container (FastEmbed), không cần API riêng.

---

## 5. Ảnh trên slide

Không bắt buộc. Tắt hẳn:

```dotenv
DISABLE_IMAGE_GENERATION=true
```

Hoặc chọn provider:

| `IMAGE_PROVIDER` | Cần thêm |
|---|---|
| `pexels` | `PEXELS_API_KEY` |
| `pixabay` | `PIXABAY_API_KEY` |
| `dall-e-3` | `OPENAI_API_KEY` |
| `gpt-image-1.5` | `OPENAI_API_KEY` |
| `gemini_flash` | `GOOGLE_API_KEY` |
| `comfyui` | `COMFYUI_URL`, `COMFYUI_WORKFLOW` |
| `openai_compatible` | `OPENAI_COMPAT_IMAGE_BASE_URL`, `OPENAI_COMPAT_IMAGE_API_KEY`, `OPENAI_COMPAT_IMAGE_MODEL` |

Ví dụ OpenAI text + DALL·E:

```dotenv
LLM=openai
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4.1
IMAGE_PROVIDER=dall-e-3
```

LLM và image provider **không** cần cùng hãng (Ollama + Pexels là combo phổ biến).

---

## 6. Auth (admin / API / MCP)

Lần đầu mở UI sẽ setup account. Hoặc tạo admin lúc boot:

```dotenv
AUTH_USERNAME=admin
AUTH_PASSWORD=change-me-min-8-chars
```

- REST API: `http://localhost:5001/api/v1/...` với `Authorization: Bearer sk-presenton-...` (tạo key ở **Admin → API keys**).
- MCP: `http://localhost:5001/mcp`, cùng API key.

---

## 7. Database, parse tài liệu, web search

**DB:** không set `DATABASE_URL` thì dùng SQLite trong `app_data`. Compose đã set `MIGRATE_DATABASE_ON_STARTUP=true`. Postgres ví dụ:

```dotenv
DATABASE_URL=postgresql://presenton:password@postgres:5432/presenton
```

Vẫn phải mount `./app_data` — file, export, Mem0, auth **không** nằm hết trong SQL.

**LiteParse** (OCR/parse tài liệu upload): mặc định `LITEPARSE_DPI=120`, `LITEPARSE_NUM_WORKERS=1`. Tăng DPI nếu scan mờ.

**Web search:**

```dotenv
WEB_GROUNDING=true
WEB_SEARCH_PROVIDER=auto
```

`auto` dùng search native của OpenAI/Google/Anthropic. Provider khác: `searxng` + `SEARXNG_BASE_URL`, hoặc `tavily` / `exa` + API key.

Tắt telemetry: `DISABLE_ANONYMOUS_TRACKING=true`.

---

## 8. `.env` mẫu để chạy ngay (OpenAI, không Ollama)

```dotenv
PRESENTON_HTTP_HOST_PORT=5001

LLM=openai
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4.1

IMAGE_PROVIDER=dall-e-3
# hoặc: DISABLE_IMAGE_GENERATION=true

MEM0_ENABLED=true
MEM0_LLM_BASE_URL=https://api.openai.com/v1
MEM0_LLM_API_KEY=sk-...
MEM0_LLM_MODEL=gpt-4.1-mini

AUTH_USERNAME=admin
AUTH_PASSWORD=change-this-password

CAN_CHANGE_KEYS=true
DISABLE_ANONYMOUS_TRACKING=true
```

Rồi:

```powershell
docker compose up production --build
```

Sửa `.env` xong phải recreate:

```powershell
docker compose up production --detach --force-recreate
docker compose logs --tail 100 production
```

---

## 9. Lỗi thường gặp

1. **Mem0 fail dù generate được** — LLM chính OK nhưng Mem0 vẫn gọi `host.docker.internal:11434`. Tắt Mem0 hoặc trỏ `MEM0_LLM_*` đúng endpoint.
2. **Ollama “connection refused”** — trong container, `localhost` là chính container, không phải máy host. Dùng `http://host.docker.internal:11434`.
3. **Build rất lâu / hết disk** — image gồm Chromium, fonts, spaCy, FastEmbed. Cần vài GB trống.
4. **Platform** — Compose default `linux/amd64`. Máy ARM (nếu có) có thể set `PRESENTON_DOCKER_PLATFORM=linux/arm64`.
5. **Không persist data** — luôn giữ volume `./app_data:/app_data`. Xóa folder này là mất deck, user, memory.
6. **Không pull `ghcr.io/presenton/presenton` cho fork này** — compose đang `build:` từ Dockerfile trong repo.

---

## Docs gốc

- [Configuration](https://docs.presenton.ai/open-source/v0.9.0-beta/configuration)
- [Recipes](https://docs.presenton.ai/open-source/v0.9.0-beta/configuration/recipes)
- [Memory](https://docs.presenton.ai/open-source/v0.9.0-beta/core-concepts/memory)
