# 🧠 GetFitByHumanAI — Phase 1 (RAG Core System)

> Intelligent Fitness Assistant powered by OpenAI + Qdrant  
> Phase 1 focuses on knowledge ingestion, semantic retrieval, contextual Q&A, and system monitoring.

---

## 🚀 Overview

**GetFitByHumanAI** is a modular backend designed to ingest domain-specific knowledge (e.g., fitness, nutrition, architecture) from PDFs, convert it into vector embeddings, and enable AI-driven semantic search and chat interactions.

This phase establishes the **Retrieval-Augmented Generation (RAG)** foundation — integrating OpenAI for embeddings and completions, and Qdrant Cloud for vector storage and retrieval.

---

## ⚙️ Tech Stack

| Layer | Technology |
|--------|-------------|
| **Runtime** | Node.js (CommonJS) |
| **Framework** | Express.js |
| **Vector Database** | Qdrant Cloud |
| **AI Provider** | OpenAI API (Embeddings + GPT-4o-mini) |
| **PDF Parsing** | `pdf-parse` |
| **File Uploads** | Multer |
| **Logging** | Custom logger (`winston` style) |
| **Environment** | dotenv (.env) |
| **Testing** | Postman |

---

## 🧩 Architecture Flow

```
📄 PDF Upload
   ↓
📖 PDF Parser (pdfReader.js)
   ↓
✂️ Text Chunker (chunker.js)
   ↓
🧠 Embeddings via OpenAI
   ↓
💾 Vector Storage in Qdrant (getfit_staging)
   ↓
🔍 Semantic Search → RAG Chat Generation
```

---

## 🗂 Folder Structure

```
getfit_ai_training/
│
├── src/
│   ├── cli/                  # Command-line tools
│   ├── config/               # OpenAI + Qdrant clients, env
│   ├── routes/               # Express route files
│   ├── services/             # Core logic for training/query/delete
│   ├── utils/                # Helper utilities
│   └── app.js                # Express app entry
│
├── logs/                     # Training logs
│   └── train_YYYY-MM-DD.log
│
└── .env                      # Environment configuration
```

---

## 🔧 Environment Variables (`.env`)

```bash
OPENAI_API_KEY=your_openai_key
OPENAI_PROJECT_ID=your_project_id
OPENAI_ORG_ID=your_org_id
QDRANT_URL=https://your-qdrant-instance-url
QDRANT_API_KEY=your_qdrant_api_key
QDRANT_COLLECTION=getfit_staging
```

---

## 🧱 Core Modules

| File | Purpose |
|------|----------|
| `pdfReader.js` | Extracts raw text from PDFs |
| `chunker.js` | Splits text into overlapping chunks |
| `embedding.js` | Generates embeddings using OpenAI |
| `ingest.service.js` | Orchestrates ingestion pipeline |
| `query.service.js` | Performs semantic search in Qdrant |
| `delete.service.js` | Deletes all vectors for a given source file |
| `stats.service.js` | Returns Qdrant collection statistics |
| `queryAnswer.service.js` | RAG: retrieve + generate final AI answer |

---

## 🌐 REST API Endpoints

| Method | Endpoint | Description |
|---------|-----------|-------------|
| **POST** | `/api/train` | Upload and train a new document (PDF → chunks → embeddings) |
| **POST** | `/api/query` | Retrieve semantic matches for a query |
| **POST** | `/api/query-answer/answer` | Full RAG response: retrieval + OpenAI summarization |
| **DELETE** | `/api/delete` | Delete all vectors for a `source_file` |
| **GET** | `/api/stats` | Get Qdrant collection stats |
| **GET** | `/api/train-status/status` | Show training progress and indexed fields |
| **GET** | `/api/train-status/list` | List all trained documents |
| **GET** | `/health` | System health check (OpenAI + Qdrant) |

---

## 💻 CLI Tools

| Command | Description |
|----------|-------------|
| `train_interactive.cjs` | Interactive ingestion from terminal |
| `query.cjs` | Semantic search CLI |
| `interactive.cjs` | RAG chat session CLI |
| `delete.cjs` | Delete data for specific source |

Run them like:

```bash
node src/cli/train_interactive.cjs
node src/cli/query.cjs
node src/cli/interactive.cjs
node src/cli/delete.cjs "your_file.pdf"
```

---

## 🧠 Qdrant Schema

**Collection:** `getfit_staging`

**Payload Example**
```json
{
  "id": "uuid",
  "vector": [0.23, 0.45, ...],
  "payload": {
    "text": "Chunked paragraph text here...",
    "domain": "Architecture",
    "source_file": "GetFitByHumanAI_Complete_Architecture.pdf",
    "chunk_index": 0,
    "created_at": "2025-10-30T20:08:00Z"
  }
}
```

**Indexed Fields**
- `domain`
- `source_file`

---

## 🧪 Postman Test Scenarios

### 🧩 Train a Document
**POST** `/api/train`  
Form-Data:
| Key | Type | Value |
|-----|------|--------|
| pdf | File | upload PDF |
| domain | Text | Architecture |
| source_file | Text | GetFitByHumanAI_Complete_Architecture.pdf |

Expected:
```json
{ "ok": true, "inserted": 12, "collection": "getfit_staging" }
```

### 🔍 Query
**POST** `/api/query`
```json
{ "query": "Describe the architecture" }
```

### 💬 RAG Answer
**POST** `/api/query/answer`
```json
{ "query": "Describe the architecture" }
```

### 🗑 Delete
**DELETE** `/api/delete`
```json
{ "source_file": "GetFitByHumanAI_Complete_Architecture.pdf" }
```

### 🩺 Health
**GET** `/health`
```json
{ "ok": true, "message": "All systems operational ✅" }
```

---

## 📊 Phase 1 Summary

✅ PDF → Text → Chunk → Embed → Qdrant pipeline  
✅ Semantic retrieval + RAG chat generation  
✅ Safe deletion & stats monitoring  
✅ Logging and CLI interfaces  
✅ All APIs tested in Postman  
🟡 Next: Authentication + User-specific Hybrid Memory + Frontend Dashboard

---

## 🪄 Next Phases

| Phase | Focus |
|--------|--------|
| **Phase 2** | User authentication (Signup/Login, JWT) |
| **Phase 3** | Hybrid long-term memory (per-user Qdrant context) |
| **Phase 4** | User/Researcher/Admin dashboard (React + MUI) |
| **Phase 5** | Deployment to AWS ECS + Qdrant Cloud integration |

---

## 🧑‍💻 Author

**Sai Krishna Mohan Kolla**  
Full-Stack Engineer | AI & Cloud Systems Architect  

> “Train your data, not just your model.” – GetFitByHumanAI
