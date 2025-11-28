# GetFitByHumanAI — Phase 1 (RAG Core System)

> Intelligent Fitness Assistant powered by OpenAI + Qdrant  
> Phase 1 focuses on knowledge ingestion, semantic retrieval, contextual Q&A, and system monitoring.

---

## Overview

**GetFitByHumanAI** is a modular backend that ingests domain-specific knowledge (fitness, nutrition, training science, etc.) from PDFs, converts it into vector embeddings, and exposes APIs for AI-driven semantic search and chat.

This phase establishes the **Retrieval-Augmented Generation (RAG)** foundation using:

- OpenAI for embeddings + completions  
- Qdrant Cloud for vector storage and similarity search  
- A clean Node/Express service layer with logging, health checks, and observability hooks.

Phase 1 RAG + backend pipeline has been fully tested with unit, integration, E2E, and non-functional (load/soak/stress) tests, and is considered **production-ready**.

---

## Tech Stack

| Layer | Technology |
|--------|-----------|
| **Runtime** | Node.js (CommonJS) |
| **Framework** | Express.js |
| **Vector Database** | Qdrant Cloud |
| **AI Provider** | OpenAI API (Embeddings + GPT-4o-mini) |
| **PDF Parsing** | `pdf-parse` |
| **File Uploads** | Multer |
| **Logging** | Custom logger |
| **Environment** | dotenv (`.env`) |
| **Caching** | Redis |
| **Queues (future phases)** | BullMQ + Redis |
| **Testing & Perf** | Jest, Supertest, Autocannon |

---

## Architecture Flow

```text
📄 PDF Upload (REST / CLI)
   ↓
📖 PDF Parser (pdfReader.js)
   ↓
✂️ Text Chunker (chunker.js)
   ↓
🧠 OpenAI Embeddings
   ↓
💾 Vector Storage in Qdrant (getfit_staging / getfit_prod)
   ↓
🔍 Semantic Search
   ↓
💬 RAG Answer Generation (OpenAI completion + citations)
```

---

## 🗂 Folder Structure

```text
getfit_ai_training/
│
├── src/
│   ├── cli/
│   ├── config/
│   ├── routes/
│   ├── services/
│   ├── utils/
│   └── app.js
│
├── logs/
│   └── train_YYYY-MM-DD.log
│
├── tests/
└── .env
```

---

## Environment Variables (`.env`)

```bash
OPENAI_API_KEY=your_openai_key
OPENAI_PROJECT_ID=your_project_id
OPENAI_ORG_ID=your_org_id

QDRANT_URL=https://your-qdrant-instance-url
QDRANT_API_KEY=your_qdrant_api_key
QDRANT_COLLECTION=getfit_staging

REDIS_URL=redis://localhost:6379
NODE_ENV=development
PORT=4000
```

---

## Core Modules

| File | Purpose |
|------|---------|
| `pdfReader.js` | Extracts raw text from PDFs. |
| `chunker.js` | Splits text into overlapping chunks. |
| `embedding.js` | Generates embeddings using OpenAI. |
| `ingest.service.js` | PDF → chunks → embeddings → Qdrant. |
| `query.service.js` | Performs semantic search. |
| `delete.service.js` | Deletes vectors by source. |
| `stats.service.js` | Returns Qdrant collection stats. |
| `queryAnswer.service.js` | Full RAG pipeline. |

---

## REST API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| **POST** | `/api/train` | Train a new document. |
| **POST** | `/api/query` | Semantic search. |
| **POST** | `/api/query-answer` | Full RAG response. |
| **DELETE** | `/api/delete` | Delete data by `source_file`. |
| **GET** | `/api/stats` | Get Qdrant stats. |
| **GET** | `/api/train-status/status` | Training progress. |
| **GET** | `/api/train-status/list` | List trained docs. |
| **GET** | `/api/queue-status` | Queue health. |
| **GET** | `/api/health` | System health. |
| **GET** | `/api/health/memory` | Runtime memory. |

---

## CLI Tools

```bash
node src/cli/train_interactive.cjs
node src/cli/query.cjs
node src/cli/interactive.cjs
node src/cli/delete.cjs "file.pdf"
```

---

## Qdrant Schema

```json
{
  "id": "uuid",
  "vector": [...],
  "payload": {
    "text": "Chunk text",
    "domain": "Architecture",
    "source_file": "file.pdf",
    "chunk_index": 0,
    "version_tag": "v1.0.0",
    "created_at": "2025-10-30T20:08:00Z"
  }
}
```

---

## Testing Summary

- Unit + integration tests for core modules  
- E2E flows validated: train → query → answer → delete → stats  
- Stable 600–900 RPS under load  
- No memory leaks in soak tests  
- Stress test stable up to 100 users burst

---

## Next Phases

- Phase 2: Authentication
- Phase 3: Hybrid memory
- Phase 4: Dashboards
- Phase 5: Full AWS deployment

---

## 🧑‍💻 Author

**Sai Krishna Mohan Kolla**  
Full-Stack Engineer | AI & Cloud Systems Architect
