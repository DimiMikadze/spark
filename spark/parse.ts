import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { extractText, getDocumentProxy } from 'unpdf';
import mammoth from 'mammoth';
import type { Format } from './types';

export type ParsedFile = { text: string; format: Format };

export const SUPPORTED_EXTENSIONS = ['.md', '.markdown', '.txt', '.pdf', '.docx'] as const;

export async function parseFile(path: string): Promise<ParsedFile> {
  const ext = extname(path).toLowerCase();
  switch (ext) {
    case '.md':
    case '.markdown':
      return { text: await readFile(path, 'utf8'), format: 'md' };
    case '.txt':
      return { text: await readFile(path, 'utf8'), format: 'txt' };
    case '.pdf': {
      const buffer = await readFile(path);
      const pdf = await getDocumentProxy(new Uint8Array(buffer));
      const result = await extractText(pdf, { mergePages: true });
      const text = Array.isArray(result.text) ? result.text.join('\n\n') : result.text;
      return { text, format: 'pdf' };
    }
    case '.docx': {
      const result = await mammoth.extractRawText({ path });
      return { text: result.value, format: 'docx' };
    }
    default:
      throw new Error(`Unsupported file type: ${ext} (${path})`);
  }
}
