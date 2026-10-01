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

export async function searchNotes(
  query: string,
  limit?: number,
  filters?: { sourceType?: string; entityId?: string }
): Promise<SearchResult[]> {
  const topK = limit || config.vectorTopK;

  try {
    const provider = getLLMProvider();
    const queryEmbedding = await provider.embed(query);

    // Try pgvector similarity search
    const vectorStr = `[${queryEmbedding.join(',')}]`;

    try {
      const results = await prisma.$queryRaw<
        Array<{
          id: string;
          sourceType: string;
          sourceId: string;
          text: string;
          metadata: unknown;
          createdAt: Date;
          similarity: number;
        }>
      >`
        SELECT id, "sourceType", "sourceId", text, metadata, "createdAt",
               1 - (embedding <=> ${vectorStr}::vector) AS similarity
        FROM embedding_documents
        WHERE embedding IS NOT NULL
        ${filters?.sourceType ? prisma.$queryRaw`AND "sourceType" = ${filters.sourceType}` : prisma.$queryRaw``}
        ORDER BY embedding <=> ${vectorStr}::vector
        LIMIT ${topK}
      `;

      logger.debug('RAG vector search', { query: query.slice(0, 50), results: results.length });
      return results.filter((r) => r.similarity > 0.1);
    } catch {
      // Fallback: text search
      logger.warn('Vector search failed, falling back to text search');
      return await fallbackTextSearch(query, topK, filters);
    }
  } catch (err) {
    logger.error('searchNotes failed', { error: (err as Error).message });
    return await fallbackTextSearch(query, topK, filters);
  }
}

async function fallbackTextSearch(
  query: string,
  limit: number,
  filters?: { sourceType?: string; entityId?: string }
): Promise<SearchResult[]> {
  const keywords = query
    .toLowerCase()
    .split(' ')
    .filter((w) => w.length > 3)
    .slice(0, 5);

  const docs = await prisma.embeddingDocument.findMany({
    where: {
      sourceType: filters?.sourceType || undefined,
      text: {
        contains: keywords[0] || query.slice(0, 20),
        mode: 'insensitive',
      },
    },
    take: limit,
    orderBy: { createdAt: 'desc' },
  });

  return docs.map((d, idx) => ({
    id: d.id,
    sourceType: d.sourceType,
    sourceId: d.sourceId,
    text: d.text,
    metadata: d.metadata,
    similarity: 0.7 - idx * 0.05,
    createdAt: d.createdAt,
  }));
}

export async function indexDocument(
  sourceType: string,
  sourceId: string,
  text: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  try {
    const provider = getLLMProvider();
    const embedding = await provider.embed(text);
    const vectorStr = `[${embedding.join(',')}]`;

    // Check if already indexed
    const existing = await prisma.embeddingDocument.findFirst({
      where: { sourceType, sourceId },
    });

    if (existing) {
      await prisma.embeddingDocument.update({
        where: { id: existing.id },
        data: {
          text,
          embedding: vectorStr,
          metadata: metadata || {},
        },
      });
    } else {
      await prisma.embeddingDocument.create({
        data: {
          sourceType,
          sourceId,
          text,
          embedding: vectorStr,
          metadata: metadata || {},
        },
      });
    }

    logger.debug('Indexed document', { sourceType, sourceId });
  } catch (err) {
    logger.error('indexDocument failed', {
      error: (err as Error).message,
      sourceType,
      sourceId,
    });
    // Still save without embedding
    const existing = await prisma.embeddingDocument.findFirst({
      where: { sourceType, sourceId },
    });
    if (!existing) {
      await prisma.embeddingDocument.create({
        data: { sourceType, sourceId, text, metadata: metadata || {} },
      });
    }
  }
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
