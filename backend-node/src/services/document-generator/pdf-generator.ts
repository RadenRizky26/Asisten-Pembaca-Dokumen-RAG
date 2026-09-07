import PDFDocument from 'pdfkit';
import fs from 'node:fs';
import path from 'node:path';

export async function generatePdf(text: string, outPath: string): Promise<string> {
  await fs.promises.mkdir(path.dirname(outPath), { recursive: true });
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const stream = fs.createWriteStream(outPath);
    doc.pipe(stream);
    doc.fontSize(11).text(text, { align: 'left' });
    doc.end();
    stream.on('finish', () => resolve(outPath));
    stream.on('error', reject);
  });
}
