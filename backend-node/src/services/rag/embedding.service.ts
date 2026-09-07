import { GoogleGenerativeAI } from '@google/generative-ai';

export interface EmbeddingService {
  embedQuery(text: string): Promise<number[]>;
  embedDocuments(texts: string[]): Promise<number[][]>;
}

// ponytail: deterministic hash only; upgrade to real model when quality needed
export class HashEmbeddingService implements EmbeddingService {
  static DIMS = 384;
  private hash(s: string): number {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  private embed(text: string): number[] {
    const v = new Array(HashEmbeddingService.DIMS).fill(0);
    const tokens = text.toLowerCase().split(/\W+/).filter(Boolean);
    if (!tokens.length) tokens.push(text.slice(0, 32));
    for (const tok of tokens) {
      const h = this.hash(tok);
      const idx = h % HashEmbeddingService.DIMS;
      // spread to neighbours to avoid collisions clustering
      v[idx] += 1;
      v[(idx + 1) % HashEmbeddingService.DIMS] += 0.5;
      v[(h >>> 16) % HashEmbeddingService.DIMS] += 0.3;
    }
    // L2 normalize
    const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
    return v.map(x => x / norm);
  }
  async embedQuery(text: string): Promise<number[]> { return this.embed(text); }
  async embedDocuments(texts: string[]): Promise<number[][]> { return texts.map(t => this.embed(t)); }
}

export class GoogleEmbeddingService implements EmbeddingService {
  private genAI: GoogleGenerativeAI;
  private model: any;
  constructor(apiKey = process.env.GOOGLE_API_KEY!) {
    this.genAI = new GoogleGenerativeAI(apiKey);
    // text-embedding-004 returns 768 dims; we truncate/project to 384 for pg compatibility
  }
  private trunc(v: number[]): number[] {
    if (v.length === 384) return v;
    if (v.length > 384) return v.slice(0, 384);
    return [...v, ...new Array(384 - v.length).fill(0)];
  }
  async embedQuery(text: string): Promise<number[]> {
    const m: any = (this.genAI as any).getGenerativeModel ? (this.genAI as any).getGenerativeModel({ model: 'text-embedding-004' }) : null;
    try {
      const r = await m.embedContent(text);
      return this.trunc(r.embedding.values);
    } catch {
      // fallback to hash if API fails
      return new HashEmbeddingService().embedQuery(text);
    }
  }
  async embedDocuments(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map(t => this.embedQuery(t)));
  }
}

let _inst: EmbeddingService | undefined;
export function getEmbeddingService(): EmbeddingService {
  if (_inst) return _inst;
  _inst = process.env.GOOGLE_API_KEY ? new GoogleEmbeddingService() : new HashEmbeddingService();
  return _inst;
}
