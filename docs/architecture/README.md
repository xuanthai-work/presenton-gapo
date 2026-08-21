# Kiến trúc dự án Presenton

Tài liệu này mô tả cấu trúc các **level** của dự án **Presenton** — một open-source AI Presentation Generator.

## � Mục tiêu

Cung cấp cái nhìn t�ng quan, phân tầng và dễ hiểu về kiến trúc dự án, giúp các thành viên mới (developer, contributor, ops) có thể:

- Nắm được bức tranh toàn cảnh của hệ thống
- Hiểu được cách các thành phần tương tác với nhau
- Tìm được file/module liên quan đến một tính năng cụ thể nhanh chóng
- Định hướng khi thêm/sửa module mới

## � Mục lục các level

| Level | Tài liệu | Phạm vi |
|-------|----------|---------|
| 0 | [00-overview.md](./00-overview.md) | Tổng quan: tech stack, kiểu triển khai, entry points |
| 1 | [01-level-workspace.md](./01-level-workspace.md) | Root workspace: monorepo, các thư mục chính |
| 2 | [02-level-servers.md](./02-level-servers.md) | Hai server chính: FastAPI + NextJS |
| 3 | [03-level-fastapi.md](./03-level-fastapi.md) | FastAPI backend (Python) chi tiết |
| 4 | [04-level-nextjs.md](./04-level-nextjs.md) | NextJS frontend chi tiết |
| 5 | [05-level-export-runtime.md](./05-level-export-runtime.md) | Presentation Export runtime (Chromium-based PPTX/PDF) |
| - | [06-data-flow.md](./06-data-flow.md) | Data flow end-to-end |

## 🏗️ Sơ đồ tổng quan (1 trang)

```mermaid
flowchart TB
    subgraph Client["Client Layer"]
        Browser["🌐 Web Browser<br/>(NextJS App Router)"]
    end

    subgraph Edge["Edge / Reverse Proxy"]
        Nginx["🔀 Nginx :80"]
    end

    subgraph App["Application Layer"]
        NextJS["⚛️ NextJS 16<br/>UI + BFF + Proxy<br/>:3000"]
        FastAPI["🐍 FastAPI<br/>AI + Business Logic + Auth<br/>:8000"]
    end

    subgraph Workers["Async / Background"]
        Tasks["⏳ Async Tasks<br/>(SQLite queue)"]
        LiteParse["📄 liteparse<br/>(document extraction)"]
    end

    subgraph Build["Build / Runtime"]
        Export["📦 presentation-export<br/>(Chromium-based PPTX/PDF)"]
    end

    subgraph Data["Data + Assets"]
        AppData["📁 app_data<br/>(uploads / exports / templates / fonts)"]
        SQLite["🗄️ SQLite / Alembic migrations"]
        ExternalLLM["☁️ External LLM<br/>(OpenAI / Anthropic / Gemini /<br/>Vertex / Bedrock / Ollama / ...)"]
    end

    Browser -->|HTTPS| Nginx
    Nginx --> NextJS
    Nginx --> FastAPI
    NextJS -->|proxy /api/v1, /app_data, /static| FastAPI
    FastAPI --> Tasks
    FastAPI --> LiteParse
    FastAPI --> SQLite
    FastAPI --> AppData
    FastAPI --> ExternalLLM
    FastAPI --> Export
```

## 🚀 Quick start cho người mới

1. Đọc [00-overview.md](./00-overview.md) để hiểu tech stack & kiểu triển khai
2. Đọc [01-level-workspace.md](./01-level-workspace.md) để biết monorepo được tổ chức thế nào
3. Đọc [03-level-fastapi.md](./03-level-fastapi.md) hoặc [04-level-nextjs.md](./04-level-nextjs.md) tùy theo bạn làm backend hay frontend
4. Đọc [06-data-flow.md](./06-data-flow.md) để hiểu một presentation được tạo ra như thế nào
