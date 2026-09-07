import { Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import { env } from '../config/env.js';
import { DocumentService } from '../services/document/document.service.js';
import { getEmbeddingService } from '../services/rag/embedding.service.js';
import { VectorStoreService } from '../services/rag/vector-store.service.js';
import * as resHelper from '../utils/response.js';
import { logger } from '../utils/logger.js';
import { bersihkanTeks } from '../services/document/text-cleaner.service.js';
import { chunkDocuments } from '../services/document/chunk.service.js';
// Parser imports
import { parsePdf } from '../services/document/pdf.parser.js';
import { parseDocx } from '../services/document/docx.parser.js';
import { parsePptx } from '../services/document/pptx.parser.js';
import { parseXlsx } from '../services/document/xlsx.parser.js';

const supabase = createClient(
  env.SUPABASE_URL!,
  env.SUPABASE_SERVICE_KEY!
);

const uploadStatus = new Map<string, { status: 'proses' | 'sukses' | 'error'; detail: string }>();

export const uploadFile = async (req: Request, res: Response) => {
  if (!req.file) return resHelper.badRequest(res, 'No file uploaded');
  const filename = req.file.originalname;
  const fileBuffer = req.file.buffer;
  const mimetype = req.file.mimetype;

  const ext = filename.split('.').pop()?.toLowerCase();
  const allowed = ['pdf', 'docx', 'pptx', 'xlsx'];
  if (!ext || !allowed.includes(ext)) {
    return resHelper.badRequest(res, 'Format file tidak didukung');
  }

  // Upload to Supabase Storage
  const filePath = `uploads/${uuidv4()}-${filename}`;
  const { data, error } = await supabase.storage
    .from('dokumen-asli')
    .upload(filePath, fileBuffer, { contentType: mimetype, upsert: false });

  if (error) {
    logger.error('Supabase upload error:', error);
    return resHelper.fail(res, 'Gagal upload ke storage');
  }

  // Get public URL (if bucket is public) or generate signed URL
  const { data: urlData } = supabase.storage
    .from('dokumen-asli')
    .getPublicUrl(filePath);

  const fileUrl = urlData.publicUrl;

  // Metadata for vector store
  const userId = (req as any).user?.id || null;
  const sessionId = req.headers['x-session-id'] as string || null;
  const metadata: any = { source: filename, url: fileUrl };
  if (userId) metadata.user_id = userId;
  if (sessionId) metadata.session_id = sessionId;

  uploadStatus.set(filename, { status: 'proses', detail: `${filename} sedang diindeks...` });

  // Async processing
  (async () => {
    try {
      // Parse document from buffer
      let docs: any[] = [];
      if (ext === 'pdf') {
        docs = await parsePdfBuffer(fileBuffer, filename, metadata);
      } else if (ext === 'docx') {
        docs = await parseDocxBuffer(fileBuffer, filename, metadata);
      } else if (ext === 'pptx') {
        docs = await parsePptxBuffer(fileBuffer, filename, metadata);
      } else if (ext === 'xlsx') {
        docs = await parseXlsxBuffer(fileBuffer, filename, metadata);
      }

      if (!docs || docs.length === 0) {
        throw new Error('Dokumen kosong atau tidak terbaca');
      }

      // Clean & chunk
      const cleanedDocs = docs.map(d => ({
        ...d,
        pageContent: bersihkanTeks(d.pageContent)
      }));
      const chunks = chunkDocuments(cleanedDocs);

      // Embed & store
      const embeddingService = getEmbeddingService();
      const vectorStore = new VectorStoreService();
      for (const chunk of chunks) {
        const emb = await embeddingService.embedQuery(chunk.pageContent);
        await vectorStore.addDocuments([{
          text: chunk.pageContent,
          embedding: emb,
          metadata: chunk.metadata,
          collection_id: 'default'
        }]);
      }

      uploadStatus.set(filename, { status: 'sukses', detail: `${filename} berhasil diindeks!` });
    } catch (err: any) {
      logger.error(`Upload processing failed for ${filename}:`, err);
      uploadStatus.set(filename, { status: 'error', detail: err.message || 'Gagal memproses dokumen' });
    }
  })();

  resHelper.created(res, { status: 'proses', pesan: `${filename} sedang diproses di background.` });
};

export const getUploadStatus = async (req: Request, res: Response) => {
  const filename = req.params.filename as string;
  const status = uploadStatus.get(filename);
  if (!status) return resHelper.notFound(res, 'Status tidak ditemukan.');
  resHelper.ok(res, status);
};

// Helper parsers from buffer (simplified)
async function parsePdfBuffer(buffer: Buffer, filename: string, metadata: any) {
  const pdfParse = (await import('pdf-parse')).default;
  const data = await pdfParse(buffer);
  const pages = data.text.split(/\f/);
  return pages.map((text: string, i: number) => ({
    pageContent: `--- Halaman ${i+1} ---\n${text}`,
    metadata: { ...metadata, source: filename, page: i+1 }
  }));
}
async function parseDocxBuffer(buffer: Buffer, filename: string, metadata: any) {
  const mammoth = await import('mammoth');
  const result = await mammoth.extractRawText({ buffer });
  return [{ pageContent: result.value, metadata: { ...metadata, source: filename } }];
}
async function parsePptxBuffer(buffer: Buffer, filename: string, metadata: any) {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(buffer);
  const slideFiles = Object.keys(zip.files).filter(f => f.match(/^ppt\/slides\/slide\d+\.xml$/));
  const docs = [];
  for (const sf of slideFiles) {
    const match = sf.match(/slide(\d+)\.xml/);
    const pageNum = match ? parseInt(match[1], 10) : 1;
    const content = await zip.files[sf].async('string');
    const texts = content.match(/<a:t>([^<]*)<\/a:t>/g)?.map(t => t.replace(/<\/?a:t>/g, '')) || [];
    docs.push({
      pageContent: `--- Halaman ${pageNum} ---\n${texts.join(' ')}`,
      metadata: { ...metadata, source: filename, page: pageNum }
    });
  }
  return docs;
}
async function parseXlsxBuffer(buffer: Buffer, filename: string, metadata: any) {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as any);
  const docs: any[] = [];
  workbook.eachSheet((worksheet) => {
    let text = `--- Sheet ${worksheet.name} ---\n`;
    worksheet.eachRow((row) => {
      if (Array.isArray(row.values)) {
        text += row.values.slice(1).join(', ') + '\n';
      }
    });
    docs.push({
      pageContent: text,
      metadata: { ...metadata, source: filename, sheet: worksheet.name }
    });
  });
  return docs;
}
