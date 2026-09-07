import fs from 'fs/promises';
import JSZip from 'jszip';

export const parsePptx = async (filePath: string, filename: string, baseMetadata: any) => {
  const dataBuffer = await fs.readFile(filePath);
  const zip = await JSZip.loadAsync(dataBuffer);
  const docs = [];
  
  const slideFiles = Object.keys(zip.files).filter(f => f.match(/^ppt\/slides\/slide\d+\.xml$/));
  
  for (const sf of slideFiles) {
    const match = sf.match(/slide(\d+)\.xml/);
    const pageNum = match ? parseInt(match[1], 10) : 1;
    const content = await zip.files[sf].async('string');
    const texts = content.match(/<a:t>([^<]*)<\/a:t>/g)?.map(t => t.replace(/<\/?a:t>/g, '')) || [];
    
    docs.push({
      pageContent: `--- Halaman ${pageNum} ---\n` + texts.join(' '),
      metadata: { ...baseMetadata, source: filename, page: pageNum }
    });
  }
  
  return docs;
};
