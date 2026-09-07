export interface RerankDoc { pageContent?: string; document?: string; text?: string; cmetadata?: any; metadata?: any; embedding?: number[]; [k: string]: any; }
export interface RerankerService { rerank(query: string, docs: RerankDoc[], k?: number): Promise<RerankDoc[]>; }

function tokens(s: string): string[] { return s.toLowerCase().split(/\W+/).filter(Boolean); }
function cosine(a: number[], b: number[]): number {
  let dot=0, na=0, nb=0;
  for(let i=0;i<Math.min(a.length,b.length);i++){ dot+=a[i]*b[i]; na+=a[i]*a[i]; nb+=b[i]*b[i]; }
  return dot / (Math.sqrt(na)*Math.sqrt(nb) || 1);
}

// ponytail: BM25-lite (token overlap TF) + cosine; swap to cross-encoder when needed
export class SimpleReranker implements RerankerService {
  async rerank(query: string, docs: RerankDoc[], k = 5): Promise<RerankDoc[]> {
    const qTokens = tokens(query);
    const qSet = new Set(qTokens);
    const scored = docs.map(d => {
      const text = d.pageContent ?? d.document ?? d.text ?? '';
      const tks = tokens(text);
      const overlap = tks.filter(t => qSet.has(t)).length;
      const tf = overlap / (tks.length || 1);
      const idfBoost = overlap / (qTokens.length || 1);
      let lexical = tf * 0.6 + idfBoost * 0.4;
      let sem = 0;
      if (d.embedding && (d as any)._queryEmbedding) sem = (cosine(d.embedding, (d as any)._queryEmbedding) + 1) / 2;
      const score = lexical * 0.7 + sem * 0.3;
      return { doc: d, score };
    });
    scored.sort((a,b) => b.score - a.score);
    return scored.slice(0, k).map(s => s.doc);
  }
}
