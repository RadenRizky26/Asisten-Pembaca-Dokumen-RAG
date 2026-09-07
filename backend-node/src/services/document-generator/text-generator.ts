import fs from 'node:fs';
import path from 'node:path';
export async function generateText(text: string, outPath: string): Promise<string> {
  await fs.promises.mkdir(path.dirname(outPath), { recursive: true });
  await fs.promises.writeFile(outPath, text, 'utf-8');
  return outPath;
}
