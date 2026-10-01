import { config } from './src/config';

async function test() {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${config.llm.apiKey}`);
  const data = await res.json();
  console.log('Available models:');
  data.models.forEach((m: any) => {
    if (m.name.includes('embedding')) {
      console.log(m.name, m.supportedGenerationMethods);
    }
  });
}
test();
