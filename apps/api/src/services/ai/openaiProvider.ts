import OpenAI from 'openai';
import { LLMProvider, LLMGenerateOptions, LLMStructuredOptions } from './llmProvider';
import { config } from '../../config';
import { logger } from '../../utils/logger';

export class OpenAICompatibleProvider implements LLMProvider {
  private client: OpenAI;

  constructor() {
    this.client = new OpenAI({
      apiKey: config.llm.apiKey,
      baseURL: config.llm.baseUrl,
    });
  }

  async generate(options: LLMGenerateOptions): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: config.llm.model,
      messages: options.messages,
      temperature: options.temperature ?? 0.2,
      max_tokens: options.maxTokens ?? 2000,
    });
    return response.choices[0]?.message?.content || '';
  }

  async generateStructured<T>(options: LLMStructuredOptions<T>): Promise<T> {
    const systemMsg = options.messages.find((m) => m.role === 'system');
    const enrichedSystem = systemMsg
      ? {
          ...systemMsg,
          content:
            systemMsg.content +
            '\n\nIMPORTANT: You MUST respond with valid JSON only. No markdown, no explanation. Just the JSON object.',
        }
      : {
          role: 'system' as const,
          content:
            'You are a helpful assistant. Respond with valid JSON only. No markdown.',
        };

    const messages = options.messages.map((m) =>
      m.role === 'system' ? enrichedSystem : m
    );

    let lastError: Error | null = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await this.client.chat.completions.create({
          model: config.llm.model,
          messages,
          temperature: options.temperature ?? 0.1,
          max_tokens: options.maxTokens ?? 3000,
          response_format: { type: 'json_object' },
        });
        const content = response.choices[0]?.message?.content || '{}';
        const parsed = JSON.parse(content);
        return options.schema.parse(parsed);
      } catch (err) {
        lastError = err as Error;
        logger.warn('LLM structured output parse failed, retrying', { attempt, error: (err as Error).message });
        if (attempt === 0) {
          messages.push({
            role: 'assistant',
            content: 'I need to try again with valid JSON.',
          });
          messages.push({
            role: 'user',
            content: 'Please respond again with ONLY valid JSON matching the required schema.',
          });
        }
      }
    }
    throw lastError || new Error('Failed to generate structured output');
  }

  async embed(text: string): Promise<number[]> {
    const response = await this.client.embeddings.create({
      model: config.llm.embeddingModel,
      input: text,
    });
    return response.data[0].embedding;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const response = await this.client.embeddings.create({
      model: config.llm.embeddingModel,
      input: texts,
    });
    return response.data.map((d) => d.embedding);
  }
}
