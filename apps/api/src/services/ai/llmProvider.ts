export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMGenerateOptions {
  messages: LLMMessage[];
  temperature?: number;
  maxTokens?: number;
}

export interface LLMStructuredOptions<T> extends LLMGenerateOptions {
  schema: { parse: (data: unknown) => T };
  schemaDescription?: string;
}

// taskType distinguishes indexing vs querying embeddings for better relevance
export type EmbeddingTaskType = 'RETRIEVAL_DOCUMENT' | 'RETRIEVAL_QUERY' | 'SEMANTIC_SIMILARITY';

export interface LLMProvider {
  generate(options: LLMGenerateOptions): Promise<string>;
  generateStructured<T>(options: LLMStructuredOptions<T>): Promise<T>;
  embed(text: string, taskType?: EmbeddingTaskType): Promise<number[]>;
  embedBatch(texts: string[], taskType?: EmbeddingTaskType): Promise<number[][]>;
}

export interface EmbeddingProvider {
  embed(text: string, taskType?: EmbeddingTaskType): Promise<number[]>;
  embedBatch(texts: string[], taskType?: EmbeddingTaskType): Promise<number[][]>;
}
