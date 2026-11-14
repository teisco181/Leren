import { GoogleGenAI, ThinkingLevel, Type } from "@google/genai";
import type {
  AnalyzedTopic,
  MaterialFileStatus,
  PracticeAnswerFeedback,
  PracticeDifficulty,
  PracticeMode,
  PracticeUserSettings,
  StudyItemType,
} from "../types";
import type { AdaptivePlan, PracticeQuestionInternal } from "./practiceStore";
import {
  buildFullStudyDossier,
  extractRelevantSourceWindow,
  sanitizeSourceSection,
} from "./deepMaterialAnalyzer";
import { generateContentWithFailover } from "./geminiClient";

export interface RawPracticeFileInput {
  id: string;
  title: string;
  type: StudyItemType;
  subject?: string;
  content: string;
}

export interface ReadablePracticeFile {
  id: string;
  title: string;
  type: StudyItemType;
  subject: string;
  content: string;
}

export interface PreparedSourceBundle {
  fileStatuses: MaterialFileStatus[];
  readableFiles: ReadablePracticeFile[];
  warnings: string[];
  allowedTitles: string[];
  sourceBlock: string;
  detectedSubject: string;
}



export function prepareSourceBundle(files: RawPracticeFileInput[]): PreparedSourceBundle {
  const fileStatuses: MaterialFileStatus[] = [];
  const readableFiles: ReadablePracticeFile[] = [];
  const warnings: string[] = [];

  for (const f of files) {
    const cleanText = (f.content || "").trim();
    const isBinaryError =
      cleanText.startsWith("[PDF kon niet") ||
      cleanText.startsWith("[DOCX kon niet") ||
      cleanText.startsWith("[PPTX kon niet") ||
      cleanText.startsWith("[Bestand kon niet");

    if (cleanText.length < 30 || isBinaryError) {
      const warnMsg = isBinaryError
        ? `"${f.title}" kon niet goed worden uitgelezen.`
        : `"${f.title}" bevat te weinig leesbare tekst (leeg bestand of alleen afbeeldingen).`;
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
        // Keep full extracted text (up to 250k chars) so Phase 1 reads every page/section
        content: cleanText.slice(0, 250000),
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

  const allowedTitles = readableFiles.map((f) => f.title);
  // Spread representative preview excerpts cleanly (start, middle, end) for compact fallback
  const perFileBudget =
    readableFiles.length > 0 ? Math.max(4000, Math.floor(62000 / readableFiles.length)) : 0;

  const sourceBlock = readableFiles
    .map((f, i) => {
      let excerpt = f.content;
      if (f.content.length > perFileBudget) {
        const part = Math.floor(perFileBudget / 3);
        const midStart = Math.max(part, Math.floor(f.content.length / 2 - part / 2));
        const endStart = Math.max(midStart + part, f.content.length - part);
        excerpt = [
          f.content.slice(0, part),
          "\n... [midden van document] ...\n",
          f.content.slice(midStart, midStart + part),
          "\n... [einde van document] ...\n",
          f.content.slice(endStart),
        ].join("");
      }
      return `=== BRON ${i + 1}: "${f.title}" (type: ${f.type}, vak: ${f.subject}, ${f.content.length} tekens) ===\n${excerpt}`;
    })
    .join("\n\n");

  const detectedSubject =
    readableFiles.find((f) => f.subject && f.subject !== "Algemeen")?.subject || "Algemeen";

  return {
    fileStatuses,
    readableFiles,
    warnings,
    allowedTitles,
    sourceBlock,
    detectedSubject,
  };
}

export async function analyzePracticeTopics(params: {
  ai?: GoogleGenAI;
  modelName: string;
  bundle: PreparedSourceBundle;
}): Promise<{ topics: AnalyzedTopic[]; dossierSummary: string; warnings: string[] }> {
  const { ai, modelName, bundle } = params;
  if (bundle.readableFiles.length === 0) {
    return {
      topics: [],
      dossierSummary: "",
      warnings: [
        ...bundle.warnings,
        "De geselecteerde bestanden bevatten geen leesbare leerstof.",
      ],
    };
  }

  // Phase 1: Deep full-material reading over 100% of all chunks/pages with ThinkingLevel.XHIGH
  const dossier = await buildFullStudyDossier({
    ai,
    modelName,
    files: bundle.readableFiles,
    includeCategoryHints: false,
  });

  const topics = dossier.topics;
  for (const status of bundle.fileStatuses) {
    if (!status.readable) continue;
    status.topics = topics.filter((t) => t.sourceTitle === status.title).map((t) => t.name);
  }

  const warnings = [...bundle.warnings];
  if (topics.length === 0) {
    warnings.push("Er konden geen duidelijke losse onderwerpen uit de geselecteerde bestanden worden gehaald.");
  }

  return {
    topics,
    dossierSummary: dossier.formattedFactDigest,
    warnings,
  };
}

export async function generatePracticeQuestions(params: {
  ai?: GoogleGenAI;
  modelName: string;
  bundle: PreparedSourceBundle;
  subject: string;
  mode: PracticeMode;
  focusTopic?: string;
  settings: PracticeUserSettings;
  plan: AdaptivePlan;
  dossierSummary?: string;
}): Promise<{ questions: PracticeQuestionInternal[]; dossierSummary: string; materialNotice?: string }> {
  const { ai, modelName, bundle, subject, mode, focusTopic, settings, plan } = params;

  // Ensure Phase 1 full-material analysis has ALWAYS run before generating questions
  let resolvedDossier = (params.dossierSummary || "").trim();
  if (!resolvedDossier) {
    const dossier = await buildFullStudyDossier({
      ai,
      modelName,
      files: bundle.readableFiles,
      includeCategoryHints: false,
    });
    resolvedDossier = dossier.formattedFactDigest;
  }

  const slotSpec = plan.slots
    .map((s, idx) => {
      const weak = s.weakAspects.length > 0 ? ` | focus op zwak aspect: "${s.weakAspects[0]}"` : "";
      return `Vraag ${idx + 1}: type=${s.questionType}, onderwerp="${s.topic}", bron="${s.sourceTitle}", niveau=${s.difficulty} (${s.reason})${weak}`;
    })
    .join("\n");

  const recentAvoidBlock =
    plan.recentQuestionPrompts.length > 0
      ? plan.recentQuestionPrompts.map((p, i) => `${i + 1}. ${p}`).join("\n")
      : "(Geen eerdere vragen)";

  const missedBlock =
    plan.missedQuestionsContext.length > 0
      ? plan.missedQuestionsContext
          .map((m) => `- Onderwerp "${m.topic}": "${m.prompt}" (fout/gemist: ${m.whatWentWrong})`)
          .join("\n")
      : "(Geen eerdere fouten geregistreerd)";

  const modeDescription: Record<PracticeMode, string> = {
    free: "Vrij oefenen: adaptieve mix aangepast aan het kennisniveau van de leerling.",
    weak: "Zwakke punten oefenen: gerichte vragen over moeilijke onderwerpen en ontbrekende details.",
    exam: "Toetsvoorbereiding: representatieve toetsvragen verspreid over de geselecteerde stof.",
    repeat:
      "Herhalen: formuleer nieuwe varianten of andere invalshoeken voor eerder gemiste of langer niet geoefende stof.",
    topic: `Onderwerp oefenen: ALLE vragen moeten uitsluitend over het onderwerp "${focusTopic || ""}" gaan.`,
  };

  // Phase 2: Generate evenly distributed, deep questions across the full dossier + representative excerpts
  const response = await generateContentWithFailover({
    model: modelName,
    contents: `FASE 1 — VOLLEDIG KENNISDOSSIER VAN ALLE GESELECTEERDE LEERSTOF (BEGIN TOT EIND):
${resolvedDossier || "(Geen extra dossieroverzicht beschikbaar)"}

REPRESENTATIEVE BRONTREKKEN UIT DE DOCUMENTEN:
${bundle.sourceBlock}

Geldige brontitels: ${bundle.allowedTitles.map((t) => `"${t}"`).join(", ")}
Vak: ${subject}
Oefenvorm: ${modeDescription[mode]}
Gevraagde vraagplanning (${plan.slots.length} vragen):
${slotSpec}

PERSOONLIJK KENNISPROFIEL VAN DE LEERLING (gebruik dit voor moeilijkheid en gerichte opvolging):
${plan.masterySummaryForPrompt || "(Nieuwe leerling)"}

EERDERE FOUTEN OM OP TE VOLGEN (indien aanwezig in de geselecteerde bron):
${missedBlock}

EERDER GESTELDE VRAGEN (HERHAAL DEZE NIET LETTERLIJK — maak nieuwe vragen of andere invalshoeken):
${recentAvoidBlock}

INSTRUCTIES PER VRAAGTYPE:
1. "open":
   - Leerling moet het antwoord in eigen woorden formuleren (begrip, uitleg, oorzaak-gevolg, vergelijking of toepassing vanuit de bron).
   - Geef in "referenceAnswer" een volledig, duidelijk voorbeeldantwoord dat 100% uit de bron volgt.
   - "options" en "correctIndices" zijn leeg ([]).
2. "mc-single":
   - Precies 4 antwoordopties ("options"), precies 1 juiste index in "correctIndices" (bijv. [2]).
   - De 3 foute opties moeten geloofwaardige, vakinhoudelijke afleiders zijn uit dezelfde context — GEEN onzinnige of overduidelijk belachelijke keuzes.
3. "mc-multi":
   - Precies 4 antwoordopties ("options"), met 2 of 3 juiste indices in "correctIndices" (bijv. [0, 2]).
   - Vermeld in de vraagtekst duidelijk dat meerdere antwoorden goed kunnen zijn.
4. VOOR ALLE VRAGEN:
   - "sourceTitle": exact één van de geldige brontitels.
   - "sourceSection": ALLEEN "Pagina X" of "Dia X" als die marker echt bij die tekst staat, anders een kort kopje of "Brontekst". NOOIT paginanummers verzinnen!
   - "evidenceQuote": een kort letterlijk citaat (max 180 tekens) uit de bron dat het antwoord bewijst.
   - "hint": een subtiele tip zonder het antwoord weg te geven (${settings.hintsEnabled ? "verplicht kort en behulpzaam" : "korte verwijzing naar het onderwerp"}).
   - ALS de geselecteerde bronnen te weinig verschillende verifieerbare feiten bevatten voor alle ${plan.slots.length} vragen (of voor het gekozen onderwerp "${focusTopic || ""}"), lever dan MINDER vragen aan en beschrijf eerlijk waarom in "insufficientMaterialReason". Verzin NOOIT feiten van buitenaf!
   - Spreid de vragen eerlijk over ALLE onderwerpen en over het begin, midden en einde van de geselecteerde bestanden.`,
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.XHIGH },
      systemInstruction: `Je bent de persoonlijke AI-docent van StudyFlow Oefenen.
STRIKTE BRONREGEL (GEEN UITZONDERINGEN):
- Gebruik UITSLUITEND feiten uit het FASE 1-DOSSIER en de BRONTREKKEN hierboven.
- Voeg GEEN algemene kennis, internetfeiten of eigen verzinsels toe.
- Als iets niet in de geselecteerde tekst staat, maak er geen vraag over en vul geen ontbrekend detail aan.
- Alle vragen, opties, voorbeeldantwoorden en uitleg moeten in natuurlijk Nederlands zijn en direct controleerbaar in de bron.`,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          insufficientMaterialReason: { type: Type.STRING },
          questions: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                type: { type: Type.STRING },
                topic: { type: Type.STRING },
                difficulty: { type: Type.STRING },
                prompt: { type: Type.STRING },
                options: { type: Type.ARRAY, items: { type: Type.STRING } },
                correctIndices: { type: Type.ARRAY, items: { type: Type.INTEGER } },
                referenceAnswer: { type: Type.STRING },
                explanation: { type: Type.STRING },
                hint: { type: Type.STRING },
                sourceTitle: { type: Type.STRING },
                sourceSection: { type: Type.STRING },
                evidenceQuote: { type: Type.STRING },
                targetedWeakAspect: { type: Type.STRING },
              },
              required: [
                "type",
                "topic",
                "difficulty",
                "prompt",
                "options",
                "correctIndices",
                "referenceAnswer",
                "explanation",
                "hint",
                "sourceTitle",
                "sourceSection",
                "evidenceQuote",
              ],
            },
          },
        },
        required: ["insufficientMaterialReason", "questions"],
      },
    },
  });

  const parsed = JSON.parse((response.text ?? "{}").trim()) as {
    insufficientMaterialReason?: string;
    questions?: Array<{
      type: string;
      topic: string;
      difficulty: string;
      prompt: string;
      options: string[];
      correctIndices: number[];
      referenceAnswer: string;
      explanation: string;
      hint: string;
      sourceTitle: string;
      sourceSection: string;
      evidenceQuote: string;
      targetedWeakAspect?: string;
    }>;
  };

  const matchFile = (candidate: string): ReadablePracticeFile => {
    const lower = (candidate || "").trim().toLowerCase();
    return (
      bundle.readableFiles.find((f) => f.title.toLowerCase() === lower) ||
      bundle.readableFiles[0]
    );
  };

  const recentNorms = new Set(
    plan.recentQuestionPrompts.map((p) => p.toLowerCase().replace(/[^a-z0-9]/g, ""))
  );
  const seenPrompts = new Set<string>();
  const validated: PracticeQuestionInternal[] = [];

  for (const rawQ of parsed.questions || []) {
    const prompt = (rawQ.prompt || "").trim();
    if (!prompt) continue;
    const norm = prompt.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (seenPrompts.has(norm)) continue;
    if (mode !== "repeat" && recentNorms.has(norm)) continue;

    const matchedFile = matchFile(rawQ.sourceTitle);
    const diff: PracticeDifficulty =
      rawQ.difficulty === "easy" || rawQ.difficulty === "hard" ? rawQ.difficulty : "normal";

    let qType: "open" | "mc-single" | "mc-multi" = "open";
    if (rawQ.type === "mc-single") qType = "mc-single";
    else if (rawQ.type === "mc-multi") qType = settings.allowMultiCorrectMc ? "mc-multi" : "mc-single";
    else if (rawQ.type === "open") qType = "open";

    // Respect strict questionTypeMode setting
    if (settings.questionTypeMode === "open") qType = "open";
    else if (settings.questionTypeMode === "mc" && qType === "open") {
      if (Array.isArray(rawQ.options) && rawQ.options.length >= 4) {
        qType = "mc-single";
      } else {
        continue;
      }
    }

    if (qType === "mc-single" || qType === "mc-multi") {
      const cleanOpts = (rawQ.options || []).map((o) => (o || "").trim()).filter(Boolean);
      if (cleanOpts.length < 4) continue;
      const options = cleanOpts.slice(0, 4);
      const validIndices = Array.from(
        new Set(
          (rawQ.correctIndices || [])
            .map((i) => Number(i))
            .filter((i) => Number.isInteger(i) && i >= 0 && i < options.length)
        )
      ).sort((a, b) => a - b);

      if (validIndices.length === 0) continue;
      const finalIndices = qType === "mc-single" ? [validIndices[0]] : validIndices;
      if (qType === "mc-multi" && finalIndices.length < 2) {
        qType = "mc-single";
      }

      seenPrompts.add(norm);
      validated.push({
        id: `pq_${Date.now()}_${validated.length + 1}`,
        type: qType,
        topic: (rawQ.topic || focusTopic || "Algemeen").trim(),
        subject,
        difficulty: diff,
        prompt,
        options,
        multiSelectCount: qType === "mc-multi" ? finalIndices.length : undefined,
        correctIndices: finalIndices,
        referenceAnswer:
          (rawQ.referenceAnswer || "").trim() ||
          finalIndices.map((idx) => options[idx]).join(", "),
        explanation:
          (rawQ.explanation || "").trim() ||
          `Gebaseerd op "${matchedFile.title}".`,
        hint: settings.hintsEnabled ? (rawQ.hint || "Kijk goed in de brontekst.").trim() : undefined,
        sourceTitle: matchedFile.title,
        sourceSection: sanitizeSourceSection(rawQ.sourceSection, matchedFile.content),
        evidenceQuote: (rawQ.evidenceQuote || "").trim(),
        targetedWeakAspect: rawQ.targetedWeakAspect?.trim() || undefined,
      });
    } else {
      const refAns = (rawQ.referenceAnswer || "").trim();
      if (!refAns) continue;
      seenPrompts.add(norm);
      validated.push({
        id: `pq_${Date.now()}_${validated.length + 1}`,
        type: "open",
        topic: (rawQ.topic || focusTopic || "Algemeen").trim(),
        subject,
        difficulty: diff,
        prompt,
        referenceAnswer: refAns,
        explanation:
          (rawQ.explanation || "").trim() ||
          `Het antwoord volgt direct uit "${matchedFile.title}".`,
        hint: settings.hintsEnabled ? (rawQ.hint || "Leg het in je eigen woorden uit op basis van de tekst.").trim() : undefined,
        sourceTitle: matchedFile.title,
        sourceSection: sanitizeSourceSection(rawQ.sourceSection, matchedFile.content),
        evidenceQuote: (rawQ.evidenceQuote || "").trim(),
        targetedWeakAspect: rawQ.targetedWeakAspect?.trim() || undefined,
      });
    }
  }

  let materialNotice = (parsed.insufficientMaterialReason || "").trim() || undefined;
  if (!materialNotice && validated.length < settings.questionCount && validated.length > 0) {
    materialNotice = `De geselecteerde leerstof bood voldoende verifieerbare feiten voor ${validated.length} van de ${settings.questionCount} gevraagde vragen zonder informatie aan te vullen.`;
  }

  return {
    questions: validated.slice(0, settings.questionCount),
    dossierSummary: resolvedDossier,
    materialNotice,
  };
}

export function gradeMcPracticeAnswer(
  question: PracticeQuestionInternal,
  selectedIndices: number[]
): PracticeAnswerFeedback {
  const now = Date.now();
  const options = question.options || [];
  const correctSet = new Set(question.correctIndices || [0]);
  const chosenSet = new Set(
    (selectedIndices || []).filter((i) => Number.isInteger(i) && i >= 0 && i < options.length)
  );

  const correctOptionTexts = Array.from(correctSet)
    .sort((a, b) => a - b)
    .map((idx) => options[idx])
    .filter(Boolean);

  if (chosenSet.size === 0) {
    return {
      questionId: question.id,
      selectedIndices: [],
      status: "wrong",
      score0to1: 0,
      feedback: "Je hebt geen antwoord gekozen.",
      missingPoints: [question.topic],
      explanation: question.explanation,
      referenceAnswer: question.referenceAnswer || correctOptionTexts.join(", "),
      correctOptionTexts,
      sourceTitle: question.sourceTitle,
      sourceSection: question.sourceSection,
      answeredAt: now,
    };
  }

  const hits = Array.from(chosenSet).filter((i) => correctSet.has(i)).length;
  const falsePositives = Array.from(chosenSet).filter((i) => !correctSet.has(i)).length;
  const missed = Array.from(correctSet).filter((i) => !chosenSet.has(i)).length;

  if (hits === correctSet.size && falsePositives === 0) {
    return {
      questionId: question.id,
      selectedIndices: Array.from(chosenSet).sort((a, b) => a - b),
      status: "correct",
      score0to1: 1,
      feedback: "Helemaal goed! Jouw gekozen antwoord sluit precies aan op de brontekst.",
      whatWasRight: correctOptionTexts.join(", "),
      missingPoints: [],
      explanation: question.explanation,
      referenceAnswer: question.referenceAnswer || correctOptionTexts.join(", "),
      correctOptionTexts,
      sourceTitle: question.sourceTitle,
      sourceSection: question.sourceSection,
      answeredAt: now,
    };
  }

  if (question.type === "mc-multi" && hits > 0 && falsePositives === 0 && missed > 0) {
    const score0to1 = Math.max(0.4, Math.round((hits / correctSet.size) * 100) / 100);
    const missedTexts = Array.from(correctSet)
      .filter((i) => !chosenSet.has(i))
      .map((i) => options[i])
      .filter(Boolean);
    return {
      questionId: question.id,
      selectedIndices: Array.from(chosenSet).sort((a, b) => a - b),
      status: "partial",
      score0to1,
      feedback: `Gedeeltelijk goed (${hits} van de ${correctSet.size} juiste opties gekozen). Je miste nog ${missedTexts.length} juist onderdeel.`,
      whatWasRight: Array.from(chosenSet)
        .map((i) => options[i])
        .join(", "),
      missingPoints: missedTexts,
      explanation: question.explanation,
      referenceAnswer: question.referenceAnswer || correctOptionTexts.join(", "),
      correctOptionTexts,
      sourceTitle: question.sourceTitle,
      sourceSection: question.sourceSection,
      answeredAt: now,
    };
  }

  const chosenTexts = Array.from(chosenSet)
    .map((i) => options[i])
    .filter(Boolean)
    .join(", ");

  return {
    questionId: question.id,
    selectedIndices: Array.from(chosenSet).sort((a, b) => a - b),
    status: "wrong",
    score0to1: 0,
    feedback: `Niet juist. Je koos "${chosenTexts}", maar volgens de brontekst is het juiste antwoord: ${correctOptionTexts.join(
      " & "
    )}.`,
    missingPoints: [question.topic],
    explanation: question.explanation,
    referenceAnswer: question.referenceAnswer || correctOptionTexts.join(", "),
    correctOptionTexts,
    sourceTitle: question.sourceTitle,
    sourceSection: question.sourceSection,
    answeredAt: now,
  };
}

export async function gradeOpenPracticeAnswer(params: {
  ai?: GoogleGenAI;
  modelName: string;
  question: PracticeQuestionInternal;
  typedAnswer: string;
  sourceContent: string;
}): Promise<PracticeAnswerFeedback> {
  const { modelName, question, typedAnswer, sourceContent } = params;
  const now = Date.now();
  const cleanAnswer = (typedAnswer || "").trim();

  if (cleanAnswer.length < 2) {
    return {
      questionId: question.id,
      typedAnswer: cleanAnswer,
      status: "wrong",
      score0to1: 0,
      feedback: "Je hebt geen inhoudelijk antwoord ingevuld.",
      missingPoints: [question.topic],
      explanation: question.explanation,
      referenceAnswer: question.referenceAnswer,
      sourceTitle: question.sourceTitle,
      sourceSection: question.sourceSection,
      answeredAt: now,
    };
  }

  const relevantSource = extractRelevantSourceWindow(
    sourceContent,
    question.sourceSection,
    `${question.prompt} ${question.referenceAnswer} ${question.evidenceQuote || ""}`,
    32000
  );

  const response = await generateContentWithFailover({
    model: modelName,
    contents: `BRONDOCUMENT "${question.sourceTitle}" (${question.sourceSection}):
${relevantSource}

VRAAG (${question.topic}, niveau: ${question.difficulty}):
${question.prompt}

MODELANTWOORD UIT DE BRON:
${question.referenceAnswer}
${question.evidenceQuote ? `BEWIJSCITAAT UIT DE BRON: "${question.evidenceQuote}"` : ""}

ANTWOORD VAN DE LEERLING:
"${cleanAnswer}"

Beoordeel het antwoord van de leerling eerlijk en inhoudelijk aan de hand van de brontekst:
1. Kijk NIET naar exacte woordgelijkheid, maar naar de inhoudelijke betekenis. Eigen woorden, synoniemen en kleine spel-/grammaticafouten zijn GOED zolang de kern klopt volgens de bron.
2. Kies status:
   - "correct" (score0to1 = 1.0): de kernpunten uit het modelantwoord/de bron staan inhoudelijk goed in het antwoord.
   - "partial" (score0to1 tussen 0.35 en 0.75): een belangrijk deel klopt, maar minstens één essentieel punt ontbreekt of is onvolledig.
   - "wrong" (score0to1 = 0.0): het antwoord klopt feitelijk niet met de bron, haalt begrippen door elkaar of beantwoordt de vraag niet.
   - "unverifiable" (score0to1 = 0.0): ALLEEN als de brontekst de vraag achteraf toch onvoldoende ondersteunt om eerlijk te beoordelen.
3. Vul altijd:
   - "whatWasRight": wat de leerling wel goed had (of leeg als niets klopt).
   - "missingPoints": concrete ontbrekende/onjuiste kernpunten (leeg [] bij "correct").
   - "feedback": directe, opbouwende uitleg in het Nederlands waarom het goed, gedeeltelijk goed of fout is.
   - "explanation": heldere toelichting gebaseerd op de bron.`,
    config: {
      thinkingConfig: { thinkingLevel: ThinkingLevel.XHIGH },
      systemInstruction: `Je bent de eerlijke nakijk-docent van StudyFlow AI Oefenen.
Beoordeel UITSLUITEND op basis van de aangeleverde brontekst. Voeg geen externe feiten toe. Wees bemoedigend maar inhoudelijk nauwkeurig.`,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          status: { type: Type.STRING },
          score0to1: { type: Type.NUMBER },
          feedback: { type: Type.STRING },
          whatWasRight: { type: Type.STRING },
          missingPoints: { type: Type.ARRAY, items: { type: Type.STRING } },
          explanation: { type: Type.STRING },
        },
        required: ["status", "score0to1", "feedback", "whatWasRight", "missingPoints", "explanation"],
      },
    },
  });

  const parsed = JSON.parse((response.text ?? "{}").trim()) as {
    status?: string;
    score0to1?: number;
    feedback?: string;
    whatWasRight?: string;
    missingPoints?: string[];
    explanation?: string;
  };

  let status: PracticeAnswerFeedback["status"] = "wrong";
  if (parsed.status === "correct" || parsed.status === "partial" || parsed.status === "unverifiable") {
    status = parsed.status;
  }

  let score0to1 = Number(parsed.score0to1);
  if (!Number.isFinite(score0to1)) {
    score0to1 = status === "correct" ? 1 : status === "partial" ? 0.5 : 0;
  }
  score0to1 = Math.max(0, Math.min(1, score0to1));
  if (status === "correct") score0to1 = 1;
  if (status === "wrong" || status === "unverifiable") score0to1 = 0;

  return {
    questionId: question.id,
    typedAnswer: cleanAnswer,
    status,
    score0to1,
    feedback:
      (parsed.feedback || "").trim() ||
      (status === "correct"
        ? "Goed beantwoord in je eigen woorden."
        : "Vergelijk je antwoord met het modelantwoord hieronder."),
    whatWasRight: (parsed.whatWasRight || "").trim() || undefined,
    missingPoints: Array.isArray(parsed.missingPoints)
      ? parsed.missingPoints.map((m) => m.trim()).filter(Boolean)
      : [],
    explanation: (parsed.explanation || "").trim() || question.explanation,
    referenceAnswer: question.referenceAnswer,
    sourceTitle: question.sourceTitle,
    sourceSection: question.sourceSection,
    answeredAt: now,
  };
}
