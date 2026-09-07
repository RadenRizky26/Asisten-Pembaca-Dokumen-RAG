import fs from 'fs/promises';
import pdfParse from 'pdf-parse';

export const parsePdf = async (filePath: string, filename: string, baseMetadata: any) => {
  const dataBuffer = await fs.readFile(filePath);
  const data = await pdfParse(dataBuffer);
  
  const pages = data.text.split(/\f/);
  return pages.map((pageText: string, i: number) => ({
    pageContent: `--- Halaman ${i + 1} ---\n${pageText}`,
    metadata: { ...baseMetadata, source: filename, page: i + 1 }
  }));
};
