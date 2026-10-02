/**
 * scripts/reindex.ts
 * Re-embeds every BusinessNote that has no embedding (empty Float[] array).
 * Run via: npm run reindex --workspace=apps/api
 */
import { PrismaClient } from '@prisma/client';
import { indexDocument } from '../src/services/retrieval';
import { logger } from '../src/utils/logger';

const prisma = new PrismaClient();
const BATCH = 20;

async function main() {
  // Find all embedding_documents with empty embedding array (no vector yet)
  const unindexed = await prisma.embeddingDocument.findMany({
    where: { embedding: { isEmpty: true } },
    select: { id: true, sourceType: true, sourceId: true, text: true, metadata: true },
  });

  console.log(`Found ${unindexed.length} documents without embeddings. Re-indexing...`);
  let done = 0;
  let failed = 0;

  for (let i = 0; i < unindexed.length; i += BATCH) {
    const batch = unindexed.slice(i, i + BATCH);
    await Promise.allSettled(
      batch.map(async (doc) => {
        try {
          await indexDocument(
            doc.sourceType,
            doc.sourceId,
            doc.text,
            (doc.metadata as Record<string, unknown>) || {}
          );
          done++;
        } catch (err) {
          logger.warn('reindex: failed to embed', { id: doc.id, error: (err as Error).message });
          failed++;
        }
      })
    );
    console.log(`  Progress: ${Math.min(i + BATCH, unindexed.length)} / ${unindexed.length}`);
    // Rate-limit delay between batches
    if (i + BATCH < unindexed.length) await new Promise((r) => setTimeout(r, 300));
  }

  console.log(`\n✅ Reindex complete: ${done} ok, ${failed} failed`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
