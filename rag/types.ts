export type Format = 'md' | 'txt' | 'pdf' | 'docx';

export type RetrievedChunk = {
  content: string;
  source: string;
  score: number;
};
