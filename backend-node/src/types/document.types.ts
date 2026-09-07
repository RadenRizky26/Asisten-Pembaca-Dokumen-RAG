export interface DocumentMeta { id: string; filename: string; mimeType: string; size: number; uploadedAt: string; }
export interface DocumentChunk { id: string; documentId: string; chunkIndex: number; text: string; embedding?: number[]; }
