export const chunkDocuments = (
  docs: { pageContent: string; metadata: any }[],
  chunkSize = parseInt(process.env.CHUNK_SIZE || '4000', 10),
  overlap = parseInt(process.env.CHUNK_OVERLAP || '400', 10)
) => {
  const chunks = [];
  for (const doc of docs) {
    const text = doc.pageContent;
    const headerMatch = text.match(/^--- (Halaman|Sheet) .*? ---\n/);
    const header = headerMatch ? headerMatch[0] : '';
    
    let i = 0;
    while (i < text.length || i === 0) {
      const end = i + chunkSize;
      let chunkText = text.slice(i, end);
      
      if (header && !chunkText.startsWith(header)) {
        chunkText = header + chunkText;
      }
      
      chunks.push({ pageContent: chunkText, metadata: { ...doc.metadata } });
      if (text.length === 0) break;
      i += chunkSize - overlap;
      if (i >= text.length) break;
    }
  }
  return chunks;
};
