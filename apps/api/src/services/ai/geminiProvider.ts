import { GoogleGenAI } from '@google/genai';
import { LLMProvider, LLMGenerateOptions, LLMStructuredOptions, LLMMessage } from './llmProvider';
import { config } from '../../config';
import { logger } from '../../utils/logger';

export class GeminiProvider implements LLMProvider {
  private ai: GoogleGenAI;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: config.llm.apiKey });
  }

  private mapMessages(messages: LLMMessage[]) {
    // Combine system message into the first user message, or handle via systemInstruction
    let systemInstruction = '';
    const contents: any[] = [];
    
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
    
    return { contents, systemInstruction: systemInstruction || undefined };
  }

  async generate(options: LLMGenerateOptions): Promise<string> {
    const { contents, systemInstruction } = this.mapMessages(options.messages);
    
    const response = await this.ai.models.generateContent({
      model: config.llm.model,
      contents,
      config: {
        systemInstruction,
        temperature: options.temperature ?? 0.2,
        maxOutputTokens: options.maxTokens ?? 2000,
      }
    });
    
    return response.text || '';
  }

  async generateStructured<T>(options: LLMStructuredOptions<T>): Promise<T> {
    const { contents, systemInstruction } = this.mapMessages(options.messages);
    const enrichedSystem = (systemInstruction ? systemInstruction + '\n\n' : '') + 
      'IMPORTANT: You MUST respond with valid JSON only. No markdown, no explanation. Just the JSON object.';

    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await this.ai.models.generateContent({
          model: config.llm.model,
          contents,
          config: {
            systemInstruction: enrichedSystem,
            temperature: options.temperature ?? 0.1,
            maxOutputTokens: options.maxTokens ?? 3000,
            responseMimeType: 'application/json',
          }
        });
        
        const content = response.text || '{}';
        const parsed = JSON.parse(content);
        return options.schema.parse(parsed);
      } catch (err) {
        lastError = err as Error;
        logger.warn('Gemini structured output parse failed, retrying', { attempt, error: (err as Error).message });
        if (attempt === 0) {
          contents.push({ role: 'model', parts: [{ text: 'I need to try again with valid JSON.' }] });
          contents.push({ role: 'user', parts: [{ text: 'Please respond again with ONLY valid JSON.' }] });
        }
      }
    }
    throw lastError || new Error('Failed to generate structured output');
  }

  async embed(text: string): Promise<number[]> {
    const response = await this.ai.models.embedContent({
      model: config.llm.embeddingModel,
      contents: text,
    });
    return response.embeddings[0].values;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    // Process sequentially or via batch if supported. The SDK embedContent can take an array in some versions,
    // but mapping individually is safer if limits allow.
    const results: number[][] = [];
    for (const text of texts) {
      const response = await this.ai.models.embedContent({
        model: config.llm.embeddingModel,
        contents: text,
      });
      results.push(response.embeddings[0].values);
    }
    return results;
  }
}
