import { GoogleGenAI } from '@google/genai';
import { LLMProvider, LLMGenerateOptions, LLMStructuredOptions, LLMMessage, EmbeddingTaskType } from './llmProvider';
import { config } from '../../config';
import { logger } from '../../utils/logger';

// Chunk size for batch embedding to avoid single large HTTP calls
const EMBED_CHUNK_SIZE = 50;

// Milliseconds to wait between retries (exponential: 1s, 2s, 4s)
const RETRY_BASE_MS = 1000;
const RETRY_MAX_ATTEMPTS = 3;

function isRetryable(err: unknown): boolean {
  const msg = (err as Error).message || '';
  return msg.includes('429') || msg.includes('503') || msg.includes('quota') || msg.includes('overloaded');
}

async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < RETRY_MAX_ATTEMPTS; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (!isRetryable(err) || attempt === RETRY_MAX_ATTEMPTS - 1) throw err;
      const delay = RETRY_BASE_MS * Math.pow(2, attempt);
      logger.warn(`Gemini transient error, retrying in ${delay}ms`, { attempt, error: (err as Error).message });
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

export class GeminiProvider implements LLMProvider {
  private ai: GoogleGenAI;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: config.llm.apiKey });
  }

  private mapMessages(messages: LLMMessage[]) {
    // Gemini requires system messages via systemInstruction, not as a content turn
    let systemInstruction = '';
    const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];

    for (const msg of messages) {
      if (msg.role === 'system') {
        systemInstruction += msg.content + '\n';
      } else {
        contents.push({
          role: msg.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: msg.content }],
        });
      }
    }

    return { contents, systemInstruction: systemInstruction.trim() || undefined };
  }

  async generate(options: LLMGenerateOptions): Promise<string> {
    const { contents, systemInstruction } = this.mapMessages(options.messages);
    return withRetry(async () => {
      const response = await this.ai.models.generateContent({
        model: config.llm.model,
        contents,
        config: {
          systemInstruction,
          temperature: options.temperature ?? 0.2,
          maxOutputTokens: options.maxTokens ?? 4096,
        },
      });
      return response.text || '';
    });
  }

  async generateStructured<T>(options: LLMStructuredOptions<T>): Promise<T> {
    const { contents, systemInstruction } = this.mapMessages(options.messages);
    // Append JSON instruction to system prompt
    const enrichedSystem =
      (systemInstruction ? systemInstruction + '\n\n' : '') +
      'IMPORTANT: You MUST respond with valid JSON only. No markdown, no explanation. Just the JSON object.';

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await withRetry(() =>
          this.ai.models.generateContent({
            model: config.llm.model,
            contents,
            config: {
              systemInstruction: enrichedSystem,
              temperature: options.temperature ?? 0.1,
              // Generous token budget: Gemini 2.5 uses hidden thinking tokens that count against output
              maxOutputTokens: options.maxTokens ?? 8192,
              // thinkingBudget=0 disables hidden thinking, preventing JSON truncation
              thinkingConfig: { thinkingBudget: 0 },
              responseMimeType: 'application/json',
            },
          })
        );

        // Strip markdown fences that some model versions still emit
        let content = response.text || '{}';
        content = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/i, '').trim();

        const parsed = JSON.parse(content);
        return options.schema.parse(parsed);
      } catch (err) {
        lastError = err as Error;
        logger.warn('Gemini structured output parse failed, retrying', {
          attempt,
          error: (err as Error).message,
        });
        if (attempt < 2) {
          // Ask the model to retry with clean JSON
          contents.push({ role: 'model', parts: [{ text: 'Let me provide the valid JSON response.' }] });
          contents.push({ role: 'user', parts: [{ text: 'Please respond again with ONLY valid JSON, no markdown.' }] });
        }
      }
    }
    throw lastError || new Error('Failed to generate structured output');
  }

  async embed(text: string, taskType?: EmbeddingTaskType): Promise<number[]> {
    return withRetry(async () => {
      const response = await this.ai.models.embedContent({
        model: config.llm.embeddingModel,
        contents: text,
        config: {
          // Separate task types improve retrieval quality on Gemini embedding models
          taskType: taskType || 'RETRIEVAL_QUERY',
          outputDimensionality: config.llm.embeddingDimensions,
        },
      });
      if (!response.embeddings || response.embeddings.length === 0 || !response.embeddings[0]?.values) {
        throw new Error('No embeddings returned from Gemini');
      }
      return response.embeddings[0].values;
    });
  }

  async embedBatch(texts: string[], taskType?: EmbeddingTaskType): Promise<number[][]> {
    // Chunk into groups to avoid oversized requests and rate limits
    const results: number[][] = [];
    for (let i = 0; i < texts.length; i += EMBED_CHUNK_SIZE) {
      const chunk = texts.slice(i, i + EMBED_CHUNK_SIZE);
      const embeddings = await Promise.all(chunk.map((t) => this.embed(t, taskType)));
      results.push(...embeddings);
      // Small delay between chunks to respect rate limits
      if (i + EMBED_CHUNK_SIZE < texts.length) {
        await new Promise((r) => setTimeout(r, 200));
      }
    }
    return results;
  }
}
