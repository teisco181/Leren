import { GoogleGenAI, ThinkingLevel, Type } from "@google/genai";
import type { AnalyzedTopic, StudyItemType } from "../types";
import { generateContentWithFailover } from "./geminiClient";

export interface DeepSourceFile {
  id: string;
  title: string;
  type: StudyItemType;
  subject: string;
  content: string;
}

export interface DossierConcept {
  term: string;
  definition: string;
  sourceTitle: string;
  sourceSection: string;
}

export interface DossierFact {
  topic: string;
  statement: string;
  evidenceQuote: string;
  sourceTitle: string;
  sourceSection: string;
}

export interface DossierCategoryHint {
  topicTitle: string;
  bucketA: string;
  bucketB: string;
  sourceTitle: string;
  items: Array<{
    label: string;
    bucketIndex: 0 | 1;
    sourceTitle: string;
    sourceSection: string;
  }>;
}

export interface FullStudyDossier {
  topics: AnalyzedTopic[];
  concepts: DossierConcept[];
  facts: DossierFact[];
  categoryHints: DossierCategoryHint[];
  formattedFactDigest: string;
  chunksProcessed: number;
}

export function sanitizeSourceSection(candidate: string, fileContent: string): string {
  const clean = (candidate || "").trim();
  if (!clean) return "Brontekst";

  const pageMatch = clean.match(/\b(pagina|page|p\.)\s*(\d+)\b/i);
  if (pageMatch) {
    const num = pageMatch[2];
    const hasMarker = new RegExp(`(---|pagina|page)\\s*${num}\\b`, "i").test(fileContent);
    if (!hasMarker) return "Brontekst";
    return `Pagina ${num}`;
  }

  const diaMatch = clean.match(/\b(dia|slide)\s*(\d+)\b/i);
  if (diaMatch) {
    const num = diaMatch[2];
    const hasMarker = new RegExp(`(---|dia|slide)\\s*${num}\\b`, "i").test(fileContent);
    if (!hasMarker) return "Brontekst";
    return `Dia ${num}`;
  }

  const sectieMatch = clean.match(/\b(sectie|paragraaf|hoofdstuk)\s*([0-9.]+)\b/i);
  if (sectieMatch) {
    const num = sectieMatch[2];
    if (!fileContent.includes(num)) return "Brontekst";
  }

  return clean.slice(0, 60);
}

/**
 * Splits a single document cleanly along page/slide/section markers or paragraph breaks
 * so 100% of a long document can be analyzed without cutting off later pages.
 */
function splitDocumentIntoChunks(content: string, maxChunkChars = 36000): string[] {
  const clean = (content || "").trim();
  if (clean.length <= maxChunkChars) return [clean];

  // Try splitting on structural markers first
  const segments = clean.split(/(?=^---\s*(?:Pagina|Dia|Sectie)\s+\d+\s*---)/im).filter(Boolean);
  const units = segments.length > 1 ? segments : clean.split(/\n{2,}/).filter(Boolean);

  const chunks: string[] = [];
  let current = "";

  for (const unit of units) {
    if (unit.length > maxChunkChars) {
      if (current.trim()) {
        chunks.push(current.trim());
        current = "";
      }
      // Hard-split exceptionally huge single blocks safely at whitespace
      let offset = 0;
      while (offset < unit.length) {
        let end = Math.min(unit.length, offset + maxChunkChars);
        if (end < unit.length) {
          const lastSpace = unit.lastIndexOf(" ", end);
          if (lastSpace > offset + maxChunkChars * 0.6) end = lastSpace;
        }
        chunks.push(unit.slice(offset, end).trim());
        offset = end;
      }
      continue;
    }

    if (current.length + unit.length + 2 > maxChunkChars && current.trim()) {
      chunks.push(current.trim());
      current = unit;
    } else {
      current = current ? `${current}\n\n${unit}` : unit;
    }
  }

  if (current.trim()) {
    chunks.push(current.trim());
  }

  return chunks;
}

interface SourceBatchSegment {
  file: DeepSourceFile;
  partLabel: string;
  text: string;
}

function buildSourceBatches(
  files: DeepSourceFile[],
  maxBatchChars = 38000,
  maxBatches = 14
): SourceBatchSegment[][] {
  const segments: SourceBatchSegment[] = [];
  for (const file of files) {
    const chunks = splitDocumentIntoChunks(file.content, 34000);
    chunks.forEach((text, idx) => {
      const partLabel = chunks.length > 1 ? `deel ${idx + 1}/${chunks.length}` : "volledig";
      segments.push({ file, partLabel, text });
    });
  }

  const batches: SourceBatchSegment[][] = [];
  let currentBatch: SourceBatchSegment[] = [];
  let currentChars = 0;

  for (const seg of segments) {
    if (
      currentBatch.length > 0 &&
      currentChars + seg.text.length > maxBatchChars
    ) {
      batches.push(currentBatch);
      currentBatch = [];
      currentChars = 0;
    }
    currentBatch.push(seg);
    currentChars += seg.text.length;
  }

  if (currentBatch.length > 0) {
    batches.push(currentBatch);
  }

  return batches.slice(0, maxBatches);
}

/**
 * Phase 1 of 2-phase deep analysis:
 * Reads ALL chunks of ALL selected files with gemini-4-hydrogen + ThinkingLevel.XHIGH
 * to build a complete, verified knowledge dossier before generating any questions.
 */
export async function buildFullStudyDossier(params: {
  ai?: GoogleGenAI;
  modelName: string;
  files: DeepSourceFile[];
  includeCategoryHints?: boolean;
}): Promise<FullStudyDossier> {
  const { modelName, files, includeCategoryHints = false } = params;
  if (files.length === 0) {
    return {
      topics: [],
      concepts: [],
      facts: [],
      categoryHints: [],
      formattedFactDigest: "",
      chunksProcessed: 0,
    };
  }

  const batches = buildSourceBatches(files, 38000, 14);
  const fileMap = new Map<string, DeepSourceFile>();
  for (const f of files) fileMap.set(f.title.toLowerCase(), f);

  const matchFile = (candidate: string, fallback: DeepSourceFile): DeepSourceFile => {
    const key = (candidate || "").trim().toLowerCase();
    return fileMap.get(key) || fallback;
  };

  const mergedTopics = new Map<string, AnalyzedTopic>();
  const mergedConcepts = new Map<string, DossierConcept>();
  const mergedFacts: DossierFact[] = [];
  const seenFactNorms = new Set<string>();
  const categoryHints: DossierCategoryHint[] = [];

  for (let bIdx = 0; bIdx < batches.length; bIdx++) {
    const batch = batches[bIdx];
    const batchTitles = Array.from(new Set(batch.map((s) => s.file.title)));
    const batchBlock = batch
      .map(
        (seg, i) =>
          `=== BRON ${i + 1}: "${seg.file.title}" (${seg.partLabel}, type: ${seg.file.type}, vak: ${seg.file.subject}) ===\n${seg.text}`
      )
      .join("\n\n");

    const categoryInstruction = includeCategoryHints
      ? `4. categoryPairs (0 tot 2): ALLEEN als de tekst in dit fragment zelf twee duidelijke categorieën/tijdvakken/begrippenfamilies tegenover elkaar zet (anders []).`
      : "";

    const response = await generateContentWithFailover({
      model: modelName,
      contents: `FASE 1 — VOLLEDIGE LEERSTOF-INVENTARISATIE (fragment ${bIdx + 1} van ${batches.length}):
Lees ELKE alinea van begin tot eind en leg alle leerstof zorgvuldig vast zonder iets over te slaan.

${batchBlock}

Geldige brontitels: ${batchTitles.map((t) => `"${t}"`).join(", ")}

Extraheer volledig in het Nederlands uitsluitend op basis van bovenstaande tekst:
1. topics (2 tot 10): alle onderwerpen en deelonderwerpen in dit fragment met name, sourceTitle, sourceSection (ALLEEN "Pagina X" / "Dia X" als die marker bij de tekst staat, anders kopje of "Brontekst") en factCount.
2. concepts (alle belangrijke kernbegrippen uit dit fragment, tot 20): elk met term (1-4 woorden), definition (helder en volledig uit de bron, max 160 tekens), sourceTitle en sourceSection.
3. facts (alle toetsbare kernfeiten, verbanden, regels, jaartallen, formules of oorzaak-gevolg relaties uit dit hele fragment, 6 tot 24): elk met topic, statement (duidelijke inhoudelijke bewering uit de tekst), evidenceQuote (kort letterlijk citaat uit de tekst), sourceTitle en sourceSection.
${categoryInstruction}`,
      config: {
        thinkingConfig: { thinkingLevel: ThinkingLevel.XHIGH },
        systemInstruction: `Je bent de grondige leerstof-analist van StudyFlow.
STRIKTE REGELS:
1. Lees het hele aangeleverde fragment van het begin tot het einde zodat ook het midden en einde volledig worden meegenomen.
2. Gebruik UITSLUITEND informatie die aantoonbaar in de aangeleverde brontekst staat.
3. Gebruik NOOIT algemene kennis, internetfeiten of eigen aanvullingen.
4. Verzin NOOIT paginanummers of sectienummers die niet letterlijk in de tekst staan.`,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            topics: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  sourceTitle: { type: Type.STRING },
                  sourceSection: { type: Type.STRING },
                  factCount: { type: Type.INTEGER },
                },
                required: ["name", "sourceTitle", "sourceSection", "factCount"],
              },
            },
            concepts: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  term: { type: Type.STRING },
                  definition: { type: Type.STRING },
                  sourceTitle: { type: Type.STRING },
                  sourceSection: { type: Type.STRING },
                },
                required: ["term", "definition", "sourceTitle", "sourceSection"],
              },
            },
            facts: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  topic: { type: Type.STRING },
                  statement: { type: Type.STRING },
                  evidenceQuote: { type: Type.STRING },
                  sourceTitle: { type: Type.STRING },
                  sourceSection: { type: Type.STRING },
                },
                required: ["topic", "statement", "evidenceQuote", "sourceTitle", "sourceSection"],
              },
            },
            categoryPairs: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  topicTitle: { type: Type.STRING },
                  bucketA: { type: Type.STRING },
                  bucketB: { type: Type.STRING },
                  sourceTitle: { type: Type.STRING },
                  items: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        label: { type: Type.STRING },
                        bucketIndex: { type: Type.INTEGER },
                        sourceTitle: { type: Type.STRING },
                        sourceSection: { type: Type.STRING },
                      },
                      required: ["label", "bucketIndex", "sourceTitle", "sourceSection"],
                    },
                  },
                },
                required: ["topicTitle", "bucketA", "bucketB", "sourceTitle", "items"],
              },
            },
          },
          required: ["topics", "concepts", "facts"],
        },
      },
    });

    const parsed = JSON.parse((response.text ?? "{}").trim()) as {
      topics?: Array<{ name: string; sourceTitle: string; sourceSection: string; factCount: number }>;
      concepts?: Array<{ term: string; definition: string; sourceTitle: string; sourceSection: string }>;
      facts?: Array<{
        topic: string;
        statement: string;
        evidenceQuote: string;
        sourceTitle: string;
        sourceSection: string;
      }>;
      categoryPairs?: Array<{
        topicTitle: string;
        bucketA: string;
        bucketB: string;
        sourceTitle: string;
        items: Array<{
          label: string;
          bucketIndex: number;
          sourceTitle: string;
          sourceSection: string;
        }>;
      }>;
    };

    const defaultFallbackFile = batch[0].file;

    for (const t of parsed.topics || []) {
      const name = (t.name || "").trim();
      if (!name) continue;
      const file = matchFile(t.sourceTitle, defaultFallbackFile);
      const key = `${file.title.toLowerCase()}::${name.toLowerCase()}`;
      const existing = mergedTopics.get(key);
      if (existing) {
        existing.factCount += Math.max(1, Number(t.factCount) || 1);
      } else {
        mergedTopics.set(key, {
          name,
          sourceTitle: file.title,
          sourceSection: sanitizeSourceSection(t.sourceSection, file.content),
          factCount: Math.max(1, Number(t.factCount) || 1),
        });
      }
    }

    for (const c of parsed.concepts || []) {
      const term = (c.term || "").trim();
      const definition = (c.definition || "").trim();
      if (!term || !definition) continue;
      const key = term.toLowerCase();
      if (mergedConcepts.has(key)) continue;
      const file = matchFile(c.sourceTitle, defaultFallbackFile);
      mergedConcepts.set(key, {
        term,
        definition,
        sourceTitle: file.title,
        sourceSection: sanitizeSourceSection(c.sourceSection, file.content),
      });
    }

    for (const f of parsed.facts || []) {
      const statement = (f.statement || "").trim();
      if (!statement) continue;
      const norm = statement.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (seenFactNorms.has(norm)) continue;
      seenFactNorms.add(norm);
      const file = matchFile(f.sourceTitle, defaultFallbackFile);
      mergedFacts.push({
        topic: (f.topic || "Algemeen").trim(),
        statement,
        evidenceQuote: (f.evidenceQuote || "").trim(),
        sourceTitle: file.title,
        sourceSection: sanitizeSourceSection(f.sourceSection, file.content),
      });
    }

    if (includeCategoryHints && Array.isArray(parsed.categoryPairs)) {
      for (const sr of parsed.categoryPairs) {
        if (!sr.bucketA?.trim() || !sr.bucketB?.trim() || !Array.isArray(sr.items)) continue;
        const parentFile = matchFile(sr.sourceTitle, defaultFallbackFile);
        const validItems = sr.items
          .filter((it) => it.label?.trim() && (it.bucketIndex === 0 || it.bucketIndex === 1))
          .map((it) => {
            const itFile = matchFile(it.sourceTitle || sr.sourceTitle, parentFile);
            return {
              label: it.label.trim(),
              bucketIndex: (it.bucketIndex === 1 ? 1 : 0) as 0 | 1,
              sourceTitle: itFile.title,
              sourceSection: sanitizeSourceSection(it.sourceSection, itFile.content),
            };
          });
        if (validItems.length >= 4) {
          categoryHints.push({
            topicTitle: (sr.topicTitle || `${sr.bucketA} vs. ${sr.bucketB}`).trim(),
            bucketA: sr.bucketA.trim(),
            bucketB: sr.bucketB.trim(),
            sourceTitle: parentFile.title,
            items: validItems,
          });
        }
      }
    }
  }

  const topics = Array.from(mergedTopics.values()).slice(0, 24);
  const concepts = Array.from(mergedConcepts.values());

  const digestLines: string[] = [];
  if (concepts.length > 0) {
    digestLines.push("=== GEËXTRAHEERDE KERNBEGRIPPEN OVER DE VOLLEDIGE LEERSTOF ===");
    for (const c of concepts) {
      digestLines.push(`- [${c.sourceTitle} · ${c.sourceSection}] ${c.term}: ${c.definition}`);
    }
  }
  if (mergedFacts.length > 0) {
    digestLines.push("\n=== GEËXTRAHEERDE FEITEN & VERBANDEN OVER DE VOLLEDIGE LEERSTOF ===");
    for (const f of mergedFacts) {
      digestLines.push(
        `- (${f.topic} | ${f.sourceTitle} · ${f.sourceSection}) ${f.statement}${
          f.evidenceQuote ? ` [citaat: "${f.evidenceQuote.slice(0, 140)}"]` : ""
        }`
      );
    }
  }

  return {
    topics,
    concepts,
    facts: mergedFacts,
    categoryHints: categoryHints.slice(0, 4),
    formattedFactDigest: digestLines.join("\n"),
    chunksProcessed: batches.length,
  };
}

/**
 * Extracts a focused window of text around the matching section marker or keywords
 * inside a potentially huge (250k+ char) document so open-answer grading never misses later pages.
 */
export function extractRelevantSourceWindow(
  fullContent: string,
  sourceSection: string,
  keywordsText: string,
  maxChars = 32000
): string {
  const clean = (fullContent || "").trim();
  if (clean.length <= maxChars) return clean;

  // 1. Try matching explicit section marker like "Pagina 14" or "Dia 9"
  const secMatch = (sourceSection || "").match(/\b(Pagina|Dia|Sectie)\s+(\d+)\b/i);
  if (secMatch) {
    const markerRegex = new RegExp(`---\\s*${secMatch[1]}\\s+${secMatch[2]}\\s*---`, "i");
    const m = markerRegex.exec(clean);
    if (m && m.index >= 0) {
      const start = Math.max(0, m.index - 4000);
      const end = Math.min(clean.length, start + maxChars);
      return clean.slice(start, end);
    }
  }

  // 2. Fallback: find keyword hit from question/evidenceQuote
  const words = (keywordsText || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 5);

  const lower = clean.toLowerCase();
  for (const w of words) {
    const idx = lower.indexOf(w);
    if (idx >= 0) {
      const start = Math.max(0, idx - Math.floor(maxChars * 0.35));
      const end = Math.min(clean.length, start + maxChars);
      return clean.slice(start, end);
    }
  }

  return clean.slice(0, maxChars);
}
