import { getLLMProvider } from './apps/api/src/services/ai';

async function test() {
  try {
    const provider = getLLMProvider();
    const result = await provider.generate({
      messages: [{ role: 'user', content: 'Say hello world' }]
    });
    console.log('Result:', result);
  } catch (err) {
    console.error('Error:', err);
  }
}
test();
