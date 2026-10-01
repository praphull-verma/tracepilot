import { LLMProvider } from './llmProvider';
import { MockLLMProvider } from './mockProvider';
import { GeminiProvider } from './geminiProvider';
import { OpenAICompatibleProvider } from './openaiProvider';
import { config } from '../../config';
import { logger } from '../../utils/logger';

let _provider: LLMProvider | null = null;

export function getLLMProvider(): LLMProvider {
  if (_provider) return _provider;

  if (config.demoMode || !config.llm.apiKey) {
    logger.info('Using MockLLMProvider (demo mode)');
    _provider = new MockLLMProvider();
  } else if (config.llm.provider === 'openai-compatible') {
    logger.info('Using OpenAICompatibleProvider', {
      model: config.llm.model,
      baseUrl: config.llm.baseUrl,
    });
    _provider = new OpenAICompatibleProvider();
  } else {
    logger.info('Using GeminiProvider', {
      model: config.llm.model,
    });
    _provider = new GeminiProvider();
  }

  return _provider;
}
