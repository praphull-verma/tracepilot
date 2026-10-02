# TracePilot 🚀

TracePilot is an **AI-powered sales decision engine**. It connects to your CRM data (leads, deals, interactions, notes) and provides **evidence-backed, actionable insights** for sales teams.

By combining deterministic scoring, semantic RAG (Retrieval-Augmented Generation), and LLM reasoning, TracePilot answers critical pipeline questions while eliminating hallucinations.

## Key Features 🌟

- **Intent-based Query Pipeline:** Routes natural language questions to the right engine (SQL, RAG, or Hybrid).
- **Deterministic Scoring Engine:** Ranks leads using a transparent scoring formula based on engagement, lead quality, deal value, urgency, and recency.
- **Evidence-Backed Insights:** Every AI recommendation must cite actual CRM notes, deals, or metrics (TracePilot refuses to hallucinate).
- **Conflict Detection:** Cross-checks structured data (e.g., "ACTIVE" lead status) against unstructured notes (e.g., "client paused the deal").
- **Local Vectors & AI Integration:** Uses Google Gemini (`@google/genai`) for LLM reasoning and embeddings. Embeddings are stored in PostgreSQL (`Float[]`) and ranked locally using Node.js cosine similarity (no pgvector dependency required).
- **Evaluation Dashboard:** Automated tests that measure accuracy, evidence coverage, latency, and route correctness.

## Tech Stack 🛠

- **API:** Node.js, Express, TypeScript, Prisma (PostgreSQL), Zod, Vitest.
- **Web:** React, Vite, Tailwind CSS (Lucide Icons), Recharts.
- **AI/LLM:** Google Gemini API (`@google/genai`).

## Getting Started 🚀

### 1. Prerequisites

- Node.js (v18+)
- PostgreSQL installed and running locally.

### 2. Setup Database

Create a local PostgreSQL database for TracePilot:
```bash
createdb tracepilot
```

### 3. Environment Variables

Create a `.env` file in the root directory (you can copy `.env.example` if available):
```env
# Database connection
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/tracepilot?schema=public"

# AI Provider Configuration
LLM_PROVIDER="gemini" # or "mock" for local testing
GEMINI_API_KEY="your-gemini-api-key"

# App config
PORT=3000
NODE_ENV="development"
FRONTEND_URL="http://localhost:5173"
```

### 4. Install & Initialize

Run the following commands from the repository root:

```bash
# Install dependencies for all workspaces
npm install

# Push database schema, generate Prisma client, and seed the database
npm run setup
```

The seed script will populate realistic mock data and automatically embed all business notes for RAG testing.

### 5. Running the App

Start both the backend API and the frontend web app simultaneously:

```bash
npm run dev
```

- **Web UI:** http://localhost:5173
- **API Server:** http://localhost:3000

## Core Workflows 🔄

### Asking Questions
Use the **Ask TracePilot** page to submit queries like:
- *"Which 5 leads should I contact today?"* (Triggers: Hybrid Lead Prioritization)
- *"What is the total pipeline value?"* (Triggers: SQL Statistics)
- *"What objections are customers mentioning most frequently?"* (Triggers: RAG Note Analysis)

### Ingesting Data
TracePilot supports uploading CSV or Excel files (Leads, Deals, Notes, Customers) via the **Data Sources** page. Background processing automatically chunks and embeds the data.

### Evaluation
The **Evaluation** page runs the AI engine through a suite of deterministic assertions to prove that the AI is accurately citing evidence and using the correct pipelines.

## Project Structure 📁

- `apps/api`: The Express backend, Prisma schema, and AI agent pipelines.
- `apps/web`: The React frontend application.

## Tests 🧪

To run the Vitest suite for the core scoring and evidence logic:

```bash
npm run test
```

## Reindexing Notes 📚

If you ingest notes without an active API key or want to re-embed all unstructured text, run the reindex script:

```bash
npm run reindex
```
