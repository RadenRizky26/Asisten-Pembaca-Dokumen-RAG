import { getEmbeddingService } from './embedding.service.js';
import { VectorStoreService } from './vector-store.service.js';
import { SimpleReranker } from './reranker.service.js';
import { buildContext, buildRagPrompt } from './prompt.service.js';
import { LlmService } from './llm.service.js';
import { generatePdf } from '../document-generator/pdf-generator.js';
import { generateText } from '../document-generator/text-generator.js';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

export type AskParams = {
  question: string;
  collectionId?: string;
  filter?: Record<string, any>;
  k?: number;
  rerankK?: number;
  temperature?: number;
  generateDoc?: 'pdf' | 'txt' | null;
};

export class RagService {
  constructor(
    private vectorStore = new VectorStoreService(),
    private reranker = new SimpleReranker(),
    private llm = new LlmService(),
  ) {}

  async ask(params: AskParams): Promise<{ answer: string; sources: any[]; generatedDocPath?: string }> {
    const { question, collectionId = 'default', filter, k = 8, rerankK = 4, temperature = 0.3, generateDoc } = params;

    // 1. embed query
    const emb = getEmbeddingService();
    const qEmbedding = await emb.embedQuery(question);

    // 2. vector search
    let docs = await this.vectorStore.similaritySearch(qEmbedding, k, collectionId, filter);
    // attach query embedding for reranker cosine
    docs = docs.map((d: any) => ({ ...d, _queryEmbedding: qEmbedding, text: d.document, pageContent: d.document, source: d.cmetadata?.source, page: d.cmetadata?.page }));

    // 3. rerank
    const ranked = await this.reranker.rerank(question, docs as any, rerankK);

    // 4. build context
    const context = buildContext(ranked as any);
    const prompt = buildRagPrompt(context, question);

    // 5. LLM
    let answer = await this.llm.generate(prompt, temperature);

    // 6. handle generated document tags: <doc type="pdf">...</doc> or <generate_pdf>...</generate_pdf>
    let generatedDocPath: string | undefined;
    const tagMatch = answer.match(/<(doc|generate_pdf|generate_text)[^>]*>([\s\S]*?)<\/\1>/i);
    if (tagMatch) {
      const inner = tagMatch[2].trim();
      const isPdf = /pdf/i.test(tagMatch[1]) || /pdf/i.test(tagMatch[0]);
      const outDir = process.env.GENERATED_DOC_DIR ?? 'storage/generated';
      const id = randomUUID().slice(0, 8);
      if (generateDoc === 'pdf' || (isPdf && generateDoc !== 'txt')) {
        const p = path.join(outDir, `doc-${id}.pdf`);
        await generatePdf(inner, p);
        generatedDocPath = p;
      } else {
        const p = path.join(outDir, `doc-${id}.txt`);
        await generateText(inner, p);
        generatedDocPath = p;
      }
      answer = answer.replace(tagMatch[0], generatedDocPath ? `\n[Dokumen dibuat: ${generatedDocPath}]\n` : '');
    } else if (generateDoc) {
      // explicit request without tag: generate from answer
      const outDir = process.env.GENERATED_DOC_DIR ?? 'storage/generated';
      const id = randomUUID().slice(0, 8);
      if (generateDoc === 'pdf') { const p = path.join(outDir, `doc-${id}.pdf`); await generatePdf(answer, p); generatedDocPath = p; }
      else { const p = path.join(outDir, `doc-${id}.txt`); await generateText(answer, p); generatedDocPath = p; }
    }

    return { answer, sources: ranked.map((r: any) => r.cmetadata ?? { source: r.source, page: r.page }), generatedDocPath };
  }
}
