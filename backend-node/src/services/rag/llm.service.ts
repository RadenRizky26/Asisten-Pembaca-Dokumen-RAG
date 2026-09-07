import { GoogleGenerativeAI } from '@google/generative-ai';

export class LlmService {
  private genAI: GoogleGenerativeAI | null = null;
  constructor(apiKey = process.env.GOOGLE_API_KEY) {
    if (apiKey) this.genAI = new GoogleGenerativeAI(apiKey);
  }
  async generate(prompt: string, temperature = 0.3): Promise<string> {
    if (!this.genAI) return `Jawaban (fallback tanpa GOOGLE_API_KEY):\n\n${prompt.slice(0, 800)}\n\n[Konfigurasi LLM belum tersedia - set GOOGLE_API_KEY]`;
    try {
      const model = this.genAI.getGenerativeModel({ model: process.env.GOOGLE_MODEL ?? 'gemini-1.5-flash' });
      const r = await model.generateContent({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature } });
      return r.response.text();
    } catch (e: any) {
      return `Gagal memanggil LLM: ${e?.message ?? e}`;
    }
  }
}
