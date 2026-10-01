import { GeminiProvider } from './src/services/ai/geminiProvider';
import { config } from './src/config';

async function test() {
  config.llm.embeddingModel = 'text-embedding-004';
  const provider = new GeminiProvider();
  try {
    const res = await provider.embed('hello world');
    console.log('Embed success 004:', res.slice(0, 5));
  } catch (err: any) {
    console.error('Embed error 004:', err.message);
  }

  config.llm.embeddingModel = 'embedding-001';
  try {
    const res = await provider.embed('hello world');
    console.log('Embed success 001:', res.slice(0, 5));
  } catch (err: any) {
    console.error('Embed error 001:', err.message);
  }
}
test();
