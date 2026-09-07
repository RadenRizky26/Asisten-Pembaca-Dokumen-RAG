import mammoth from 'mammoth';

export const parseDocx = async (filePath: string, filename: string, baseMetadata: any) => {
  const result = await mammoth.extractRawText({ path: filePath });
  return [{
    pageContent: result.value,
    metadata: { ...baseMetadata, source: filename }
  }];
};
