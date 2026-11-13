import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";

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

async function startServer() {
  const app = express();
  app.use(express.json({ limit: "4mb" }));

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
      const { title, subject, content, sourceType } = req.body as {
        title: string;
        subject: string;
        content: string;
        sourceType?: string;
      };

      if (!content || !content.trim()) {
        return res.status(400).json({ error: "Broninhoud is leeg. Voeg eerst tekst toe aan het document." });
      }

      const typeHint =
        sourceType === "gslide"
          ? "De bron is een Google Presentatie (dia's met sprekersnotities). Structureer de samenvatting per thema/onderwerp van de dia's en verwerk belangrijke voorbeelden uit de dia's."
          : sourceType === "gsheet"
            ? "De bron is een Google Spreadsheet (tabbladen en tabelrijen gescheiden door |). Zet de tabelgegevens en begrippen overzichtelijk om in een samenhangende samenvatting."
            : "";

      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: `Titel van de bron: ${title || "Studiedocument"}
Vak: ${subject || "Algemeen"}
${typeHint}
Brontekst:
${content.slice(0, 60000)}

Maak een heldere, gestructureerde Nederlandse samenvatting in Markdown (met duidelijke koppen en opsommingen), een lijst met belangrijke kernbegrippen en definities, en een korte zelftest van 4 tot 6 vragen met antwoorden.`,
        config: {
          systemInstruction:
            "Je bent een Nederlandse studie-assistent voor StudyFlow. Maak overzichtelijke, nauwkeurige samenvattingen op basis van de aangeleverde bron. Verzin geen feiten buiten de bron.",
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

  // 3. AI Leerspelletjes Generator (Flashcards, Memory/Speed-Match, Quiz Battle)
  app.post("/api/ai/game", async (req, res) => {
    try {
      const { title, subject, content, count, sourceType } = req.body as {
        title?: string;
        subject?: string;
        content: string;
        count?: number;
        sourceType?: string;
      };

      if (!content || content.trim().length < 20) {
        return res.status(400).json({ error: "Geef voldoende leerstof op (minimaal enkele zinnen) om spelvragen te maken." });
      }

      const targetCount = Math.min(Math.max(Number(count) || 8, 4), 15);
      const sourceHint =
        sourceType === "gsheet"
          ? "LET OP: De bron komt uit een Google Spreadsheet met tabellen/rijen (gescheiden door |). Gebruik de kolommen (bijv. woordjes, vertalingen, jaartallen of begrip-definitie paren) direct als basis voor nauwkeurige flashcards, memory-paren en quizvragen."
          : sourceType === "gslide"
            ? "LET OP: De bron komt uit een Google Presentatie (dia's + sprekersnotities). Zet de kernconcepten uit alle dia's om in concrete oefenvragen en flashcards."
            : "";

      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents: `Onderwerp: ${title || "Leerstof"} (${subject || "Algemeen"})
Aantal items per speltype: ongeveer ${targetCount} flashcards, ${Math.min(targetCount, 8)} memory-paren en ${targetCount} meerkeuzevragen.
${sourceHint}
Leerstof:
${content.slice(0, 60000)}

Zet deze leerstof om in speelbare Nederlandse speldata:
1. flashcards: korte vraag/begrip op voorkant, helder antwoord op achterkant.
2. pairs: korte begrippen (max 40 tekens) en beknopte definities (max 90 tekens) voor een snel Memory / Match-spel.
3. questions: uitdagende meerkeuzevragen met precies 4 opties, correctIndex (0 t/m 3), en een duidelijke uitleg waarom het juiste antwoord klopt (wordt getoond bij fout antwoord).`,
        config: {
          systemInstruction:
            "Je bent een educatieve game-ontwerper voor StudyFlow. Genereer foutloze, leerzame spelvragen in het Nederlands op basis van de gegeven leerstof.",
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

  // 4. AI Studie-Notebook (Bron-gebaseerde Chat)
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
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`StudyFlow server draait op poort ${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
