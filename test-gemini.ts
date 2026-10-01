import { GoogleGenAI } from '@google/genai';
import * as dotenv from 'dotenv';
dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.LLM_API_KEY });
async function test() {
  try {
    const response = await ai.models.generateContent({
      model: process.env.LLM_MODEL || 'gemini-1.5-flash',
      contents: [{ role: 'user', parts: [{ text: 'Hello' }] }]
    });
    console.log("Success:", response.text);
  } catch (err) {
    console.error("Error message:", (err as Error).message);
    console.error("Full error:", err);
  }
}
test();
