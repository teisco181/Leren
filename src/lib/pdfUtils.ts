import * as pdfjsLib from 'pdfjs-dist';
// Configure PDF.js worker using Vite ?url asset import so it bundles cleanly offline/hermetically
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

export interface ExtractedPdfResult {
  text: string;
  pageCount: number;
  dataUrl: string;
}

export async function extractPdfContent(file: File): Promise<ExtractedPdfResult> {
  const arrayBuffer = await file.arrayBuffer();
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(new Error('Kon PDF-bestand niet lezen.'));
    reader.readAsDataURL(file);
  });

  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
  const pdf = await loadingTask.promise;
  const pageTexts: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const strings = textContent.items
      .map((item) => ('str' in item ? item.str : ''))
      .filter(Boolean);
    pageTexts.push(`--- Pagina ${i} ---\n${strings.join(' ')}`);
  }

  // Keep under Firestore field limit while preserving rich text for Gemini AI
  const fullText = pageTexts.join('\n\n').slice(0, 250000);

  return {
    text: fullText || '(Geen selecteerbare tekst gevonden in deze PDF; mogelijk is het een gescande afbeelding.)',
    pageCount: pdf.numPages,
    dataUrl,
  };
}
