import ExcelJS from 'exceljs';

export const parseXlsx = async (filePath: string, filename: string, baseMetadata: any) => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const docs: { pageContent: string; metadata: any }[] = [];
  
  workbook.eachSheet((worksheet) => {
    let text = `--- Sheet ${worksheet.name} ---\n`;
    worksheet.eachRow((row) => {
      if (Array.isArray(row.values)) {
        text += row.values.slice(1).join(', ') + '\n';
      }
    });
    docs.push({
      pageContent: text,
      metadata: { ...baseMetadata, source: filename, sheet: worksheet.name }
    });
  });
  
  return docs;
};
