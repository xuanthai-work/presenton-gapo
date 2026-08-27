# Level 3 — FastAPI Backend (Python)

## 📂 Sơ đồ tổng thể FastAPI

```mermaid
graph TB
    subgraph FastAPI["servers/fastapi/"]
        Entry["server.py<br/>(uvicorn entry)"]
        App["api/main.py<br/>(FastAPI app init)"]
        Lifespan["api/lifespan.py<br/>(startup/shutdown)"]
        Middlewares["api/middlewares.py<br/>(CORS, Auth, EnvUpdate)"]
        Migrations["migrations.py"]
    end

    subgraph V1["api/v1/"]
        PptRouter["ppt/router.py<br/>/api/v1/ppt/*"]
        AuthRouter["auth/router.py<br/>/api/v1/auth/*"]
        SettingsRouter["settings/router.py<br/>/api/v1/settings/*"]
        AsyncRouter["async_tasks/router.py"]
        MockRouter["mock/router.py"]
        WebhookRouter["webhook/router.py"]
    end

    subgraph PptEndpoints["api/v1/ppt/endpoints/"]
        Chat["chat.py"]
        Community["community.py"]
        Google["google.py"]
        OpenAI["openai.py"]
        Files["files.py"]
        Fonts["fonts.py"]
        Icons["icons.py"]
        Images["images.py"]
        Layouts["layouts.py"]
        Outlines["outlines.py"]
        Presentation["presentation.py"]
        Prompts["prompts.py"]
        Slide["slide.py"]
        Template["template.py"]
        Theme["theme.py"]
        ThemeGen["theme_generate.py"]
    end

    subgraph Services["services/"]
        ChatSvc["chat/"]
        DB["database.py"]
        DocConv["document_conversion_service.py"]
        DocLoad["documents_loader.py"]
        ExportTask["export_task_service.py"]
        IconFinder["icon_finder_service.py"]
        ImageGen["image_generation_service.py"]
        LiteParse["liteparse_service.py"]
        Mem0["mem0_*_memory.py"]
        OfficeDoc["office_document_service.py"]
        Cloud["presenton_cloud.py"]
        Settings["provider_settings.py"]
        Scorer["score_based_chunker.py"]
        TempFile["temp_file_service.py"]
        Webhook["webhook_service.py"]
    end

    subgraph Utils["utils/"]
        LlmCalls["llm_calls/<br/>(generate outlines, slide,<br/>smart presentation, ...)"]
        LlmUtils["llm_*.py<br/>(provider registry, clients)"]
        Oauth["oauth/<br/>(PKCE helpers)"]
        ProcessSlides["process_slides.py"]
        ExportUtils["export_utils.py"]
        PptUtils["ppt_utils.py"]
        Validators["validators.py"]
        Others["asset, file, mime,<br/>path, env helpers"]
    end

    subgraph Models["models/"]
        Pydantic["(pydantic models:<br/>chat, presentation,<br/>slide, theme, ...)"]
        SqlModels["sql/<br/>(SQLAlchemy ORM)"]
    end

    subgraph Constants["constants/"]
        Documents["documents.py"]
        Llm["llm.py"]
        Presentation["presentation.py"]
    end

    Entry --> App
    App --> Lifespan
    App --> Middlewares
    App --> V1

    PptRouter --> PptEndpoints

    Services -.uses.-> Models
    Services -.uses.-> Utils
    PptEndpoints -.uses.-> Services
    PptEndpoints -.uses.-> Utils
    Utils -.uses.-> Constants
```

## 🚀 App initialization (`api/main.py`)

```mermaid
sequenceDiagram
    participant S as server.py
    participant A as api/main.py
    participant L as api/lifespan.py
    participant U as uvicorn

    S->>U: uvicorn.run("api.main:app", ...)
    U->>A: import app
    A->>L: app_lifespan (FastAPI lifespan)
    Note over L: Khởi tạo env, userConfig,<br/>SQLAlchemy, vector stores
    A->>A: Mount /app_data, /static
    A->>A: CORS middleware (allow NextJS origin)
    A->>A: SessionAuthMiddleware
    A->>A: UserConfigEnvUpdateMiddleware
    A->>A: include routers (ppt, auth, settings, ...)
```

## 🌐 Routers (`api/v1/`)

### PPT Router — `api/v1/ppt/router.py`

Prefix: `/api/v1/ppt`. Đây là router lớn nhất, chứa toàn bộ logic nghiệp vụ:

```mermaid
graph LR
    Ppt["/api/v1/ppt"]

    Ppt --> Files["/files<br/>(upload, download)"]
    Ppt --> Fonts["/fonts<br/>(font upload/management)"]
    Ppt --> Outlines["/outlines<br/>(SSE generate outline)"]
    Ppt --> Slide["/slide<br/>(SSE generate slide)"]
    Ppt --> Images["/images<br/>(generate images)"]
    Ppt --> Icons["/icons<br/>(icon library)"]
    Ppt --> OpenAI["/openai<br/>(auth + models)"]
    Ppt --> Google["/google<br/>(auth + models)"]
    Ppt --> Presentation["/presentation<br/>(CRUD presentation)"]
    Ppt --> Themes["/themes<br/>(CRUD theme)"]
    Ppt --> ThemeGen["/theme-generate<br/>(AI theme gen)"]
    Ppt --> Chat["/chat<br/>(multi-turn chat)"]
    Ppt --> Template["/template<br/>(user template upload)"]
    Ppt --> Community["/community<br/>(community templates)"]
```

### Auth Router — `api/v1/auth/`

OAuth2 PKCE flow, session-based. There is **no admin persona**: every signed-in user is the same role. `bootstrap.py` seeds a normal user (the legacy first-admin bootstrap is renamed to `bootstrap_database_user`).
- `assets.py` — auth assets
- `bootstrap.py` — bootstrap first user from `AUTH_USERNAME`/`AUTH_PASSWORD`
- `config.py` — auth config
- `context.py` — auth context (owner_id only)
- `internal.py` — internal routes
- `presenton_oauth.py` — OAuth provider
- `principal.py` — current user principal
- `rate_limit.py` — rate limiting
- `router.py` — auth routes (login/register/logout/status)
- `schemas.py` — pydantic schemas
- `token.py` — token management (Bearer tokens are current-user scoped)
- `users.py` — user management

### Settings Router — `api/v1/settings/router.py`

Per-user provider overlay:
- `GET /api/v1/settings/provider` — effective config (overlay ∪ process env)
- `PUT /api/v1/settings/provider` — save current user's overlay (sanitized)

The middleware loads the current user's overlay into a `ContextVar` so `get_*_env()` providers see overlay before `os.environ`. Overlay **does not** store `AUTH_*`, `DATABASE_URL`, `DISABLE_AUTH`, etc.

### Async Tasks — `api/v1/async_tasks/router.py`

Tracking cho async tasks (export, generation).

### Mock — `api/v1/mock/router.py`

Mock endpoints cho testing.

### Webhook — `api/v1/webhook/router.py`

External webhooks (Presenton Cloud integration).

## 🧩 Services layer (`services/`)

Service layer chứa **business logic**, được các endpoints gọi:

| Service | Vai trò |
|---------|---------|
| `database.py` | SQLAlchemy session, models |
| `chat/` | Multi-turn chat logic |
| `document_conversion_service.py` | Convert PDF/DOCX/PPTX → text |
| `documents_loader.py` | Load documents cho RAG |
| `export_task_service.py` | Background export tasks |
| `icon_finder_service.py` | Search vector icons |
| `image_generation_service.py` | AI image generation |
| `liteparse_service.py` | Wrap llama-index liteparse |
| `mem0_oss_memory.py` | Local memory layer |
| `mem0_presentation_memory_service.py` | Memory theo presentation |
| `office_document_service.py` | PowerPoint/Word document processing |
| `presenton_cloud.py` | Cloud integration |
| `presenton_cloud_persistence.py` | Cloud storage |
| `presenton_cloud_proxy.py` | Cloud proxy |
| `provider_settings.py` | LLM provider settings |
| `score_based_chunker.py` | Chunking cho RAG |
| `temp_file_service.py` | Temp file management |
| `webhook_service.py` | Webhook delivery |
| `concurrent_service.py` | Concurrency utils |

## 🛠️ Utils layer (`utils/`)

### LLM Calls (`utils/llm_calls/`)

```mermaid
graph TB
    LlmCalls["llm_calls/"]
    LlmCalls --> EditSlide["edit_slide.py<br/>(regenerate 1 slide)"]
    LlmCalls --> EditSlideHtml["edit_slide_html.py"]
    LlmCalls --> GenOutlines["generate_presentation_outlines.py<br/>(bước 1)"]
    LlmCalls --> GenStructure["generate_presentation_structure.py"]
    LlmCalls --> GenSlide["generate_slide_content.py<br/>(bước 2)"]
    LlmCalls --> GenSmart["generate_smart_presentation.py"]
    LlmCalls --> GenWebSearch["generate_web_search_query.py"]
    LlmCalls --> SelectType["select_slide_type_on_edit.py"]
```

Đây là các **prompt chains** chính của Presenton. Mỗi file là 1 bước trong pipeline sinh presentation.

### LLM Utils (`utils/llm_*.py`)

FastAPI gọi LLM bằng SDK native (`openai`, `google-genai`), không còn package `llmai`. Provider hợp lệ: `openai`, `google`, `custom` (OpenAI-compatible URL).

```mermaid
graph LR
    LlmMessages["llm_messages.py<br/>(message/tool dataclasses)"]
    LlmConfig["llm_config.py<br/>(provider config)"]
    LlmProvider["llm_provider.py<br/>(openai / google / custom clients)"]
    LlmUtils["llm_utils.py<br/>(stream_generate_events)"]
    LlmClient["llm_client_error_handler.py"]
    ProviderErr["provider_error_messages.py"]
    ModelAvail["model_availability.py"]
    GetDynModels["get_dynamic_models.py"]

    LlmConfig --> LlmProvider
    LlmMessages --> LlmUtils
    LlmProvider --> LlmUtils
    LlmUtils --> LlmClient
    LlmUtils --> ProviderErr
    LlmProvider --> ModelAvail
    ModelAvail --> GetDynModels
```

### OAuth (`utils/oauth/`)

OAuth2 PKCE helpers:
- `pkce.py` — PKCE helpers

### Other utils

| File | Vai trò |
|------|---------|
| `process_slides.py` | Pipeline xử lý slide sau khi LLM sinh |
| `export_utils.py` | Helpers cho export PPTX/PDF |
| `ppt_utils.py` | python-pptx helpers |
| `validators.py` | Validators chung |
| `parsers.py` | Parsers |
| `sse.py` | SSE helpers (Server-Sent Events) |
| `theme_utils.py` | Theme processing |
| `template_vision_errors.py` | Vision errors |
| `smart_slide_layout.py` | Smart layout selection |
| `web_search.py` | Web search provider |
| `icon_weights.py` | Icon ranking |
| `font_uploads.py` | Font upload |
| `download_helpers.py` | HTTP download |
| `image_provider.py` | Image gen provider |
| `image_generation_error.py` | Image gen errors |
| `latex_text.py` | LaTeX rendering |
| `mime_types.py` | MIME types |
| `path_helpers.py` | Path resolution |
| `asset_directory_utils.py` | Asset dirs |
| `datetime_utils.py` | Date utils |
| `dict_utils.py` | Dict utils |
| `dummy_functions.py` | Test fixtures |
| `error_handling.py` | Errors |
| `filename_utils.py` | Filename sanitization |
| `file_utils.py` | File utils |
| `outline_limits.py` | Outline limits |
| `outline_utils.py` | Outline processing |
| `runtime_limits.py` | Runtime limits |
| `schema_utils.py` | Schema utils |
| `set_env.py` | Env setup |
| `user_config.py`, `user_config_store.py` | User config |
| `get_env.py` | Env getters |
| `async_iterator.py` | Async iter helpers |
| `available_models.py` | Model registry (OpenAI / Gemini / custom URL) |
| `llm_messages.py` | Message/tool/response shapes thay `llmai.shared` |

## 📦 Models (`models/`)

```mermaid
graph LR
    Models["models/"]
    Models --> Pydantic["Pydantic models<br/>(api request/response)"]
    Models --> Sql["sql/<br/>(SQLAlchemy ORM)"]

    Pydantic --> ApiErr["api_error_model"]
    Pydantic --> ChatM["chat"]
    Pydantic --> Decomposed["decomposed_file_info"]
    Pydantic --> DocChunk["document_chunk"]
    Pydantic --> GenReq["generate_presentation_request"]
    Pydantic --> ImgPrompt["image_prompt"]
    Pydantic --> JsonPath["json_path_guide"]
    Pydantic --> PresPath["presentation_and_path"]
    Pydantic --> PresFromTpl["presentation_from_template"]
    Pydantic --> PresLayout["presentation_layout"]
    Pydantic --> PresOutline["presentation_outline_model"]
    Pydantic --> PresStruct["presentation_structure_model"]
    Pydantic --> PresWithSlides["presentation_with_slides"]
    Pydantic --> SlideLayoutIdx["slide_layout_index"]
    Pydantic --> SseResp["sse_response"]
    Pydantic --> ThemeData["theme_data"]
    Pydantic --> UserConfig["user_config"]
```

## 📦 Constants (`constants/`)

| File | Vai trò |
|------|---------|
| `documents.py` | Doc config |
| `llm.py` | LLM defaults |
| `presentation.py` | Presentation defaults |

## 🗃️ Database (`alembic/` + `migrations.py`)

- Alembic migrations cho SQLAlchemy ORM
- `migrations.py` chạy upgrade on startup
- Database mặc định là **SQLite**

## 🖼️ Static assets (`static/` & `assets/`)

| Folder | Nội dung |
|--------|----------|
| `static/icons/` | SVG icon library (được fallback placeholder) |
| `static/themes/` | Theme assets |
| `assets/` | Icon vectorstore (JSON embeddings) |

## 📡 SSE streaming

Presenton dùng **Server-Sent Events** cho:
- Outline generation (real-time từng slide)
- Slide content generation
- Export progress

Helpers ở `utils/sse.py`.

## Một request điển hình: generate outline

```mermaid
sequenceDiagram
    participant N as NextJS
    participant R as /api/v1/ppt/outlines
    participant Svc as outline service
    participant Llm as llm_calls
    participant LLM as LLM Provider

    N->>R: POST /api/v1/ppt/outlines (prompt, slides count)
    R->>R: Validate via pydantic model
    R->>Svc: Service method
    Svc->>Llm: generate_presentation_outlines.py
    Llm->>LLM: streaming completion
    LLM-->>Llm: tokens
    Llm-->>Svc: structured JSON chunks
    Svc-->>R: SSE chunks
    R-->>N: SSE response
```
