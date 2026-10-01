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

export interface LLMProvider {
  generate(options: LLMGenerateOptions): Promise<string>;
  generateStructured<T>(options: LLMStructuredOptions<T>): Promise<T>;
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
}

export interface EmbeddingProvider {
  embed(text: string): Promise<number[]>;
  embedBatch(texts: string[]): Promise<number[][]>;
}
