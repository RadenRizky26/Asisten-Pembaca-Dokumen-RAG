export interface RagQuery { question: string; topK?: number; }
export interface RagChunk { id: string; text: string; score: number; documentId: string; }
export interface RagAnswer { answer: string; sources: RagChunk[]; }
