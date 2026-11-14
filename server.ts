import express from "express";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";
import { WebSocketServer, WebSocket } from "ws";
import { verifyFirebaseIdToken, VerifiedFirebaseUser } from "./src/server/firebaseAuth";
import { MultiplayerRoomStore, MP_GAME_SPECS } from "./src/server/mpStore";
import * as practiceStore from "./src/server/practiceStore";
import * as practiceAi from "./src/server/practiceAi";
import type {
  AnalyzedMaterial,
  AnalyzedTopic,
  GroundedConcept,
  GroundedPuzzle,
  GroundedQuestion,
  GroundedSortRound,
  MaterialFileStatus,
  MultiplayerGameId,
  PracticeAnswerFeedback,
  PracticeMode,
  PracticeUserSettings,
  StudyItemType,
} from "./src/types";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build",
    },
  },
});

const MODEL_NAME = "gemini-4-hydrogen";

function handleAiError(res: express.Response, err: unknown, fallbackMsg: string) {
  console.error("Gemini API error:", err);
  const message = err instanceof Error ? err.message : String(err);
  if (message.includes("API_KEY_INVALID") || message.includes("PERMISSION_DENIED")) {
    return res.status(403).json({
      error: "Gemini API-sleutel ontbreekt of is ongeldig. Controleer de Secrets-instellingen.",
    });
  }
  if (message.includes("RESOURCE_EXHAUSTED") || message.includes("429")) {
    return res.status(429).json({
      error: "De AI-limiet is tijdelijk bereikt. Probeer het over een moment opnieuw.",
    });
  }
  return res.status(500).json({ error: `${fallbackMsg}: ${message}` });
}

function stripAccents(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function pickCleanKeyword(rawTerm: string): string {
  const words = stripAccents(rawTerm)
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 3 && /^[A-Z]+$/.test(w));

  if (words.length === 0) {
    const joined = stripAccents(rawTerm).toUpperCase().replace(/[^A-Z]/g, "");
    return joined.slice(0, 10);
  }
  const ideal = words.find((w) => w.length >= 4 && w.length <= 9);
  if (ideal) return ideal;
  return words.sort((a, b) => b.length - a.length)[0].slice(0, 10);
}

function extractBearerToken(req: express.Request): string {
  const authHeader = req.headers.authorization || "";
  if (authHeader.startsWith("Bearer ")) {
    return authHeader.slice(7).trim();
  }
  return "";
}

async function requireAuth(
  req: express.Request,
  res: express.Response,
  opts?: { forbidAnonymous?: boolean }
): Promise<VerifiedFirebaseUser | null> {
  try {
    const token = extractBearerToken(req);
    const user = await verifyFirebaseIdToken(token);
    if (opts?.forbidAnonymous && user.isAnonymous) {
      res.status(403).json({
        error: "Log in met een StudyFlow-account om een spelkamer aan te maken.",
      });
      return null;
    }
    return user;
  } catch (err) {
    res.status(401).json({
      error:
        err instanceof Error
          ? err.message
          : "Je sessie kon niet worden geverifieerd. Log opnieuw in.",
    });
    return null;
  }
}

interface RoomSocketEntry {
  ws: WebSocket;
  uid: string;
  mode: "lobby" | "game";
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: "8mb" }));

  const httpServer = http.createServer(app);
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });
  const roomSockets = new Map<string, Set<RoomSocketEntry>>();

  const mpStore = new MultiplayerRoomStore((roomCode, event) => {
    const sockets = roomSockets.get(roomCode);
    if (!sockets) return;
    const serialized = JSON.stringify(event);
    for (const entry of sockets) {
      if (entry.ws.readyState === WebSocket.OPEN) {
        entry.ws.send(serialized);
      }
    }
  });

  wss.on("connection", async (ws, req) => {
    try {
      const reqUrl = new URL(req.url || "/ws", "http://localhost");
      const code = (reqUrl.searchParams.get("code") || "").replace(/\D/g, "").slice(0, 6);
      const token = reqUrl.searchParams.get("token") || "";
      const modeParam = reqUrl.searchParams.get("mode") === "lobby" ? "lobby" : "game";

      if (code.length !== 6 || !token) {
        ws.close(1008, "Ongeldige kamer- of tokenparameters.");
        return;
      }

      const user = await verifyFirebaseIdToken(token);
      const entry: RoomSocketEntry = { ws, uid: user.uid, mode: modeParam };
      if (!roomSockets.has(code)) roomSockets.set(code, new Set());
      roomSockets.get(code)!.add(entry);

      mpStore.recordHeartbeat(code, user.uid, modeParam);

      // Push initial state cleanly if room exists
      try {
        const payload = mpStore.getPlayerPayload(code, user.uid);
        ws.send(JSON.stringify({ type: "room_snapshot", payload: payload.snapshot }));
      } catch (err) {
        ws.send(
          JSON.stringify({
            type: "room_terminated",
            payload: {
              roomCode: code,
              status: "ended",
              message: err instanceof Error ? err.message : "Spelkamer niet beschikbaar.",
            },
          })
        );
      }

      ws.on("message", (raw) => {
        try {
          const msg = JSON.parse(raw.toString()) as { type?: string };
          if (msg.type === "heartbeat") {
            mpStore.recordHeartbeat(code, user.uid, modeParam);
          } else if (msg.type === "tab_closing" && modeParam === "game") {
            const set = roomSockets.get(code);
            if (set) set.delete(entry);
            const remaining = Array.from(set || []).filter(
              (s) => s.uid === user.uid && s.mode === "game" && s.ws.readyState === WebSocket.OPEN
            ).length;
            mpStore.markPlayerTabClosed(code, user.uid, remaining);
          }
        } catch {
          // ignore malformed ws frames
        }
      });

      ws.on("close", () => {
        const set = roomSockets.get(code);
        if (set) {
          set.delete(entry);
          if (set.size === 0) roomSockets.delete(code);
        }
        if (modeParam === "game") {
          const remaining = Array.from(set || []).filter(
            (s) => s.uid === user.uid && s.mode === "game" && s.ws.readyState === WebSocket.OPEN
          ).length;
          mpStore.markPlayerTabClosed(code, user.uid, remaining);
        }
      });
    } catch {
      ws.close(1008, "Authenticatie via WebSocket mislukt.");
    }
  });

  // Health endpoint
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  // 1. AI Oefenschema Generator
  app.post("/api/ai/schedule", async (req, res) => {
    try {
      const { examDate, subjects, material, dailyMinutes, todayDate } = req.body as {
        examDate: string;
        subjects: string;
        material: string;
        dailyMinutes?: number;
        todayDate: string;
      };

      if (!examDate || !material) {
        return res.status(400).json({ error: "Toetsdatum en leerstof zijn verplicht." });
      }

      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: `Vandaag is ${todayDate}. De toetsdatum is ${examDate}.
Vak(ken): ${subjects || "Algemeen"}.
Gewenste leertijd per dag: ongeveer ${dailyMinutes || 45} minuten.
Opgegeven leerstof:
${material.slice(0, 20000)}

Maak een realistisch, wetenschappelijk onderbouwd dag-tot-dag oefenschema in het Nederlands tot en met de dag vóór de toets (of inclusief een korte herhaling op de dag zelf als er maar 1 dag is).
Pas principes van gespreide herhaling (spaced repetition), actieve herinnering (zelftests/flashcards) en afwisseling (interleaving) toe.`,
        config: {
          systemInstruction:
            "Je bent een ervaren Nederlandse studiecoach voor StudyFlow. Genereer concrete, haalbare dagtaken met een datum in exact YYYY-MM-DD formaat tussen vandaag en de toetsdatum.",
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              tasks: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING, description: "Korte concrete taaktitel in het Nederlands." },
                    subject: { type: Type.STRING, description: "Vaknaam." },
                    date: { type: Type.STRING, description: "Datum in YYYY-MM-DD formaat." },
                    durationMinutes: { type: Type.INTEGER, description: "Geschatte duur in minuten (10-120)." },
                    notes: { type: Type.STRING, description: "Concrete leerstrategie of aanpak voor deze taak." },
                  },
                  required: ["title", "subject", "date", "durationMinutes", "notes"],
                },
              },
            },
            required: ["tasks"],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{"tasks":[]}').trim());
      return res.json(parsed);
    } catch (err) {
      return handleAiError(res, err, "Kon het oefenschema niet genereren");
    }
  });

  // 2. AI Samenvatting Generator
  app.post("/api/ai/summary", async (req, res) => {
    try {
      const { title, subject, content } = req.body as {
        title: string;
        subject: string;
        content: string;
      };

      if (!content || !content.trim()) {
        return res.status(400).json({ error: "Broninhoud is leeg. Voeg eerst tekst toe aan het document." });
      }

      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: `Titel van de bron: ${title || "Studiedocument"}
Vak: ${subject || "Algemeen"}
Brontekst:
${content.slice(0, 60000)}

Maak een heldere, gestructureerde Nederlandse samenvatting in Markdown (met duidelijke koppen en opsommingen), een lijst met belangrijke kernbegrippen en definities, en een korte zelftest van 4 tot 6 vragen met antwoorden.`,
        config: {
          systemInstruction:
            "Je bent een Nederlandse studie-assistent voor StudyFlow. Maak overzichtelijke, nauwkeurige samenvattingen UITSLUITEND op basis van de aangeleverde bron. Verzin geen feiten buiten de bron.",
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              summaryTitle: { type: Type.STRING },
              content: { type: Type.STRING, description: "Gestructureerde Markdown-samenvatting met ## koppen en - opsommingen." },
              keyTerms: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    term: { type: Type.STRING },
                    definition: { type: Type.STRING },
                  },
                  required: ["term", "definition"],
                },
              },
              selfTest: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    question: { type: Type.STRING },
                    answer: { type: Type.STRING },
                  },
                  required: ["question", "answer"],
                },
              },
            },
            required: ["summaryTitle", "content", "keyTerms", "selfTest"],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? "{}").trim());
      return res.json(parsed);
    } catch (err) {
      return handleAiError(res, err, "Kon de samenvatting niet genereren");
    }
  });

  // 3. Strenge Leerstof-Analyse & Spelinhoud-Extractor (enkel uit geselecteerde bestanden)
  app.post("/api/ai/analyze-material", async (req, res) => {
    try {
      const { title, subject, selectedFolderIds, selectedItemIds, files } = req.body as {
        title?: string;
        subject?: string;
        selectedFolderIds?: string[];
        selectedItemIds?: string[];
        files: Array<{
          id: string;
          title: string;
          type: StudyItemType;
          subject?: string;
          content: string;
        }>;
      };

      if (!Array.isArray(files) || files.length === 0) {
        return res.status(400).json({
          error: "Selecteer minimaal één bestand of map om te analyseren.",
        });
      }

      const fileStatuses: MaterialFileStatus[] = [];
      const readableFiles: Array<{
        id: string;
        title: string;
        type: StudyItemType;
        subject: string;
        content: string;
      }> = [];
      const warnings: string[] = [];

      for (const f of files) {
        const cleanText = (f.content || "").trim();
        const isUnreadableNotice =
          cleanText.startsWith("(Geen selecteerbare tekst") ||
          cleanText.startsWith("(Kon ") ||
          cleanText.length < 25;

        if (isUnreadableNotice) {
          const warnMsg =
            cleanText.length === 0
              ? `Bestand "${f.title}" is leeg en bevat geen bruikbare tekst.`
              : `Bestand "${f.title}" bevat te weinig leesbare tekst (${cleanText.length} tekens) of is een scan zonder tekstlaag.`;
          warnings.push(warnMsg);
          fileStatuses.push({
            itemId: f.id,
            title: f.title,
            type: f.type,
            readable: false,
            charCount: cleanText.length,
            warning: warnMsg,
            topics: [],
          });
        } else {
          readableFiles.push({
            id: f.id,
            title: f.title,
            type: f.type,
            subject: f.subject || "Algemeen",
            content: cleanText,
          });
          fileStatuses.push({
            itemId: f.id,
            title: f.title,
            type: f.type,
            readable: true,
            charCount: cleanText.length,
            topics: [],
          });
        }
      }

      const combinedLength = readableFiles.reduce((acc, f) => acc + f.content.length, 0);
      const materialTitle =
        (title || "").trim() ||
        (readableFiles.length === 1
          ? readableFiles[0].title
          : `${files.length} geselecteerde bronnen`);
      const materialSubject =
        (subject || "").trim() ||
        readableFiles.find((f) => f.subject && f.subject !== "Algemeen")?.subject ||
        "Geselecteerde leerstof";

      if (readableFiles.length === 0 || combinedLength < 40) {
        const emptyResult: AnalyzedMaterial = {
          id: `mat_${Date.now()}`,
          title: materialTitle,
          subject: materialSubject,
          selectedFolderIds: Array.isArray(selectedFolderIds) ? selectedFolderIds : [],
          selectedItemIds: Array.isArray(selectedItemIds) ? selectedItemIds : files.map((f) => f.id),
          fileStatuses,
          topics: [],
          concepts: [],
          questions: [],
          sortRounds: [],
          puzzles: [],
          warnings: [
            ...warnings,
            "De geselecteerde bestanden bevatten samen onvoldoende leesbare leerstof. Kies bestanden met meer tekst voordat je een spel start.",
          ],
          analyzedAt: Date.now(),
        };
        return res.json(emptyResult);
      }

      // Distribute character budget fairly across selected readable files (max ~65k chars total)
      const perFileBudget = Math.max(3000, Math.floor(60000 / readableFiles.length));
      const sourceBlock = readableFiles
        .map(
          (f, i) =>
            `=== BRON ${i + 1}: "${f.title}" (type: ${f.type}, vak: ${f.subject}) ===\n${f.content.slice(0, perFileBudget)}`
        )
        .join("\n\n");

      const allowedTitles = readableFiles.map((f) => f.title);

      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: `ANALYSEER UITSLUITEND DE ONDERSTAANDE GESELECTEERDE BRONNEN:

${sourceBlock}

Geldige brontitels om naar te verwijzen: ${allowedTitles.map((t) => `"${t}"`).join(", ")}

Extraheer in het Nederlands:
1. topics (3 tot 10): overzicht van onderwerpen uit de bronnen, elk met name, sourceTitle (exact een van de geldige brontitels), sourceSection (bijv. "Pagina 2", "Dia 3", "Paragraaf 1" of kort kopje uit de tekst) en factCount.
2. concepts (tot 16 unieke kernbegrippen): elk met term (1-4 woorden, rechtstreeks uit de brontekst), definition (heldere uitleg uit de brontekst, max 130 tekens), sourceTitle en sourceSection.
3. questions (tot 18 unieke meerkeuzevragen): elk vraag+antwoord+uitleg MOET direct te controleren zijn in de brontekst! Precies 4 opties, correctIndex (0..3), difficulty ("easy" | "normal" | "hard"), explanation (leg uit waar in de bron het klopt), sourceTitle en sourceSection. Voorkom dubbele of vrijwel identieke vragen.
4. sortRounds (0 tot 3): ALLEEN maken als de brontekst zelf twee duidelijke categorieën/groepen/tijdvakken/begrippenfamilies bevat! Als de bron maar één onderwerp/categorie bevat, laat sortRounds dan LEEG ([]). Verzin NOOIT algemene kennis voor extra categorieën.
5. puzzles (2 tot 8): korte deductie-, code-, volgorde- of aanwijzingspuzzels (kind: "code" | "sequence" | "deduction" | "clue") die 100% afleidbaar zijn uit feiten, jaartallen, stappen, aantallen of oorzaak-gevolg uit de brontekst (NOOIT zelfbedachte rekensommen of verzonnen verhaaltjes). Elke puzzel heeft precies 4 opties, één exact passend answer (uit options), een hint en explanation uit de bron.`,
        config: {
          systemInstruction: `Je bent de strikte brongestuurde leerstof-analist van StudyFlow.
ABSOLUTE REGELS (GEEN ENKELE UITZONDERING):
1. Gebruik UITSLUITEND informatie die letterlijk of aantoonbaar afleidbaar in de aangeleverde bronnen staat.
2. Gebruik NOOIT algemene schoolkennis, internetfeiten, verzonnen rekensommen, verzonnen detectivescripts of externe voorbeelden.
3. Als een onderdeel (zoals sortRounds of puzzles) niet genoeg materiaal in de bron heeft, lever dan een kortere lijst of [] aan in plaats van iets te verzinnen.
4. Vermijd dubbele of vrijwel identieke vragen en begrippen.
5. Elke item moet exact naar een van de meegegeven brontitels verwijzen in sourceTitle.`,
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
              questions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    question: { type: Type.STRING },
                    options: { type: Type.ARRAY, items: { type: Type.STRING } },
                    correctIndex: { type: Type.INTEGER },
                    explanation: { type: Type.STRING },
                    difficulty: { type: Type.STRING },
                    sourceTitle: { type: Type.STRING },
                    sourceSection: { type: Type.STRING },
                  },
                  required: [
                    "question",
                    "options",
                    "correctIndex",
                    "explanation",
                    "difficulty",
                    "sourceTitle",
                    "sourceSection",
                  ],
                },
              },
              sortRounds: {
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
              puzzles: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    kind: { type: Type.STRING },
                    prompt: { type: Type.STRING },
                    options: { type: Type.ARRAY, items: { type: Type.STRING } },
                    answer: { type: Type.STRING },
                    hint: { type: Type.STRING },
                    explanation: { type: Type.STRING },
                    sourceTitle: { type: Type.STRING },
                    sourceSection: { type: Type.STRING },
                  },
                  required: [
                    "kind",
                    "prompt",
                    "options",
                    "answer",
                    "hint",
                    "explanation",
                    "sourceTitle",
                    "sourceSection",
                  ],
                },
              },
            },
            required: ["topics", "concepts", "questions", "sortRounds", "puzzles"],
          },
        },
      });

      const raw = JSON.parse((response.text ?? "{}").trim()) as {
        topics?: Array<{ name: string; sourceTitle: string; sourceSection: string; factCount: number }>;
        concepts?: Array<{ term: string; definition: string; sourceTitle: string; sourceSection: string }>;
        questions?: Array<{
          question: string;
          options: string[];
          correctIndex: number;
          explanation: string;
          difficulty: string;
          sourceTitle: string;
          sourceSection: string;
        }>;
        sortRounds?: Array<{
          topicTitle: string;
          bucketA: string;
          bucketB: string;
          sourceTitle: string;
          items: Array<{ label: string; bucketIndex: number; sourceTitle: string; sourceSection: string }>;
        }>;
        puzzles?: Array<{
          kind: string;
          prompt: string;
          options: string[];
          answer: string;
          hint: string;
          explanation: string;
          sourceTitle: string;
          sourceSection: string;
        }>;
      };

      const matchSourceTitle = (candidate: string): string => {
        const lower = (candidate || "").trim().toLowerCase();
        const found = allowedTitles.find((t) => t.toLowerCase() === lower);
        return found || allowedTitles[0];
      };

      // Deduplicate & normalize topics
      const topics: AnalyzedTopic[] = (raw.topics || [])
        .filter((t) => t.name?.trim())
        .slice(0, 12)
        .map((t) => ({
          name: t.name.trim(),
          sourceTitle: matchSourceTitle(t.sourceTitle),
          sourceSection: (t.sourceSection || "Brontekst").trim(),
          factCount: Math.max(1, Number(t.factCount) || 1),
        }));

      // Populate per-file topic tags
      for (const fsEntry of fileStatuses) {
        if (!fsEntry.readable) continue;
        fsEntry.topics = topics
          .filter((t) => t.sourceTitle === fsEntry.title)
          .map((t) => t.name);
      }

      // Deduplicate concepts
      const seenTerms = new Set<string>();
      const concepts: GroundedConcept[] = [];
      for (const c of raw.concepts || []) {
        const term = (c.term || "").trim();
        const def = (c.definition || "").trim();
        const norm = term.toLowerCase();
        if (!term || !def || seenTerms.has(norm)) continue;
        seenTerms.add(norm);
        concepts.push({
          id: `gc-${concepts.length + 1}`,
          term,
          definition: def,
          cleanWord: pickCleanKeyword(term),
          sourceTitle: matchSourceTitle(c.sourceTitle),
          sourceSection: (c.sourceSection || "Brontekst").trim(),
        });
      }

      // Deduplicate questions
      const seenQuestions = new Set<string>();
      const questions: GroundedQuestion[] = [];
      for (const q of raw.questions || []) {
        const text = (q.question || "").trim();
        const norm = text.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (!text || seenQuestions.has(norm)) continue;
        if (!Array.isArray(q.options) || q.options.length < 2) continue;
        seenQuestions.add(norm);
        const safeIdx = Math.max(0, Math.min(q.options.length - 1, Number(q.correctIndex) || 0));
        const diff =
          q.difficulty === "easy" || q.difficulty === "hard" ? q.difficulty : "normal";
        questions.push({
          question: text,
          options: q.options.slice(0, 4),
          correctIndex: safeIdx,
          explanation: (q.explanation || "").trim() || `Gebaseerd op ${matchSourceTitle(q.sourceTitle)}.`,
          difficulty: diff,
          sourceTitle: matchSourceTitle(q.sourceTitle),
          sourceSection: (q.sourceSection || "Brontekst").trim(),
        });
      }

      // Validate sortRounds
      const sortRounds: GroundedSortRound[] = [];
      for (const sr of raw.sortRounds || []) {
        if (!sr.bucketA?.trim() || !sr.bucketB?.trim() || !Array.isArray(sr.items)) continue;
        const validItems = sr.items
          .filter((it) => it.label?.trim() && (it.bucketIndex === 0 || it.bucketIndex === 1))
          .map((it) => ({
            label: it.label.trim(),
            bucketIndex: (it.bucketIndex === 1 ? 1 : 0) as 0 | 1,
            sourceTitle: matchSourceTitle(it.sourceTitle || sr.sourceTitle),
            sourceSection: (it.sourceSection || "Brontekst").trim(),
          }));
        if (validItems.length >= 4) {
          sortRounds.push({
            topicTitle: (sr.topicTitle || `${sr.bucketA} vs. ${sr.bucketB}`).trim(),
            buckets: [sr.bucketA.trim(), sr.bucketB.trim()],
            items: validItems,
            sourceTitle: matchSourceTitle(sr.sourceTitle),
          });
        }
      }

      // Validate puzzles
      const seenPuzzles = new Set<string>();
      const puzzles: GroundedPuzzle[] = [];
      for (const p of raw.puzzles || []) {
        const prompt = (p.prompt || "").trim();
        const norm = prompt.toLowerCase();
        if (!prompt || seenPuzzles.has(norm) || !Array.isArray(p.options) || p.options.length < 2) {
          continue;
        }
        seenPuzzles.add(norm);
        const kind =
          p.kind === "code" || p.kind === "sequence" || p.kind === "deduction"
            ? p.kind
            : "clue";
        const options = p.options.slice(0, 4);
        const matchingOption =
          options.find((o) => o.trim().toLowerCase() === (p.answer || "").trim().toLowerCase()) ||
          options[0];
        puzzles.push({
          id: `gp-${puzzles.length + 1}`,
          kind,
          prompt,
          options,
          answer: matchingOption,
          hint: (p.hint || "Kijk terug in de geselecteerde brontekst.").trim(),
          explanation: (p.explanation || "").trim(),
          sourceTitle: matchSourceTitle(p.sourceTitle),
          sourceSection: (p.sourceSection || "Brontekst").trim(),
        });
      }

      if (concepts.length < 3 && questions.length < 3) {
        warnings.push(
          "De geselecteerde bronnen bevatten vrij weinig concrete feiten of begrippen. Sommige spellen kunnen korter zijn of niet genoeg materiaal hebben."
        );
      }
      if (sortRounds.length === 0 && readableFiles.length < 2) {
        warnings.push(
          "In dit enkele document zijn geen twee duidelijke subcategorieën voor sorteerspellen aangetroffen (selecteer meerdere bronnen of een rijkere tekst voor Sort It!)."
        );
      }

      const analyzed: AnalyzedMaterial = {
        id: `mat_${Date.now()}`,
        title: materialTitle,
        subject: materialSubject,
        selectedFolderIds: Array.isArray(selectedFolderIds) ? selectedFolderIds : [],
        selectedItemIds: Array.isArray(selectedItemIds) ? selectedItemIds : files.map((f) => f.id),
        fileStatuses,
        topics,
        concepts,
        questions,
        sortRounds,
        puzzles,
        warnings,
        analyzedAt: Date.now(),
      };

      return res.json(analyzed);
    } catch (err) {
      return handleAiError(res, err, "Kon de geselecteerde leerstof niet analyseren");
    }
  });

  // 4. AI Leerspelletjes Generator (Strikt op basis van opgegeven tekst)
  app.post("/api/ai/game", async (req, res) => {
    try {
      const { title, subject, content, count } = req.body as {
        title?: string;
        subject?: string;
        content: string;
        count?: number;
      };

      if (!content || content.trim().length < 20) {
        return res.status(400).json({ error: "Geef voldoende leerstof op (minimaal enkele zinnen) om spelvragen te maken." });
      }

      const targetCount = Math.min(Math.max(Number(count) || 8, 4), 15);
      const pairCount = Math.min(Math.max(targetCount, 8), 12);

      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: `Onderwerp: ${title || "Leerstof"} (${subject || "Algemeen"})
Aantal items per speltype: maximaal ${targetCount} flashcards, ${pairCount} memory-paren en ${targetCount} meerkeuzevragen (alleen zoveel als de brontekst ondersteunt).
Brontekst:
${content.slice(0, 60000)}

Zet UITSLUITEND deze brontekst om in speelbare Nederlandse speldata zonder externe feiten:
1. flashcards: korte vraag/begrip op voorkant, helder antwoord op achterkant.
2. pairs: beknopte begrippen (1 tot 3 woorden, max 40 tekens) en definities (max 100 tekens) uit de tekst.
3. questions: unieke meerkeuzevragen met precies 4 opties, correctIndex (0 t/m 3), en uitleg uit de tekst.`,
        config: {
          systemInstruction:
            "Je bent een educatieve game-ontwerper voor StudyFlow. STRIKTE REGEL: Gebruik UITSLUITEND informatie die aantoonbaar in de aangeleverde brontekst staat. Gebruik geen algemene kennis of internetfeiten.",
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              setTitle: { type: Type.STRING },
              flashcards: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    front: { type: Type.STRING },
                    back: { type: Type.STRING },
                  },
                  required: ["front", "back"],
                },
              },
              pairs: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    term: { type: Type.STRING },
                    definition: { type: Type.STRING },
                  },
                  required: ["id", "term", "definition"],
                },
              },
              questions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    question: { type: Type.STRING },
                    options: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                    },
                    correctIndex: { type: Type.INTEGER },
                    explanation: { type: Type.STRING },
                  },
                  required: ["question", "options", "correctIndex", "explanation"],
                },
              },
            },
            required: ["setTitle", "flashcards", "pairs", "questions"],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? "{}").trim());
      return res.json(parsed);
    } catch (err) {
      return handleAiError(res, err, "Kon de spelset niet genereren");
    }
  });

  // 5. AI Studie-Notebook (Bron-gebaseerde Chat)
  app.post("/api/ai/notebook", async (req, res) => {
    try {
      const { sources, messages, prompt } = req.body as {
        sources: Array<{ title: string; subject: string; content: string }>;
        messages: Array<{ role: "user" | "assistant"; text: string }>;
        prompt: string;
      };

      if (!sources || sources.length === 0) {
        return res.status(400).json({ error: "Selecteer minimaal één actieve bron om vragen over te stellen." });
      }
      if (!prompt || !prompt.trim()) {
        return res.status(400).json({ error: "Stel eerst een vraag." });
      }

      const sourceBlock = sources
        .map(
          (s, idx) =>
            `[BRON ${idx + 1}: ${s.title}${s.subject ? ` (${s.subject})` : ""}]\n${(s.content || "(Leeg document)").slice(0, 25000)}`
        )
        .join("\n\n---\n\n");

      const historyBlock = (messages || [])
        .slice(-8)
        .map((m) => `${m.role === "user" ? "Leerling" : "StudyFlow Assistent"}: ${m.text}`)
        .join("\n");

      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: `GESELECTEERDE BRONNEN:
${sourceBlock}

EERDER GESPREK:
${historyBlock || "(Nieuw gesprek)"}

NIEUWE VRAAG VAN DE LEERLING:
${prompt}`,
        config: {
          systemInstruction: `Je bent de StudyFlow Studie-Notebook assistent.
STRIKTE REGEL: Beantwoord vragen UITSLUITEND op basis van de aangeleverde GESELECTEERDE BRONNEN.
- Gebruik geen externe kennis als iets niet in de bronnen staat.
- Als een antwoord niet in de geselecteerde bronnen te vinden is, zeg dat eerlijk en duidelijk in het Nederlands (bijv. "Dit staat niet in de geselecteerde bronnen...").
- Verwijs tussen haakjes of vetgedrukt naar de brontitel waar de informatie vandaan komt.
- Leg moeilijke concepten stap-voor-stap en helder uit. Gebruik Markdown-opmaak voor leesbaarheid.`,
        },
      });

      return res.json({ reply: response.text ?? "Geen antwoord ontvangen." });
    } catch (err) {
      return handleAiError(res, err, "Fout bij het beantwoorden van je vraag");
    }
  });

  // =========================================================================
  // 6. MULTIPLAYER SERVER API (6-cijferige kamercode, eigen tempo, 5-min expiry)
  // =========================================================================
  app.post("/api/mp/rooms", async (req, res) => {
    const user = await requireAuth(req, res, { forbidAnonymous: true });
    if (!user) return;
    try {
      const { gameId, title, difficulty, durationMinutes, maxPlayers, material, hostAvatar } =
        req.body as {
          gameId: MultiplayerGameId;
          title?: string;
          difficulty?: "easy" | "normal" | "hard";
          durationMinutes?: number;
          maxPlayers?: number;
          material: AnalyzedMaterial;
          hostAvatar?: string;
        };

      if (!gameId || !MP_GAME_SPECS[gameId]) {
        return res.status(400).json({ error: "Kies een geldig multiplayerspel." });
      }
      if (!material || !Array.isArray(material.fileStatuses)) {
        return res.status(400).json({ error: "Selecteer en analyseer eerst de leerstof." });
      }

      const snapshot = mpStore.createRoom({
        hostId: user.uid,
        hostName: user.name || "Spelleider",
        hostAvatar,
        gameId,
        title,
        difficulty,
        durationMinutes,
        maxPlayers,
        material,
      });

      return res.status(201).json({ snapshot });
    } catch (err) {
      return res.status(400).json({
        error: err instanceof Error ? err.message : "Kon spelkamer niet aanmaken.",
      });
    }
  });

  app.get("/api/mp/my-rooms", async (req, res) => {
    const user = await requireAuth(req, res);
    if (!user) return;
    const rooms = mpStore.getMyRooms(user.uid);
    return res.json({ rooms });
  });

  app.get("/api/mp/rooms/:code/info", (req, res) => {
    const code = String(req.params.code || "").replace(/\D/g, "").slice(0, 6);
    if (code.length !== 6) {
      return res.status(400).json({ error: "Ongeldige 6-cijferige spelcode." });
    }
    const info = mpStore.getRoomInfo(code);
    if (info.error) {
      return res.status(info.status === "ended" ? 410 : 404).json(info);
    }
    return res.json(info);
  });

  app.post("/api/mp/rooms/:code/join", async (req, res) => {
    const user = await requireAuth(req, res);
    if (!user) return;
    try {
      const code = String(req.params.code || "").replace(/\D/g, "").slice(0, 6);
      const { nickname, avatar } = (req.body || {}) as { nickname?: string; avatar?: string };
      mpStore.joinRoom(code, {
        uid: user.uid,
        nickname: nickname?.trim() || user.name || "Speler",
        avatar: avatar || "🦊",
      });
      const payload = mpStore.getPlayerPayload(code, user.uid);
      return res.json(payload);
    } catch (err) {
      return res.status(400).json({
        error: err instanceof Error ? err.message : "Kon niet deelnemen aan spelkamer.",
      });
    }
  });

  app.get("/api/mp/rooms/:code/state", async (req, res) => {
    const user = await requireAuth(req, res);
    if (!user) return;
    try {
      const code = String(req.params.code || "").replace(/\D/g, "").slice(0, 6);
      mpStore.recordHeartbeat(code, user.uid, "game");
      const payload = mpStore.getPlayerPayload(code, user.uid);
      return res.json(payload);
    } catch (err) {
      return res.status(404).json({
        error: err instanceof Error ? err.message : "Spelkamer niet gevonden.",
      });
    }
  });

  app.post("/api/mp/rooms/:code/start", async (req, res) => {
    const user = await requireAuth(req, res);
    if (!user) return;
    try {
      const code = String(req.params.code || "").replace(/\D/g, "").slice(0, 6);
      const snapshot = mpStore.startRoom(code, user.uid);
      return res.json({ snapshot });
    } catch (err) {
      return res.status(400).json({
        error: err instanceof Error ? err.message : "Kon spel niet starten.",
      });
    }
  });

  app.post("/api/mp/rooms/:code/end", async (req, res) => {
    const user = await requireAuth(req, res);
    if (!user) return;
    try {
      const code = String(req.params.code || "").replace(/\D/g, "").slice(0, 6);
      mpStore.endRoomByMaker(code, user.uid);
      return res.json({ ok: true });
    } catch (err) {
      return res.status(400).json({
        error: err instanceof Error ? err.message : "Kon spel niet beëindigen.",
      });
    }
  });

  app.post("/api/mp/rooms/:code/action", async (req, res) => {
    const user = await requireAuth(req, res);
    if (!user) return;
    try {
      const code = String(req.params.code || "").replace(/\D/g, "").slice(0, 6);
      const { type, payload } = (req.body || {}) as {
        type: string;
        payload?: Record<string, unknown>;
      };
      if (!type) return res.status(400).json({ error: "Actietype ontbreekt." });
      const out = mpStore.performAction(code, user.uid, { type, payload });
      return res.json(out);
    } catch (err) {
      return res.status(400).json({
        error: err instanceof Error ? err.message : "Actie kon niet worden uitgevoerd.",
      });
    }
  });

  app.post("/api/mp/rooms/:code/heartbeat", async (req, res) => {
    const user = await requireAuth(req, res);
    if (!user) return;
    const code = String(req.params.code || "").replace(/\D/g, "").slice(0, 6);
    const mode = req.body?.mode === "lobby" ? "lobby" : "game";
    mpStore.recordHeartbeat(code, user.uid, mode);
    return res.json({ ok: true });
  });

  app.post(
    "/api/mp/rooms/:code/leave-beacon",
    express.text({ type: ["text/plain", "application/json"], limit: "32kb" }),
    async (req, res) => {
      try {
        const code = String(req.params.code || "").replace(/\D/g, "").slice(0, 6);
        let token = extractBearerToken(req);
        if (!token && req.body) {
          const parsed = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
          if (parsed && typeof parsed.token === "string") token = parsed.token;
        }
        if (!token || code.length !== 6) {
          return res.status(204).end();
        }
        const user = await verifyFirebaseIdToken(token);
        const set = roomSockets.get(code);
        const remaining = Array.from(set || []).filter(
          (s) => s.uid === user.uid && s.mode === "game" && s.ws.readyState === WebSocket.OPEN
        ).length;
        mpStore.markPlayerTabClosed(code, user.uid, remaining);
      } catch {
        // swallow beacon errors silently
      }
      return res.status(204).end();
    }
  );

  // =========================================================================
  // 7. AI OEFENEN (Persoonlijk leren met AI — strikt geïsoleerd per gebruiker)
  // =========================================================================
  app.get("/api/practice/state", async (req, res) => {
    const user = await requireAuth(req, res, { forbidAnonymous: true });
    if (!user) return;
    return res.json(practiceStore.getPracticeDashboardState(user.uid));
  });

  app.put("/api/practice/settings", async (req, res) => {
    const user = await requireAuth(req, res, { forbidAnonymous: true });
    if (!user) return;
    const updated = practiceStore.saveUserSettings(
      user.uid,
      (req.body || {}) as Partial<PracticeUserSettings>
    );
    return res.json({ settings: updated });
  });

  app.post("/api/practice/selections", async (req, res) => {
    const user = await requireAuth(req, res, { forbidAnonymous: true });
    if (!user) return;
    try {
      const { id, name, subject, selectedFolderIds, selectedItemIds, files } = req.body as {
        id?: string;
        name?: string;
        subject?: string;
        selectedFolderIds?: string[];
        selectedItemIds?: string[];
        files: practiceAi.RawPracticeFileInput[];
      };

      if (!Array.isArray(files) || files.length === 0) {
        return res.status(400).json({ error: "Selecteer minimaal één bestand of map met leerstof." });
      }

      const bundle = practiceAi.prepareSourceBundle(files);
      const { topics, warnings } = await practiceAi.analyzePracticeTopics({
        ai,
        modelName: MODEL_NAME,
        bundle,
      });

      const cleanName =
        (name || "").trim() ||
        (files.length === 1 ? files[0].title : `${files.length} geselecteerde bronnen`);
      const cleanSubject = (subject || "").trim() || bundle.detectedSubject;

      const saved = practiceStore.upsertSavedSelection(user.uid, {
        id,
        name: cleanName,
        subject: cleanSubject,
        selectedFolderIds: Array.isArray(selectedFolderIds) ? selectedFolderIds : [],
        selectedItemIds: Array.isArray(selectedItemIds)
          ? selectedItemIds
          : files.map((f) => f.id),
        fileStatuses: bundle.fileStatuses,
        topics,
        warnings,
      });

      return res.json(saved);
    } catch (err) {
      return handleAiError(res, err, "Kon de leerstofselectie niet analyseren");
    }
  });

  app.delete("/api/practice/selections/:id", async (req, res) => {
    const user = await requireAuth(req, res, { forbidAnonymous: true });
    if (!user) return;
    const savedSelections = practiceStore.deleteSavedSelection(user.uid, String(req.params.id || ""));
    return res.json({ savedSelections });
  });

  app.post("/api/practice/sessions", async (req, res) => {
    const user = await requireAuth(req, res, { forbidAnonymous: true });
    if (!user) return;
    try {
      const {
        selectionId,
        selectionName,
        subject,
        mode,
        focusTopic,
        settings: rawSettings,
        topics: providedTopics,
        files,
      } = req.body as {
        selectionId?: string;
        selectionName?: string;
        subject?: string;
        mode: PracticeMode;
        focusTopic?: string;
        settings?: Partial<PracticeUserSettings>;
        topics?: AnalyzedTopic[];
        files: practiceAi.RawPracticeFileInput[];
      };

      if (!Array.isArray(files) || files.length === 0) {
        return res.status(400).json({ error: "Selecteer eerst leerstof om te oefenen." });
      }

      const bundle = practiceAi.prepareSourceBundle(files);
      if (bundle.readableFiles.length === 0) {
        return res.status(400).json({
          error: "Geen van de geselecteerde bestanden bevat leesbare tekst om vragen over te maken.",
        });
      }

      const cleanSettings = practiceStore.sanitizeSettings(rawSettings);
      practiceStore.saveUserSettings(user.uid, cleanSettings);

      const cleanSubject = (subject || "").trim() || bundle.detectedSubject;
      let topics = Array.isArray(providedTopics) ? providedTopics : [];
      if (topics.length === 0) {
        const analyzed = await practiceAi.analyzePracticeTopics({
          ai,
          modelName: MODEL_NAME,
          bundle,
        });
        topics = analyzed.topics;
      }

      const safeMode: PracticeMode =
        mode === "weak" || mode === "exam" || mode === "repeat" || mode === "topic"
          ? mode
          : "free";

      if (safeMode === "topic" && !(focusTopic || "").trim()) {
        return res.status(400).json({ error: "Kies eerst een specifiek onderwerp om te oefenen." });
      }

      const plan = practiceStore.buildAdaptivePlan({
        uid: user.uid,
        subject: cleanSubject,
        topics,
        mode: safeMode,
        focusTopic,
        settings: cleanSettings,
      });

      const generated = await practiceAi.generatePracticeQuestions({
        ai,
        modelName: MODEL_NAME,
        bundle,
        subject: cleanSubject,
        mode: safeMode,
        focusTopic,
        settings: cleanSettings,
        plan,
      });

      if (generated.questions.length === 0) {
        return res.status(400).json({
          error:
            generated.materialNotice ||
            "De geselecteerde bestanden bevatten onvoldoende verifieerbare leerstof voor deze oefenopdracht.",
        });
      }

      const sourceTexts: Record<string, string> = {};
      for (const rf of bundle.readableFiles) {
        sourceTexts[rf.title] = rf.content.slice(0, 30000);
      }

      const now = Date.now();
      const sessionPublic = practiceStore.createPracticeSession(user.uid, {
        id: `ps_${now}_${Math.random().toString(36).slice(2, 7)}`,
        selectionId: selectionId || "",
        selectionName:
          (selectionName || "").trim() ||
          (bundle.readableFiles.length === 1
            ? bundle.readableFiles[0].title
            : `${bundle.readableFiles.length} geselecteerde bronnen`),
        subject: cleanSubject,
        mode: safeMode,
        focusTopic: safeMode === "topic" ? focusTopic?.trim() : undefined,
        settings: cleanSettings,
        fileTitles: bundle.readableFiles.map((f) => f.title),
        topics,
        questions: generated.questions,
        answers: {},
        draftAnswers: {},
        currentIndex: 0,
        status: "active",
        startedAt: now,
        updatedAt: now,
        correctCount: 0,
        partialCount: 0,
        wrongCount: 0,
        materialNotice: generated.materialNotice,
        sourceTexts,
      });

      return res.status(201).json({
        session: sessionPublic,
        dashboard: practiceStore.getPracticeDashboardState(user.uid),
      });
    } catch (err) {
      return handleAiError(res, err, "Kon de oefensessie niet starten");
    }
  });

  app.post("/api/practice/sessions/:sessionId/draft", async (req, res) => {
    const user = await requireAuth(req, res, { forbidAnonymous: true });
    if (!user) return;
    const { draftAnswers, currentIndex } = (req.body || {}) as {
      draftAnswers?: Record<string, { typedAnswer?: string; selectedIndices?: number[] }>;
      currentIndex?: number;
    };
    const updated = practiceStore.saveDraftAnswers(
      user.uid,
      String(req.params.sessionId || ""),
      draftAnswers || {},
      currentIndex
    );
    if (!updated) return res.status(404).json({ error: "Oefensessie niet gevonden." });
    return res.json({ session: updated });
  });

  app.post("/api/practice/sessions/:sessionId/answer", async (req, res) => {
    const user = await requireAuth(req, res, { forbidAnonymous: true });
    if (!user) return;
    try {
      const sessionId = String(req.params.sessionId || "");
      const session = practiceStore.getPracticeSession(user.uid, sessionId);
      if (!session) return res.status(404).json({ error: "Oefensessie niet gevonden." });

      const { questionId, typedAnswer, selectedIndices, nextIndex } = (req.body || {}) as {
        questionId: string;
        typedAnswer?: string;
        selectedIndices?: number[];
        nextIndex?: number;
      };

      const question = session.questions.find((q) => q.id === questionId);
      if (!question) return res.status(404).json({ error: "Vraag niet gevonden in deze sessie." });

      let feedback: PracticeAnswerFeedback;
      if (question.type === "mc-single" || question.type === "mc-multi") {
        feedback = practiceAi.gradeMcPracticeAnswer(question, selectedIndices || []);
      } else {
        const sourceContent =
          session.sourceTexts?.[question.sourceTitle] ||
          Object.values(session.sourceTexts || {}).join("\n\n") ||
          question.evidenceQuote ||
          question.referenceAnswer;
        feedback = await practiceAi.gradeOpenPracticeAnswer({
          ai,
          modelName: MODEL_NAME,
          question,
          typedAnswer: typedAnswer || "",
          sourceContent,
        });
      }

      const result = practiceStore.recordSessionFeedbackBatch(user.uid, sessionId, [feedback], {
        currentIndex: nextIndex,
      });
      if (!result) return res.status(404).json({ error: "Kon voortgang niet opslaan." });

      return res.json({ feedback, session: result.session, dashboard: result.dashboard });
    } catch (err) {
      return handleAiError(res, err, "Kon je antwoord niet nakijken");
    }
  });

  app.post("/api/practice/sessions/:sessionId/submit-exam", async (req, res) => {
    const user = await requireAuth(req, res, { forbidAnonymous: true });
    if (!user) return;
    try {
      const sessionId = String(req.params.sessionId || "");
      const session = practiceStore.getPracticeSession(user.uid, sessionId);
      if (!session) return res.status(404).json({ error: "Oefensessie niet gevonden." });

      const { answers: submitted } = (req.body || {}) as {
        answers?: Record<string, { typedAnswer?: string; selectedIndices?: number[] }>;
      };

      const combinedDrafts = { ...(session.draftAnswers || {}), ...(submitted || {}) };
      const feedbackList: PracticeAnswerFeedback[] = [];

      for (const question of session.questions) {
        if (session.answers[question.id]) continue;
        const entry = combinedDrafts[question.id] || {};
        if (question.type === "mc-single" || question.type === "mc-multi") {
          feedbackList.push(
            practiceAi.gradeMcPracticeAnswer(question, entry.selectedIndices || [])
          );
        } else {
          const sourceContent =
            session.sourceTexts?.[question.sourceTitle] ||
            Object.values(session.sourceTexts || {}).join("\n\n") ||
            question.evidenceQuote ||
            question.referenceAnswer;
          const fb = await practiceAi.gradeOpenPracticeAnswer({
            ai,
            modelName: MODEL_NAME,
            question,
            typedAnswer: entry.typedAnswer || "",
            sourceContent,
          });
          feedbackList.push(fb);
        }
      }

      const result = practiceStore.recordSessionFeedbackBatch(user.uid, sessionId, feedbackList, {
        forceComplete: true,
      });
      if (!result) return res.status(404).json({ error: "Kon toets niet afronden." });

      return res.json({ session: result.session, dashboard: result.dashboard });
    } catch (err) {
      return handleAiError(res, err, "Kon de antwoorden niet nakijken");
    }
  });

  app.delete("/api/practice/sessions/:sessionId", async (req, res) => {
    const user = await requireAuth(req, res, { forbidAnonymous: true });
    if (!user) return;
    practiceStore.deletePracticeSession(user.uid, String(req.params.sessionId || ""));
    return res.json({ dashboard: practiceStore.getPracticeDashboardState(user.uid) });
  });

  // Mount Vite in development or serve built static files in production
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const PORT = Number(process.env.PORT) || 3000;
  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`StudyFlow server draait op poort ${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
