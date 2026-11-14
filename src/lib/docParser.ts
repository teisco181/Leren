import JSZip from 'jszip';
import { StudyItemType } from '../types';
import { extractPdfContent } from './pdfUtils';

export interface ExtractedDocumentResult {
  type: Exclude<StudyItemType, 'note'>;
  title: string;
  text: string;
  dataUrl: string;
  mimeType: string;
  warning?: string;
}

function decodeXmlEntities(raw: string): string {
  return raw
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, dec) => String.fromCharCode(Number(dec)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function extractXmlTextRuns(xml: string, tagName: string): string[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'application/xml');
  const parserErr = doc.querySelector('parsererror');
  if (!parserErr) {
    const nodes = Array.from(doc.getElementsByTagName(tagName));
    const lines: string[] = [];
    for (const node of nodes) {
      const txt = (node.textContent || '').replace(/\s+/g, ' ').trim();
      if (txt) lines.push(txt);
    }
    return lines;
  }

  // Regex fallback if XML contains non-standard namespaces
  const escaped = tagName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`<${escaped}[^>]*>([\\s\\S]*?)<\\/${escaped}>`, 'g');
  const results: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(xml)) !== null) {
    const clean = decodeXmlEntities(match[1].replace(/<[^>]+>/g, ' '))
      .replace(/\s+/g, ' ')
      .trim();
    if (clean) results.push(clean);
  }
  return results;
}

async function extractDocxText(file: File): Promise<{ text: string; warning?: string }> {
  const buffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(buffer);
  const docEntry = zip.file('word/document.xml');
  if (!docEntry) {
    throw new Error('Ongeldig Word-bestand (.docx): hoofdtekst (word/document.xml) ontbreekt.');
  }
  const xml = await docEntry.async('string');
  const paragraphs = extractXmlTextRuns(xml, 'w:p');
  if (paragraphs.length === 0) {
    return {
      text: '',
      warning: 'Dit Word-bestand bevat geen leesbare tekst.',
    };
  }
  const sections: string[] = [];
  const chunkSize = 8;
  for (let i = 0; i < paragraphs.length; i += chunkSize) {
    const slice = paragraphs.slice(i, i + chunkSize);
    const secIdx = Math.floor(i / chunkSize) + 1;
    sections.push(`--- Sectie ${secIdx} ---\n${slice.join('\n')}`);
  }
  return { text: sections.join('\n\n').slice(0, 280000) };
}

async function extractPptxText(file: File): Promise<{ text: string; warning?: string }> {
  const buffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(buffer);
  const slidePaths = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort((a, b) => {
      const na = parseInt(a.match(/slide(\d+)\.xml/i)?.[1] || '0', 10);
      const nb = parseInt(b.match(/slide(\d+)\.xml/i)?.[1] || '0', 10);
      return na - nb;
    });

  if (slidePaths.length === 0) {
    return {
      text: '',
      warning: 'Deze PowerPoint-presentatie (.pptx) bevat geen dia-tekst.',
    };
  }

  const slideBlocks: string[] = [];
  for (let i = 0; i < slidePaths.length; i++) {
    const xml = await zip.files[slidePaths[i]].async('string');
    const runs = extractXmlTextRuns(xml, 'a:t');
    if (runs.length > 0) {
      slideBlocks.push(`--- Dia ${i + 1} ---\n${runs.join(' ')}`);
    }
  }

  if (slideBlocks.length === 0) {
    return {
      text: '',
      warning: 'Geen tekst gevonden op de dia’s van deze PowerPoint-presentatie.',
    };
  }
  return { text: slideBlocks.join('\n\n').slice(0, 280000) };
}

export async function extractStudyDocument(file: File): Promise<ExtractedDocumentResult> {
  const nameLower = file.name.toLowerCase();
  const baseTitle = file.name.replace(/\.[^.]+$/, '') || file.name;

  if (nameLower.endsWith('.pdf') || file.type === 'application/pdf') {
    const res = await extractPdfContent(file);
    const unreadable = res.text.startsWith('(Geen selecteerbare tekst');
    return {
      type: 'pdf',
      title: baseTitle,
      text: unreadable ? '' : res.text,
      dataUrl: res.dataUrl,
      mimeType: file.type || 'application/pdf',
      warning: unreadable ? res.text : undefined,
    };
  }

  if (
    nameLower.endsWith('.docx') ||
    file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    const res = await extractDocxText(file);
    return {
      type: 'docx',
      title: baseTitle,
      text: res.text,
      dataUrl: '',
      mimeType:
        file.type ||
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      warning: res.warning,
    };
  }

  if (
    nameLower.endsWith('.pptx') ||
    file.type === 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ) {
    const res = await extractPptxText(file);
    return {
      type: 'pptx',
      title: baseTitle,
      text: res.text,
      dataUrl: '',
      mimeType:
        file.type ||
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      warning: res.warning,
    };
  }

  if (
    nameLower.endsWith('.txt') ||
    nameLower.endsWith('.md') ||
    nameLower.endsWith('.csv') ||
    file.type.startsWith('text/')
  ) {
    const raw = (await file.text()).trim().slice(0, 280000);
    return {
      type: 'txt',
      title: baseTitle,
      text: raw,
      dataUrl: '',
      mimeType: file.type || 'text/plain',
      warning: raw.length === 0 ? 'Dit tekstbestand is leeg.' : undefined,
    };
  }

  if (nameLower.endsWith('.doc') || nameLower.endsWith('.ppt')) {
    throw new Error(
      'Oude .doc/.ppt-formaten worden niet ondersteund. Sla het bestand op als .docx, .pptx of .pdf.'
    );
  }

  throw new Error(
    `Bestandstype niet ondersteund (${file.name}). Ondersteunde bestanden: PDF, DOCX, PPTX, TXT, MD en CSV.`
  );
}
