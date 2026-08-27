# Setup Presenton Gapo (Docker)

Repo: [https://github.com/xuanthai-work/presenton-gapo](https://github.com/xuanthai-work/presenton-gapo)

Fork của Presenton, chạy **web-only** (Docker). Không còn Electron desktop hay MCP server.

Điểm khác quan trọng: `docker-compose.yml` **không dùng image sẵn** (`ghcr.io/presenton/presenton:latest` bị comment), mà **build từ source**. Compose chỉ còn hai service: `production` và `development`. Không có GPU variant — container Presenton chỉ gọi LLM/image qua HTTP API, không chạy model trên GPU. GPU (nếu có) thuộc về server AI riêng, không gắn vào container này.

Trên Windows, cách chạy ổn định nhất là clone + Compose, không phải `docker run` image chính thức.

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

Không cần NVIDIA Container Toolkit cho Presenton. LLM self-host (vLLM, Ollama, …) chạy trên server AI khác; trỏ `CUSTOM_LLM_URL` tới endpoint OpenAI-compatible của server đó.

Đổi port host:

```powershell
$env:GSLIDE_HTTP_HOST_PORT=8080
docker compose up production --build
```

Lần đầu, UI sẽ bắt tạo tài khoản đầu tiên (hoặc set `AUTH_USERNAME` / `AUTH_PASSWORD` như mục 6 để seed sẵn một user lúc boot). Mỗi user tự thêm API key của mình trong Settings; không có khái niệm admin.

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

### OpenAI-compatible (vLLM hoặc bất kỳ self-host OpenAI-compatible nào)

```dotenv
LLM=custom
CUSTOM_LLM_URL=http://host.docker.internal:8000/v1
CUSTOM_LLM_API_KEY=...
CUSTOM_MODEL=your-model-id
```

Các giá trị `LLM` hợp lệ: `openai`, `google`, `custom`.

`CAN_CHANGE_KEYS=false` khóa key trên UI (hữu ích khi deploy nội bộ). Để `true` hoặc để trống nếu muốn đổi provider trong Settings.

---

## 4. Mem0 (memory theo từng presentation)

Mem0 **tắt mặc định** (`MEM0_ENABLED=false` trong compose). Dùng Qdrant + SQLite local, lưu dưới `/app_data/mem0`. Image Docker đã cài sẵn spaCy `en_core_web_sm` và cache FastEmbed (ONNX CPU — không cần GPU).

**Điểm dễ vướng:** Mem0 **không** tự dùng LLM chính. Khi bật Mem0, phải trỏ `MEM0_LLM_*` tới một endpoint OpenAI-compatible (cùng server AI, OpenAI, hoặc URL khác):

| Biến | Default |
|---|---|
| `MEM0_ENABLED` | `false` |
| `MEM0_LLM_MODEL` | (xem compose) |
| `MEM0_LLM_BASE_URL` | (xem compose) |
| `MEM0_DIR` | `/app_data/mem0` |
| `MEM0_EMBEDDER_PROVIDER` | `fastembed` |
| `MEM0_EMBEDDER_MODEL` | `BAAI/bge-small-en-v1.5` |
| `MEM0_EMBEDDING_DIMS` | `384` |

### Bật Mem0 với OpenAI

```dotenv
MEM0_ENABLED=true
MEM0_LLM_BASE_URL=https://api.openai.com/v1
MEM0_LLM_API_KEY=sk-...
MEM0_LLM_MODEL=gpt-4.1-mini
```

Với LLM self-host, trỏ `MEM0_LLM_BASE_URL` / `MEM0_LLM_MODEL` cùng endpoint OpenAI-compatible (thường trùng `CUSTOM_LLM_URL` / `CUSTOM_MODEL`).

Embedder chạy local trong container (FastEmbed / ONNX CPU), không cần API riêng và không dùng GPU.

---

## 5. Ảnh trên slide

Không bắt buộc. Tắt hẳn:

```dotenv
DISABLE_IMAGE_GENERATION=true
```

Hoặc chọn provider:

| `IMAGE_PROVIDER` | Cần thêm |
|---|---|
| `gpt-image-1.5` | `OPENAI_API_KEY` |
| `gemini_flash` | `GOOGLE_API_KEY` |
| `nanobanana_pro` | (provider-specific key) |
| `openai_compatible` | `OPENAI_COMPAT_IMAGE_BASE_URL`, `OPENAI_COMPAT_IMAGE_API_KEY`, `OPENAI_COMPAT_IMAGE_MODEL` |

Ví dụ OpenAI text + GPT Image:

```dotenv
LLM=openai
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4.1
IMAGE_PROVIDER=gpt-image-1.5
```

LLM và image provider **không** cần cùng hãng (Google LLM + OpenAI image là combo phổ biến).

---

## 6. Auth (per-user)

Mỗi user tự đăng ký trên UI Sign in / Create account, hoặc seed sẵn một user lúc boot:

```dotenv
AUTH_USERNAME=alice
AUTH_PASSWORD=change-me-min-8-chars
```

API keys cá nhân cho REST API: `http://localhost:5001/api/v1/...` với `Authorization: Bearer sk-gslide-...` (tạo key trong **Settings → API keys**). Bearer token gắn với user hiện tại; không còn role admin. Fork này không còn MCP endpoint.

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
SEARXNG_BASE_URL=http://searxng:8080
```

`auto` dùng search native của OpenAI/Google. Custom/Gemma dùng SearXNG sidecar. Không còn Tavily / Exa / Brave. `docker compose up development` khởi động luôn service `searxng`.

Tắt telemetry: `DISABLE_ANONYMOUS_TRACKING=true`.

---

## 8. `.env` mẫu để chạy ngay (OpenAI)

```dotenv
GSLIDE_HTTP_HOST_PORT=5001

LLM=openai
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4.1

IMAGE_PROVIDER=gpt-image-1.5
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

1. **Mem0 fail dù generate được** — LLM chính OK nhưng Mem0 vẫn gọi endpoint mặc định không sẵn. Tắt Mem0 hoặc trỏ `MEM0_LLM_*` đúng endpoint.
2. **Build rất lâu / hết disk** — image gồm Chromium, fonts, spaCy, FastEmbed. Cần vài GB trống.
3. **Platform** — Compose default `linux/amd64`. Máy ARM (nếu có) có thể set `GSLIDE_DOCKER_PLATFORM=linux/arm64`.
4. **Không persist data** — luôn giữ volume `./app_data:/app_data`. Xóa folder này là mất deck, user, memory.
5. **Không pull `ghcr.io/presenton/presenton` cho fork này** — compose build `Dockerfile.web` và `Dockerfile.api` trong repo.
6. **`production-gpu` / `development-gpu` không còn** — dùng `production` hoặc `development`. GPU cho LLM nằm ở server AI, không trong container Presenton.

---

## Docs gốc

- [Configuration](https://docs.presenton.ai/open-source/v0.9.0-beta/configuration)
- [Recipes](https://docs.presenton.ai/open-source/v0.9.0-beta/configuration/recipes)
- [Memory](https://docs.presenton.ai/open-source/v0.9.0-beta/core-concepts/memory)
