import { GeminiProvider } from './src/services/ai/geminiProvider';
import { config } from './src/config';

async function test() {
  console.log('Testing Gemini...', config.llm.model, config.llm.embeddingModel);
  const provider = new GeminiProvider();
  try {
    const res = await provider.embed('hello world');
    console.log('Embed success:', res.slice(0, 5));
  } catch (err: any) {
    console.error('Embed error:', err.message, err.status, err.details);
  }
}
test();
