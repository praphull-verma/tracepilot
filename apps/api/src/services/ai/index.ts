import { LLMProvider } from './llmProvider';
import { MockLLMProvider } from './mockProvider';
import { GeminiProvider } from './geminiProvider';
import { config } from '../../config';
import { logger } from '../../utils/logger';

let _provider: LLMProvider | null = null;

export function getLLMProvider(): LLMProvider {
  if (_provider) return _provider;

  // Provider selection based purely on LLM_PROVIDER env; demoMode reflects key absence
  if (config.demoMode) {
    logger.info('Using MockLLMProvider (demo mode — set LLM_API_KEY to enable real AI)');
    _provider = new MockLLMProvider();
  } else if (config.llm.provider === 'gemini') {
    logger.info('Using GeminiProvider', {
      model: config.llm.model,
      embeddingModel: config.llm.embeddingModel,
      embeddingDimensions: config.llm.embeddingDimensions,
    });
    _provider = new GeminiProvider();
  } else {
    // Unknown provider: fall back to mock to avoid silent errors
    logger.warn('Unknown LLM_PROVIDER, falling back to mock', { provider: config.llm.provider });
    _provider = new MockLLMProvider();
  }

  return _provider;
}
