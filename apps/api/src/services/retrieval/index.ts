import { prisma } from '../../config/database';
import { getLLMProvider } from '../ai';
import { logger } from '../../utils/logger';
import { config } from '../../config';

export interface SearchResult {
  id: string;
  sourceType: string;
  sourceId: string;
  text: string;
  metadata: unknown;
  similarity: number;
  createdAt: Date;
}

// Stop-words to ignore in keyword fallback scoring
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has',
  'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may',
  'might', 'shall', 'can', 'with', 'from', 'by', 'not', 'that', 'this',
  'it', 'its', 'they', 'them', 'their', 'our', 'we', 'us', 'you', 'your',
]);

// Cosine similarity computed in Node; avoids pgvector requirement entirely
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// Keyword scoring with stop-word removal for fallback when embeddings are absent
function keywordScore(text: string, keywords: string[]): number {
  const lower = text.toLowerCase();
  let matches = 0;
  for (const kw of keywords) {
    if (lower.includes(kw)) matches++;
  }
  return keywords.length > 0 ? matches / keywords.length : 0;
}

function extractKeywords(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/[^a-z0-9]/g, ''))
    .filter((w) => w.length > 3 && !STOP_WORDS.has(w));
}

export async function searchNotes(
  query: string,
  limit?: number,
  filters?: { sourceType?: string; entityId?: string }
): Promise<SearchResult[]> {
  const topK = limit || config.vectorTopK;

  try {
    const provider = getLLMProvider();
    // Use RETRIEVAL_QUERY task type so Gemini optimises for querying
    const queryEmbedding = await provider.embed(query, 'RETRIEVAL_QUERY');

    // Load candidate documents from DB (filter by sourceType/entityId if provided)
    // Load all docs and filter for non-empty embedding in Node since Prisma doesn't support
    // isEmpty on Float[] scalar types with the Prisma filter API
    const candidates = await prisma.embeddingDocument.findMany({
      where: {
        ...(filters?.sourceType ? { sourceType: filters.sourceType } : {}),
        ...(filters?.entityId ? { sourceId: filters.entityId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      // Load enough candidates to rank; 2000 is fast for <500 notes
      take: 2000,
    });

    // Filter in-memory: only score documents that actually have embeddings
    const embedded = candidates.filter((d) => d.embedding && d.embedding.length > 0);

    if (embedded.length === 0) {
      logger.debug('No embedded documents found, using keyword fallback', { query: query.slice(0, 50) });
      return fallbackTextSearch(query, topK, filters);
    }

    // Compute cosine similarity in Node and sort
    const scored = embedded
      .map((doc) => ({
        doc,
        // embedding is Float[] so it's directly a number[]
        similarity: cosineSimilarity(queryEmbedding, doc.embedding as number[]),
      }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK)
      .filter((r) => r.similarity > 0.1);

    logger.debug('RAG vector search (Node cosine)', {
      query: query.slice(0, 50),
      results: scored.length,
      topSimilarity: scored[0]?.similarity?.toFixed(3),
    });

    return scored.map(({ doc, similarity }) => ({
      id: doc.id,
      sourceType: doc.sourceType,
      sourceId: doc.sourceId,
      text: doc.text,
      metadata: doc.metadata,
      similarity,
      createdAt: doc.createdAt,
    }));
  } catch (err) {
    logger.error('searchNotes failed, using keyword fallback', { error: (err as Error).message });
    return fallbackTextSearch(query, topK, filters);
  }
}

/**
 * searchNotesForLead — retrieve top notes scoped to one lead's internal id.
 * The pipeline currently takes a global top-20 and filters per lead, so most leads
 * get zero notes. Scoped retrieval fixes this.
 */
export async function searchNotesForLead(
  leadId: string,
  query: string,
  topK = 5
): Promise<SearchResult[]> {
  return searchNotes(query, topK, { sourceType: 'BusinessNote', entityId: leadId });
}

async function fallbackTextSearch(
  query: string,
  limit: number,
  filters?: { sourceType?: string; entityId?: string }
): Promise<SearchResult[]> {
  const keywords = extractKeywords(query);

  // Load candidates with basic filters
  const docs = await prisma.embeddingDocument.findMany({
    where: {
      ...(filters?.sourceType ? { sourceType: filters.sourceType } : {}),
      ...(filters?.entityId ? { sourceId: filters.entityId } : {}),
    },
    take: 500,
    orderBy: { createdAt: 'desc' },
  });

  if (docs.length === 0) return [];

  // Score all docs by keyword overlap (all query keywords, not just the first)
  const scored = docs
    .map((d) => ({ doc: d, similarity: keywordScore(d.text, keywords) }))
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);

  return scored.map(({ doc, similarity }, idx) => ({
    id: doc.id,
    sourceType: doc.sourceType,
    sourceId: doc.sourceId,
    text: doc.text,
    metadata: doc.metadata,
    // Assign a reasonable fallback score
    similarity: similarity || Math.max(0.1, 0.6 - idx * 0.05),
    createdAt: doc.createdAt,
  }));
}

export async function indexDocument(
  sourceType: string,
  sourceId: string,
  text: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  let embedding: number[] = [];
  try {
    const provider = getLLMProvider();
    // Use RETRIEVAL_DOCUMENT so indexed embeddings are optimised for storage/retrieval
    embedding = await provider.embed(text, 'RETRIEVAL_DOCUMENT');
  } catch (err) {
    // Still save the document without embedding; reindex script can fill it in later
    logger.warn('indexDocument embedding failed, saving without vector', {
      error: (err as Error).message,
      sourceType,
      sourceId,
    });
  }

  const existing = await prisma.embeddingDocument.findFirst({
    where: { sourceType, sourceId },
  });

  if (existing) {
    await prisma.embeddingDocument.update({
      where: { id: existing.id },
      // metadata cast to Prisma.InputJsonValue via unknown to avoid strict Json[] mismatch
      data: { text, embedding, metadata: (metadata || {}) as unknown as Parameters<typeof prisma.embeddingDocument.update>[0]['data']['metadata'] },
    });
  } else {
    await prisma.embeddingDocument.create({
      data: { sourceType, sourceId, text, embedding, metadata: (metadata || {}) as unknown as Parameters<typeof prisma.embeddingDocument.create>[0]['data']['metadata'] },
    });
  }

  logger.debug('Indexed document', { sourceType, sourceId, hasEmbedding: embedding.length > 0 });
}

export async function bulkIndexNotes(): Promise<{ indexed: number; failed: number }> {
  const notes = await prisma.businessNote.findMany({ take: 500 });
  let indexed = 0;
  let failed = 0;

  for (const note of notes) {
    try {
      await indexDocument(
        'BusinessNote',
        note.id,
        `${note.title || ''}\n${note.content}`,
        {
          entityType: note.entityType,
          entityId: note.entityId,
          // leadId stored so per-lead retrieval works without table join
          leadId: note.leadId,
          author: note.author,
          createdAt: note.createdAt.toISOString(),
        }
      );
      indexed++;
    } catch {
      failed++;
    }
  }

  logger.info('Bulk index complete', { indexed, failed });
  return { indexed, failed };
}
