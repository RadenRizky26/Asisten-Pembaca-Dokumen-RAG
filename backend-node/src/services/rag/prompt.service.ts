export type ContextDoc = { source?: string; page?: number; pageNumber?: number; text?: string; pageContent?: string; document?: string; cmetadata?: any; metadata?: any };

export function buildContext(docs: ContextDoc[]): string {
  return docs.map(d => {
    const m = d.cmetadata ?? d.metadata ?? {};
    const source = d.source ?? m.source ?? 'unknown';
    const page = d.page ?? d.pageNumber ?? m.page ?? m.loc?.pageNumber ?? null;
    const content = d.text ?? d.pageContent ?? d.document ?? '';
    const header = page != null ? `[Sumber: ${source}, halaman ${page}]` : `[Sumber: ${source}]`;
    return `${header}\n${content}`;
  }).join('\n\n');
}

export function buildRagPrompt(context: string, question: string): string {
  return `Konteks:\n${context}\n\nPertanyaan: ${question}\n\nJawab berdasarkan konteks di atas. Sertakan kutipan sumber bila relevan. Jika konteks tidak cukup, katakan tidak tahu.`;
}
