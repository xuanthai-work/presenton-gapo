# GSlide

AI presentation generator, self-hosted. Tạo slide từ prompt hoặc tài liệu, chỉnh sửa trên web, xuất PPTX/PDF.

Chạy **web-only** qua Docker Compose. LLM và image generation gọi HTTP API bên ngoài (OpenAI, Gemini, hoặc endpoint OpenAI-compatible) — container không cần GPU.

## Chạy

Yêu cầu: Docker Desktop.

```powershell
copy .env.example .env
```

Điền một LLM provider trong `.env` (khóa API có thể để trống — mỗi user tự vào Settings thêm sau), rồi:

```powershell
docker compose up production --build
```

Mở [http://localhost:5001](http://localhost:5001). Lần đầu vào `/` sẽ có Sign in / Create account; tạo tài khoản đầu tiên luôn. Nếu đặt `AUTH_USERNAME` / `AUTH_PASSWORD` trong `.env` thì một user được seed sẵn lúc boot.

Dev (hot-reload):

```powershell
docker compose up development --build
```

Đổi port host bằng `GSLIDE_HTTP_HOST_PORT` (`.env` cũ `PRESENTON_HTTP_HOST_PORT` vẫn được). Dữ liệu (deck, upload, SQLite, memory) nằm trong `./app_data`.

Compose **build `Dockerfile.web` và `Dockerfile.api`**. `production` / `development` là nginx (cổng 5001); Next và FastAPI chạy container riêng. Sau khi sửa `.env`, recreate web + api (+ proxy):

```powershell
docker compose up --build --force-recreate production web api
```

## Cấu hình

Biến môi trường nằm trong `.env` cạnh `docker-compose.yml`. Chỉ cần **một** LLM provider.

| Biến | Mô tả |
| --- | --- |
| `LLM` | `openai` / `google` / `custom` |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | Khi `LLM=openai` |
| `GOOGLE_API_KEY`, `GOOGLE_MODEL` | Khi `LLM=google` |
| `CUSTOM_LLM_URL`, `CUSTOM_LLM_API_KEY`, `CUSTOM_MODEL` | Khi `LLM=custom` |
| `IMAGE_PROVIDER` | `gpt-image-1.5` / `gemini_flash` / `nanobanana_pro` / `openai_compatible` |
| `DISABLE_IMAGE_GENERATION` | `true` để tắt ảnh trên slide |
| `AUTH_USERNAME`, `AUTH_PASSWORD` | Seed user đầu tiên lúc boot (password ≥ 8 ký tự) |
| `CAN_CHANGE_KEYS` | `false` để khóa API key trên UI |
| `MEM0_ENABLED` | Memory theo presentation (mặc định `false`) |
| `WEB_GROUNDING` | Web search. `auto`: native OpenAI/Google; custom LLM dùng SearXNG sidecar |
| `DISABLE_ANONYMOUS_TRACKING` | `true` để tắt telemetry |
| `DATABASE_URL` | Để trống = SQLite trong `app_data` |

Khi bật Mem0, phải trỏ `MEM0_LLM_*` tới endpoint OpenAI-compatible. Chi tiết và ví dụ `.env`: [setup-presonton.md](./setup-presonton.md).

## API

`POST /api/v1/ppt/presentation/generate`

Mọi route `/api/v1/` (trừ auth public) cần `Authorization: Bearer …`. Admin tạo key tại **Admin → API keys** (prefix `sk-gslide-`).

```bash
curl -X POST http://localhost:5001/api/v1/ppt/presentation/generate \
  -H "Authorization: Bearer sk-gslide-YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"content":"Introduction to Machine Learning","n_slides":5,"language":"English","export_as":"pptx"}'
```

Response:

```json
{
  "presentation_id": "…",
  "path": "/app_data/…/Introduction_to_Machine_Learning.pptx",
  "edit_path": "/presentation?id=…"
}
```

Ghép host vào `path` / `edit_path` để thành URL đầy đủ.

## Docs

- [Setup](./setup-presonton.md) — env, Mem0, ảnh, auth, lỗi thường gặp
- [Architecture](./docs/architecture/README.md)
- [Contributing](./CONTRIBUTING.md)

## License

[Apache 2.0](./LICENSE)
