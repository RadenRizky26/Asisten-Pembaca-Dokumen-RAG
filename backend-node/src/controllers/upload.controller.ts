import { Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import { env } from '../config/env.js';
import { getEmbeddingService } from '../services/rag/embedding.service.js';
import { VectorStoreService } from '../services/rag/vector-store.service.js';
import * as resHelper from '../utils/response.js';
import { logger } from '../utils/logger.js';
import { bersihkanTeks } from '../services/document/text-cleaner.service.js';
import { chunkDocuments } from '../services/document/chunk.service.js';
import { parsePdf } from '../services/document/pdf.parser.js';
import { parseDocx } from '../services/document/docx.parser.js';
import { parsePptx } from '../services/document/pptx.parser.js';
import { parseXlsx } from '../services/document/xlsx.parser.js';

const supabase = createClient(env.SUPABASE_URL!, env.SUPABASE_SERVICE_KEY!);
const vectorStore = new VectorStoreService();

const uploadStatus = new Map<string, { status: 'proses' | 'sukses' | 'error'; detail: string }>();

// ==========================================
// POST /api/upload
// Step 1: Upload to Storage & Chunk
// Step 2: Immediate Batch Embedding with await
// Response holds until indexing finishes (Vercel won't freeze)
// Small batch processing prevents timeout
// ==========================================
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

  uploadStatus.set(filename, { status: 'proses', detail: `${filename} sedang diindeks...` });

  try {
    // 1. Upload original document to Supabase Storage
    const storagePath = `uploads/${uuidv4()}-${filename}`;
    const { error: storageError } = await supabase.storage
      .from('dokumen-asli')
      .upload(storagePath, fileBuffer, { contentType: mimetype, upsert: false });

    if (storageError) {
      logger.error('Supabase storage upload error:', storageError);
      uploadStatus.set(filename, { status: 'error', detail: 'Gagal upload ke Supabase Storage' });
      return resHelper.fail(res, 'Gagal upload ke storage');
    }

    const { data: urlData } = supabase.storage
      .from('dokumen-asli')
      .getPublicUrl(storagePath);

    // 2. Metadata
    const userId = (req as any).user?.id || null;
    const sessionId = (req.headers['x-session-id'] as string) || null;
    const baseMetadata: any = { source: filename, url: urlData.publicUrl };
    if (userId) baseMetadata.user_id = userId;
    if (sessionId) baseMetadata.session_id = sessionId;

    // 3. Extract text
    let docs: any[] = [];
    if (ext === 'pdf') docs = await parsePdfBuffer(fileBuffer, filename, baseMetadata);
    else if (ext === 'docx') docs = await parseDocxBuffer(fileBuffer, filename, baseMetadata);
    else if (ext === 'pptx') docs = await parsePptxBuffer(fileBuffer, filename, baseMetadata);
    else if (ext === 'xlsx') docs = await parseXlsxBuffer(fileBuffer, filename, baseMetadata);

    if (!docs || docs.length === 0) {
      uploadStatus.set(filename, { status: 'error', detail: 'Dokumen kosong atau tidak terbaca' });
      return resHelper.badRequest(res, 'Dokumen kosong atau tidak terbaca');
    }

    // 4. Clean and chunk
    const cleanedDocs = docs.map((d) => ({
      ...d,
      pageContent: bersihkanTeks(d.pageContent),
    }));
    const chunks = chunkDocuments(cleanedDocs);

    // 5. Embed and save to vector store
    // Process in batches of 5 to avoid overloading/timeout
    const embeddingService = getEmbeddingService();
    const BATCH_SIZE = 5;

    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE);
      const docsToInsert = [];

      for (const chunk of batch) {
        const emb = await embeddingService.embedQuery(chunk.pageContent);
        docsToInsert.push({
          text: chunk.pageContent,
          embedding: emb,
          metadata: chunk.metadata,
          collection_id: 'default',
        });
      }

      await vectorStore.addDocuments(docsToInsert);
    }

    uploadStatus.set(filename, { status: 'sukses', detail: `${filename} berhasil diindeks!` });

    // Return synchronous success to frontend
    resHelper.ok(res, {
      status: 'sukses',
      detail: `${filename} berhasil diindeks!`,
      totalChunks: chunks.length,
    });
  } catch (err: any) {
    logger.error(`Upload/index failed for ${filename}:`, err);
    uploadStatus.set(filename, { status: 'error', detail: err.message || 'Gagal memproses dokumen' });
    resHelper.fail(res, err.message || 'Gagal memproses dokumen');
  }
};

// ==========================================
// Polling Status check (Frontend compatibility)
// ==========================================
export const getUploadStatus = async (req: Request, res: Response) => {
  const filename = typeof req.params.filename === 'string' ? req.params.filename : req.params.filename[0];
  const status = uploadStatus.get(filename) || { status: 'sukses', detail: `${filename} berhasil diindeks!` };
  resHelper.ok(res, status);
};

// ==========================================
// Buffer parsers
// ==========================================
async function parsePdfBuffer(buffer: Buffer, filename: string, metadata: any) {
  const pdfParse = (await import('pdf-parse')).default;
  const data = await pdfParse(buffer);
  const pages = data.text.split(/\f/);
  return pages.map((text: string, i: number) => ({
    pageContent: `--- Halaman ${i + 1} ---\n${text}`,
    metadata: { ...metadata, source: filename, page: i + 1 },
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
  const slideFiles = Object.keys(zip.files).filter((f) => f.match(/^ppt\/slides\/slide\d+\.xml$/));
  const docs = [];
  for (const sf of slideFiles) {
    const match = sf.match(/slide(\d+)\.xml/);
    const pageNum = match ? parseInt(match[1], 10) : 1;
    const content = await zip.files[sf].async('string');
    const texts = content.match(/<a:t>([^<]*)<\/a:t>/g)?.map((t) => t.replace(/<\/?a:t>/g, '')) || [];
    docs.push({
      pageContent: `--- Halaman ${pageNum} ---\n${texts.join(' ')}`,
      metadata: { ...metadata, source: filename, page: pageNum },
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
      metadata: { ...metadata, source: filename, sheet: worksheet.name },
    });
  });
  return docs;
}
