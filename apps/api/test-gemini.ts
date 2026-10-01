import { OpenAICompatibleProvider } from './src/services/ai/openaiProvider';
import { config } from './src/config';

async function test() {
  console.log('Testing LLM...', config.llm);
  const provider = new OpenAICompatibleProvider();
  
  try {
    const res = await provider.generate({
      messages: [{ role: 'user', content: 'Say hello' }]
    });
    console.log('Chat success:', res);
  } catch (err) {
    console.error('Chat error:', err);
  }

  try {
    config.llm.embeddingModel = 'text-embedding-004';
    const res = await provider.embed('hello world');
    console.log('Embed success 004:', res.slice(0, 5));
  } catch (err) {
    console.error('Embed error 004:', (err as Error).message);
  }
}
test();
