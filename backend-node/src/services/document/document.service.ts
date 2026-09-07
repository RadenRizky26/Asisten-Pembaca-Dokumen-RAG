import { parsePdf } from './pdf.parser.js';
import { parseDocx } from './docx.parser.js';
import { parsePptx } from './pptx.parser.js';
import { parseXlsx } from './xlsx.parser.js';
import { bersihkanTeks } from './text-cleaner.service.js';
import { chunkDocuments } from './chunk.service.js';

export class DocumentService {
  constructor(private embeddingService: any, private vectorStore: any) {}

  async processDocument(filePath: string, filename: string, metadata: any) {
    const ext = filename.split('.').pop()?.toLowerCase();
    let docs: any[] = [];
    
    if (ext === 'pdf') {
      docs = await parsePdf(filePath, filename, metadata);
    } else if (ext === 'docx') {
      docs = await parseDocx(filePath, filename, metadata);
    } else if (ext === 'pptx') {
      docs = await parsePptx(filePath, filename, metadata);
    } else if (ext === 'xlsx') {
      docs = await parseXlsx(filePath, filename, metadata);
    } else {
      throw new Error(`Unsupported extension: ${ext}`);
    }

    const cleanedDocs = docs.map((d: any) => ({
      ...d,
      pageContent: bersihkanTeks(d.pageContent)
    }));

    const chunks = chunkDocuments(cleanedDocs);
    await this.vectorStore.addDocuments(chunks);
    return chunks;
  }
}
