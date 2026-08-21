# Data Flow — End-to-End

File này mô tả các luồng dữ liệu chính xuyên suốt các layer của Presenton.

## 1️⃣ Generate outline từ prompt

```mermaid
sequenceDiagram
    actor User
    participant UI as NextJS UI<br/>(/upload)
    participant Bff as NextJS BFF
    participant API as FastAPI<br/>/api/v1/ppt/outlines
    participant Svc as outline service
    participant Calls as llm_calls/<br/>generate_presentation_outlines
    participant LLM as LLM Provider

    User->>UI: Nhập prompt + chọn số slides
    UI->>Bff: POST /api/v1/ppt/outlines
    Bff->>API: POST /api/v1/ppt/outlines (rewrite)
    API->>API: Validate (pydantic)
    API->>API: Resolve LLM config từ userConfig
    API->>Svc: Call outline service
    Svc->>Calls: generate_presentation_outlines
    Calls->>LLM: streaming completion (system + user prompt)
    LLM-->>Calls: JSON tokens (outline schema)
    Calls->>Calls: Parse + validate JSON
    Calls-->>Svc: structured outline dict
    Svc-->>API: SSE chunks
    API-->>Bff: SSE chunks
    Bff-->>UI: SSE chunks
    UI->>UI: Render outline preview
    UI-->>User: Hiển thị outline
```

## 2️⃣ Generate slide content

```mermaid
sequenceDiagram
    actor User
    participant UI as NextJS UI<br/>(/outline)
    participant API as FastAPI<br/>/api/v1/ppt/slide
    participant Calls as llm_calls/<br/>generate_slide_content
    participant LLM as LLM Provider
    participant Slide as slide service

    User->>UI: Click "Generate slides"
    UI->>API: POST /api/v1/ppt/slide (outline + layouts)
    API->>API: Resolve LLM config
    API->>Slide: slide service
    loop Mỗi slide trong outline
        Slide->>Calls: generate_slide_content(slide_index)
        Calls->>LLM: completion
        LLM-->>Calls: JSON (slide content)
        Calls-->>Slide: parsed content
        Slide-->>API: SSE chunk for this slide
    end
    API-->>UI: SSE stream all slides
    UI-->>User: Slides hiển thị
```

## 3️⃣ Edit slide (slide editor)

```mermaid
sequenceDiagram
    actor User
    participant Editor as Slide Editor<br/>(Konva canvas)
    participant Store as Redux<br/>(presentationGeneration)
    participant Bff as NextJS BFF
    participant API as FastAPI<br/>/api/v1/ppt/presentation

    User->>Editor: Drag shape / sửa text
    Editor->>Store: dispatch(updateElement)
    Editor->>Editor: Re-render Konva
    User->>Editor: Click "Save"
    Editor->>Bff: POST /api/v1/ppt/presentation/:id
    Bff->>API: POST /api/v1/ppt/presentation/:id
    API->>API: Save to SQLite (SQLAlchemy)
    API-->>Bff: 200 OK
    Bff-->>Editor: success
```

## 4️⃣ Upload document → RAG context

```mermaid
sequenceDiagram
    actor User
    participant UI as NextJS<br/>(/upload)
    participant Bff as NextJS BFF<br/>(/api/upload-image, /api/v1/ppt/files)
    participant API as FastAPI
    participant Lite as liteparse_service
    participant Chunker as score_based_chunker
    participant Mem0 as mem0_*_memory

    User->>UI: Upload PDF/DOCX/PPTX
    UI->>Bff: POST /api/v1/ppt/files
    Bff->>API: POST /api/v1/ppt/files
    API->>API: Save to app_data/uploads/
    API->>Lite: Extract text (liteparse)
    Lite-->>API: raw text
    API->>Chunker: Score-based chunking
    Chunker-->>API: chunks
    API->>Mem0: Store memory embeddings
    Mem0-->>API: indexed
    API-->>Bff: file_id
    Bff-->>UI: file_id
    UI->>UI: User nhập prompt
    UI->>API: POST /api/v1/ppt/outlines<br/>(prompt + file_ids)
    API->>Mem0: Retrieve relevant chunks
    Mem0-->>API: context
    API->>LLM: prompt + context
    LLM-->>API: outline
```

## 5️⃣ Image generation (nếu user bật)

```mermaid
sequenceDiagram
    participant Slide as slide generation
    participant API as FastAPI<br/>/api/v1/ppt/images
    participant ImgSvc as image_generation_service
    participant Provider as Image Provider<br/>(OpenAI / Stability / ...)
    participant Storage as app_data/images/

    Slide->>API: Request image for slide
    API->>ImgSvc: generate
    ImgSvc->>Provider: POST image generation
    Provider-->>ImgSvc: image URL or bytes
    ImgSvc->>Storage: Save to app_data/images/
    ImgSvc-->>API: image URL (/app_data/images/...)
    API-->>Slide: image URL
```

## 6️⃣ Theme generation (AI theme)

```mermaid
sequenceDiagram
    actor User
    participant UI as NextJS<br/>(/theme)
    participant API as FastAPI<br/>/api/v1/ppt/theme-generate
    participant ThemeSvc as theme_generate
    participant LLM as LLM Provider

    User->>UI: Click "Generate theme"
    UI->>API: POST /api/v1/ppt/theme-generate<br/>(prompt or reference)
    API->>ThemeSvc: service
    ThemeSvc->>LLM: prompt (theme schema)
    LLM-->>ThemeSvc: JSON theme (colors, fonts, ...)
    ThemeSvc-->>API: theme data
    API-->>UI: theme
    UI-->>User: Preview theme
```

## 7️⃣ Export PPTX / PDF

```mermaid
sequenceDiagram
    actor User
    participant UI as NextJS<br/>(/presentation)
    participant Bff as NextJS BFF<br/>(/api/export-presentation)
    participant API as FastAPI<br/>/api/v1/ppt/presentation (export)
    participant ExpTask as export_task_service
    participant Export as presentation-export
    participant Chrom as Chromium
    participant Py as python-pptx

    User->>UI: Click "Export PPTX"
    UI->>Bff: POST /api/export-presentation<br/>(slides data, layout)
    Bff->>API: POST /api/v1/ppt/presentation/export
    API->>ExpTask: Create async task
    ExpTask->>Export: Run export (spawn process)
    Export->>Chrom: headless render slide HTML → PNG
    Chrom-->>Export: rendered images
    Export->>Py: Compose PPTX with python-pptx
    Py-->>Export: .pptx file
    Export->>Export: Save to app_data/exports/
    Export-->>ExpTask: file path
    ExpTask-->>API: task done
    API-->>Bff: download URL
    Bff-->>UI: download URL
    UI-->>User: Download link
```

## 8️⃣ Auth flow (OAuth2 PKCE)

```mermaid
sequenceDiagram
    actor User
    participant N as NextJS<br/>(/login)
    participant F as FastAPI<br/>/api/v1/auth
    participant Oauth as OAuth provider<br/>(Google / OpenAI Codex / ...)
    participant DB as SQLite

    User->>N: Click "Login with X"
    N->>F: GET /api/v1/auth/start?provider=X
    F->>F: Generate PKCE verifier + challenge
    F->>F: Generate state
    F->>Oauth: 302 redirect to authorize URL
    Oauth-->>User: Login + consent
    User->>Oauth: Approve
    Oauth->>F: GET /api/v1/auth/callback?code=...&state=...
    F->>F: Verify state
    F->>Oauth: Exchange code (with PKCE verifier)
    Oauth-->>F: access_token + refresh_token
    F->>DB: Store user + tokens
    F->>F: Create session
    F-->>N: 302 redirect with session cookie
    N-->>User: Logged in
```

## 9️⃣ Multi-turn chat editing

```mermaid
sequenceDiagram
    actor User
    participant UI as Chat Panel<br/>(slide editor)
    participant API as FastAPI<br/>/api/v1/ppt/chat
    participant ChatSvc as chat service
    participant LLM as LLM Provider

    User->>UI: "Make slide 3 title red"
    UI->>API: POST /api/v1/ppt/chat<br/>(message + presentation context)
    API->>ChatSvc: process
    ChatSvc->>LLM: prompt with slide context
    LLM-->>ChatSvc: response (intent + action)
    ChatSvc->>ChatSvc: Apply action to slides
    ChatSvc-->>API: updated slides
    API-->>UI: new slide state
    UI-->>User: Updated slide
```

## 🔟 Community template browsing

```mermaid
sequenceDiagram
    actor User
    participant UI as NextJS<br/>(/community)
    participant API as FastAPI<br/>/api/v1/ppt/community
    participant Cloud as Presenton Cloud<br/>(optional)

    User->>UI: Visit /community
    UI->>API: GET /api/v1/ppt/community
    alt Self-hosted mode
        API->>API: List local community templates
    else Cloud mode
        API->>Cloud: Fetch templates
        Cloud-->>API: templates
    end
    API-->>UI: templates list
    UI-->>User: Browse + preview
    User->>UI: Import template
    UI->>API: POST /api/v1/ppt/community/:id/import
    API->>API: Save to app_data/templates/
    API-->>UI: success
```

## 📊 Tổng kết luồng dữ liệu

```mermaid
flowchart LR
    User((User))

    subgraph InputLayer["Input"]
        Prompt["Prompt / Document<br/>Template"]
    end

    subgraph ProcessingLayer["Processing"]
        Outline["Outline Gen<br/>(LLM streaming)"]
        SlideGen["Slide Gen<br/>(LLM streaming)"]
        ImageGen["Image Gen<br/>(Optional)"]
        ThemeGen["Theme Gen<br/>(Optional)"]
        Edit["Edit<br/>(Slide Editor)"]
    end

    subgraph StorageLayer["Storage"]
        SQLite[("SQLite")]
        Uploads["app_data/uploads"]
        Images["app_data/images"]
        Templates["app_data/templates"]
        Exports["app_data/exports"]
    end

    subgraph OutputLayer["Output"]
        PPTX["PPTX"]
        PDF["PDF"]
        HTML["HTML (in-app)"]
    end

    User --> Prompt
    Prompt --> Outline
    Outline --> SlideGen
    SlideGen --> Edit
    Edit -->|save| SQLite
    Prompt -->|upload| Uploads
    Uploads --> SlideGen
    SlideGen -->|generate images| ImageGen
    ImageGen --> Images
    SlideGen -->|theme| ThemeGen
    Edit -->|export| PPTX
    Edit -->|export| PDF
    Edit -->|preview| HTML
    Templates --> SlideGen
    Exports --> User
```

## 🔑 Điểm chính cần nhớ

1. **Mọi LLM call là streaming** (SSE) — UI cập nhật real-time.
2. **`/api/v1/*` luôn qua NextJS proxy** — không có cách nào browser gọi trực tiếp FastAPI trong prod.
3. **`app_data/` là single source of truth** cho runtime state (uploads, exports, fonts, templates).
4. **SQLite** lưu user config, presentations, themes — dùng Alembic migrations.
5. **Export là async** — có thể track qua `/api/v1/async-tasks`.
6. **Slide editor state** ở Redux (client) + slide layout code là **user-defined Tailwind+TS** (compile runtime qua Babel).
7. **Templates** có thể là built-in (trong `/templates/`) hoặc user-uploaded (custom-template flow).
