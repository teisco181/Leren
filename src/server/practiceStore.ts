import fs from "fs";
import path from "path";
import type {
  AnalyzedTopic,
  PracticeAnswerFeedback,
  PracticeDashboardState,
  PracticeDifficulty,
  PracticeDifficultyMode,
  PracticeMaterialSelection,
  PracticeMode,
  PracticeQuestionPublic,
  PracticeSessionPublic,
  PracticeTimelinePoint,
  PracticeUserSettings,
  TopicMasteryEntry,
  TopicMasteryRecord,
} from "../types";

export interface PracticeQuestionInternal extends PracticeQuestionPublic {
  correctIndices?: number[];
  referenceAnswer: string;
  explanation: string;
  evidenceQuote?: string;
}

export interface PracticeSessionInternal {
  id: string;
  selectionId: string;
  selectionName: string;
  subject: string;
  mode: PracticeMode;
  focusTopic?: string;
  settings: PracticeUserSettings;
  fileTitles: string[];
  topics: AnalyzedTopic[];
  questions: PracticeQuestionInternal[];
  answers: Record<string, PracticeAnswerFeedback>;
  draftAnswers?: Record<string, { typedAnswer?: string; selectedIndices?: number[] }>;
  currentIndex: number;
  status: "active" | "completed";
  startedAt: number;
  updatedAt: number;
  completedAt?: number;
  examGrade?: number;
  correctCount: number;
  partialCount: number;
  wrongCount: number;
  aiRecommendation?: string;
  materialNotice?: string;
  sourceTexts?: Record<string, string>;
}

interface PracticeUserFileData {
  uid: string;
  updatedAt: number;
  settings: PracticeUserSettings;
  savedSelections: PracticeMaterialSelection[];
  topicMastery: Record<string, TopicMasteryRecord>;
  sessions: PracticeSessionInternal[];
}

export const DEFAULT_PRACTICE_SETTINGS: PracticeUserSettings = {
  questionTypeMode: "both",
  allowMultiCorrectMc: false,
  questionCount: 6,
  difficultyMode: "adaptive",
  timeLimitMinutes: 0,
  hintsEnabled: true,
  checkTiming: "immediate",
};

const STORE_DIR = path.join(process.cwd(), ".data", "practice-users");

function ensureStoreDir() {
  if (!fs.existsSync(STORE_DIR)) {
    fs.mkdirSync(STORE_DIR, { recursive: true });
  }
}

function getUserFilePath(uid: string): string {
  const safeUid = uid.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 128);
  if (!safeUid) {
    throw new Error("Ongeldige gebruikers-ID.");
  }
  return path.join(STORE_DIR, `${safeUid}.json`);
}

export function normalizeTopicKey(topic: string, subject = ""): string {
  const cleanTopic = topic
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const cleanSubject = subject
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return `${cleanSubject || "algemeen"}::${cleanTopic || "algemeen"}`;
}

export function sanitizeSettings(raw?: Partial<PracticeUserSettings>): PracticeUserSettings {
  const qMode =
    raw?.questionTypeMode === "open" || raw?.questionTypeMode === "mc" || raw?.questionTypeMode === "both"
      ? raw.questionTypeMode
      : DEFAULT_PRACTICE_SETTINGS.questionTypeMode;
  const diffMode =
    raw?.difficultyMode === "adaptive" ||
    raw?.difficultyMode === "easy" ||
    raw?.difficultyMode === "normal" ||
    raw?.difficultyMode === "hard"
      ? raw.difficultyMode
      : DEFAULT_PRACTICE_SETTINGS.difficultyMode;
  const checkTiming =
    raw?.checkTiming === "immediate" || raw?.checkTiming === "end"
      ? raw.checkTiming
      : DEFAULT_PRACTICE_SETTINGS.checkTiming;

  return {
    questionTypeMode: qMode,
    allowMultiCorrectMc: Boolean(raw?.allowMultiCorrectMc),
    questionCount: Math.min(Math.max(Number(raw?.questionCount) || 6, 3), 15),
    difficultyMode: diffMode,
    timeLimitMinutes: Math.min(Math.max(Number(raw?.timeLimitMinutes) || 0, 0), 60),
    hintsEnabled: raw?.hintsEnabled !== undefined ? Boolean(raw.hintsEnabled) : true,
    checkTiming,
  };
}

function loadUserData(uid: string): PracticeUserFileData {
  ensureStoreDir();
  const filePath = getUserFilePath(uid);
  if (!fs.existsSync(filePath)) {
    return {
      uid,
      updatedAt: Date.now(),
      settings: { ...DEFAULT_PRACTICE_SETTINGS },
      savedSelections: [],
      topicMastery: {},
      sessions: [],
    };
  }

  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<PracticeUserFileData>;
    return {
      uid,
      updatedAt: Number(parsed.updatedAt) || Date.now(),
      settings: sanitizeSettings(parsed.settings),
      savedSelections: Array.isArray(parsed.savedSelections) ? parsed.savedSelections : [],
      topicMastery: parsed.topicMastery && typeof parsed.topicMastery === "object" ? parsed.topicMastery : {},
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
    };
  } catch {
    return {
      uid,
      updatedAt: Date.now(),
      settings: { ...DEFAULT_PRACTICE_SETTINGS },
      savedSelections: [],
      topicMastery: {},
      sessions: [],
    };
  }
}

function saveUserData(uid: string, data: PracticeUserFileData): void {
  ensureStoreDir();
  const filePath = getUserFilePath(uid);
  data.updatedAt = Date.now();
  // Keep latest 40 sessions to keep user files compact while preserving topicMastery forever
  if (data.sessions.length > 40) {
    data.sessions = data.sessions.slice(0, 40);
  }
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(tmpPath, filePath);
}

function toPublicQuestion(q: PracticeQuestionInternal): PracticeQuestionPublic {
  return {
    id: q.id,
    type: q.type,
    topic: q.topic,
    subject: q.subject,
    difficulty: q.difficulty,
    prompt: q.prompt,
    options: q.options,
    multiSelectCount: q.multiSelectCount,
    hint: q.hint,
    sourceTitle: q.sourceTitle,
    sourceSection: q.sourceSection,
    targetedWeakAspect: q.targetedWeakAspect,
    isVariantOf: q.isVariantOf,
  };
}

export function toPublicSession(s: PracticeSessionInternal): PracticeSessionPublic {
  // Note: answers map already holds feedback ONLY for questions that have been graded.
  // Unanswered questions never expose correctIndices or referenceAnswer.
  return {
    id: s.id,
    selectionId: s.selectionId,
    selectionName: s.selectionName,
    subject: s.subject,
    mode: s.mode,
    focusTopic: s.focusTopic,
    settings: s.settings,
    fileTitles: s.fileTitles,
    topics: s.topics,
    questions: s.questions.map(toPublicQuestion),
    answers: s.answers,
    draftAnswers: s.draftAnswers,
    currentIndex: s.currentIndex,
    status: s.status,
    startedAt: s.startedAt,
    updatedAt: s.updatedAt,
    completedAt: s.completedAt,
    examGrade: s.examGrade,
    correctCount: s.correctCount,
    partialCount: s.partialCount,
    wrongCount: s.wrongCount,
    aiRecommendation: s.aiRecommendation,
    materialNotice: s.materialNotice,
  };
}

function difficultyWeight(d: PracticeDifficulty): number {
  if (d === "hard") return 1.3;
  if (d === "easy") return 0.9;
  return 1.1;
}

/**
 * Confidence-aware Bayesian/weighted mastery computation.
 * 1 correct answer will NOT yield 100% (~54-56%), requiring sustained accuracy
 * across multiple attempts before reaching >=80% mastery.
 */
function computeMasteryMetrics(history: TopicMasteryEntry[]): {
  masteryPct: number;
  totalAttempts: number;
  correctCount: number;
  partialCount: number;
  wrongCount: number;
  consecutiveCorrect: number;
  consecutiveWrong: number;
  recommendedDifficulty: PracticeDifficulty;
} {
  const validHistory = history.filter((h) => h.status !== "unverifiable");
  const totalAttempts = validHistory.length;
  let correctCount = 0;
  let partialCount = 0;
  let wrongCount = 0;

  let weightedScoreSum = 0;
  let weightSum = 0;

  // Give slightly stronger weight to recent answers so improvement over time is reflected
  const len = validHistory.length;
  validHistory.forEach((entry, idx) => {
    if (entry.status === "correct") correctCount++;
    else if (entry.status === "partial") partialCount++;
    else if (entry.status === "wrong") wrongCount++;

    const recencyFactor = 0.75 + (idx / Math.max(1, len - 1)) * 0.55; // 0.75 -> 1.30
    const w = difficultyWeight(entry.difficulty) * recencyFactor;
    weightedScoreSum += entry.score0to1 * w;
    weightSum += w;
  });

  // Prior: neutral 0.9 / 2.6 prevents premature 100% or 0% on tiny sample sizes
  let masteryPct = 0;
  if (totalAttempts > 0) {
    const rawPct = Math.round(((weightedScoreSum + 0.9) / (weightSum + 2.6)) * 100);
    // Cap at 96% until at least 5 verified attempts are recorded
    const cap = totalAttempts < 5 ? 88 : 99;
    masteryPct = Math.max(5, Math.min(cap, rawPct));
  }

  let consecutiveCorrect = 0;
  let consecutiveWrong = 0;
  for (let i = validHistory.length - 1; i >= 0; i--) {
    if (validHistory[i].status === "correct") {
      if (consecutiveWrong === 0) consecutiveCorrect++;
      else break;
    } else if (validHistory[i].status === "wrong" || validHistory[i].status === "partial") {
      if (consecutiveCorrect === 0) consecutiveWrong++;
      else break;
    }
  }

  let recommendedDifficulty: PracticeDifficulty = "normal";
  if (totalAttempts >= 2 && (consecutiveWrong >= 2 || masteryPct < 45)) {
    recommendedDifficulty = "easy";
  } else if (totalAttempts >= 3 && masteryPct >= 78 && consecutiveCorrect >= 2) {
    recommendedDifficulty = "hard";
  }

  return {
    masteryPct,
    totalAttempts,
    correctCount,
    partialCount,
    wrongCount,
    consecutiveCorrect,
    consecutiveWrong,
    recommendedDifficulty,
  };
}

function computeHistoryTimeline(sessions: PracticeSessionInternal[], masteryMap: Record<string, TopicMasteryRecord>): PracticeTimelinePoint[] {
  const byDate = new Map<string, { sum: number; count: number }>();

  for (const rec of Object.values(masteryMap)) {
    for (const h of rec.history) {
      if (h.status === "unverifiable") continue;
      const d = new Date(h.date);
      const label = `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const existing = byDate.get(label) || { sum: 0, count: 0 };
      existing.sum += h.score0to1 * 100;
      existing.count += 1;
      byDate.set(label, existing);
    }
  }

  if (byDate.size === 0) {
    for (const s of sessions) {
      const answered = Object.values(s.answers).filter((a) => a.status !== "unverifiable");
      if (answered.length === 0) continue;
      const d = new Date(s.updatedAt);
      const label = `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const existing = byDate.get(label) || { sum: 0, count: 0 };
      for (const a of answered) {
        existing.sum += a.score0to1 * 100;
        existing.count += 1;
      }
      byDate.set(label, existing);
    }
  }

  return Array.from(byDate.entries())
    .slice(-10)
    .map(([date, val]) => ({
      date,
      avgScorePct: Math.round(val.sum / Math.max(1, val.count)),
      count: val.count,
    }));
}

function computeAiSuggestion(
  data: PracticeUserFileData
): { suggestion: string; nextAction?: PracticeDashboardState["aiNextAction"] } {
  const records = Object.values(data.topicMastery);
  const latestSelection = data.savedSelections[0];

  if (records.length === 0) {
    if (latestSelection) {
      return {
        suggestion: `Je hebt leerstof "${latestSelection.name}" klaarstaan. Start een sessie Vrij oefenen zodat de AI jouw kennisprofiel per onderwerp kan opbouwen.`,
        nextAction: {
          label: `Start Vrij oefenen (${latestSelection.name})`,
          mode: "free",
          selectionId: latestSelection.id,
        },
      };
    }
    return {
      suggestion: "Selecteer eerst bestanden of mappen onder Leerstof & Instellingen om je persoonlijke oefenomgeving te starten.",
    };
  }

  // Find weakest topic
  const sortedWeak = [...records].sort((a, b) => {
    const scoreA = a.masteryPct - a.weakAspects.length * 6 - a.consecutiveWrong * 8;
    const scoreB = b.masteryPct - b.weakAspects.length * 6 - b.consecutiveWrong * 8;
    return scoreA - scoreB;
  });

  const weakest = sortedWeak[0];
  if (weakest && (weakest.masteryPct < 65 || weakest.weakAspects.length > 0 || weakest.wrongCount > 0)) {
    const aspectHint =
      weakest.weakAspects.length > 0
        ? ` Let vooral op: ${weakest.weakAspects[0]}.`
        : "";
    return {
      suggestion: `Uit je eerdere antwoorden blijkt dat "${weakest.topic}" (${weakest.subject || "Algemeen"}) nog extra aandacht nodig heeft (${weakest.masteryPct}% geschatte beheersing).${aspectHint}`,
      nextAction: {
        label: `Oefen "${weakest.topic}" gericht`,
        mode: "topic",
        focusTopic: weakest.topic,
        selectionId: latestSelection?.id,
      },
    };
  }

  // Check for stale topic (> 3 days since practiced)
  const threeDaysMs = 3 * 24 * 60 * 60 * 1000;
  const stale = [...records]
    .filter((r) => Date.now() - r.lastPracticedAt > threeDaysMs)
    .sort((a, b) => a.lastPracticedAt - b.lastPracticedAt)[0];
  if (stale) {
    const daysAgo = Math.max(1, Math.floor((Date.now() - stale.lastPracticedAt) / (24 * 60 * 60 * 1000)));
    return {
      suggestion: `"${stale.topic}" is al ${daysAgo} dagen niet geoefend. Een korte herhaalsessie houdt je kennis scherp.`,
      nextAction: {
        label: "Start Herhalen",
        mode: "repeat",
        selectionId: latestSelection?.id,
      },
    };
  }

  return {
    suggestion: `Je beheersing is op alle geoefende onderwerpen sterk (gemiddeld ${Math.round(
      records.reduce((s, r) => s + r.masteryPct, 0) / records.length
    )}%). Test jezelf met een Toetsvoorbereiding om te zien welk cijfer je haalt.`,
    nextAction: {
      label: "Start Toetsvoorbereiding",
      mode: "exam",
      selectionId: latestSelection?.id,
    },
  };
}

export function getPracticeDashboardState(uid: string): PracticeDashboardState {
  const data = loadUserData(uid);
  const topicMastery = Object.values(data.topicMastery).sort((a, b) => a.masteryPct - b.masteryPct);
  const sessions = data.sessions.map(toPublicSession);
  const historyTimeline = computeHistoryTimeline(data.sessions, data.topicMastery);
  const { suggestion, nextAction } = computeAiSuggestion(data);

  return {
    savedSelections: data.savedSelections,
    topicMastery,
    sessions,
    settings: data.settings,
    historyTimeline,
    aiSuggestion: suggestion,
    aiNextAction: nextAction,
  };
}

export function saveUserSettings(uid: string, next: Partial<PracticeUserSettings>): PracticeUserSettings {
  const data = loadUserData(uid);
  data.settings = sanitizeSettings({ ...data.settings, ...next });
  saveUserData(uid, data);
  return data.settings;
}

export function upsertSavedSelection(
  uid: string,
  selection: Omit<PracticeMaterialSelection, "id" | "createdAt" | "updatedAt"> & { id?: string }
): { selection: PracticeMaterialSelection; savedSelections: PracticeMaterialSelection[] } {
  const data = loadUserData(uid);
  const now = Date.now();
  const existingIdx = selection.id ? data.savedSelections.findIndex((s) => s.id === selection.id) : -1;

  let saved: PracticeMaterialSelection;
  if (existingIdx >= 0) {
    saved = {
      ...data.savedSelections[existingIdx],
      ...selection,
      id: data.savedSelections[existingIdx].id,
      updatedAt: now,
    };
    data.savedSelections.splice(existingIdx, 1);
    data.savedSelections.unshift(saved);
  } else {
    saved = {
      ...selection,
      id: `sel_${now}_${Math.random().toString(36).slice(2, 7)}`,
      createdAt: now,
      updatedAt: now,
    };
    data.savedSelections.unshift(saved);
  }

  // Limit to 25 saved selections cleanly
  if (data.savedSelections.length > 25) {
    data.savedSelections = data.savedSelections.slice(0, 25);
  }

  saveUserData(uid, data);
  return { selection: saved, savedSelections: data.savedSelections };
}

export function deleteSavedSelection(uid: string, selectionId: string): PracticeMaterialSelection[] {
  const data = loadUserData(uid);
  data.savedSelections = data.savedSelections.filter((s) => s.id !== selectionId);
  saveUserData(uid, data);
  return data.savedSelections;
}

export interface AdaptiveTopicSlot {
  topic: string;
  sourceTitle: string;
  sourceSection: string;
  difficulty: PracticeDifficulty;
  questionType: "open" | "mc-single" | "mc-multi";
  weakAspects: string[];
  reason: string;
}

export interface AdaptivePlan {
  slots: AdaptiveTopicSlot[];
  recentQuestionPrompts: string[];
  missedQuestionsContext: Array<{
    prompt: string;
    topic: string;
    whatWentWrong: string;
  }>;
  masterySummaryForPrompt: string;
}

export function buildAdaptivePlan(params: {
  uid: string;
  subject: string;
  topics: AnalyzedTopic[];
  mode: PracticeMode;
  focusTopic?: string;
  settings: PracticeUserSettings;
}): AdaptivePlan {
  const data = loadUserData(params.uid);
  const now = Date.now();
  const masteryValues = Object.values(data.topicMastery);

  // Gather recently asked prompts so AI never duplicates verbatim
  const recentQuestionPrompts: string[] = [];
  const missedQuestionsContext: AdaptivePlan["missedQuestionsContext"] = [];

  for (const s of data.sessions.slice(0, 8)) {
    for (const q of s.questions) {
      if (recentQuestionPrompts.length < 30) {
        recentQuestionPrompts.push(q.prompt);
      }
      const ans = s.answers[q.id];
      if (ans && (ans.status === "wrong" || ans.status === "partial")) {
        missedQuestionsContext.push({
          prompt: q.prompt,
          topic: q.topic,
          whatWentWrong: ans.missingPoints[0] || ans.feedback.slice(0, 120),
        });
      }
    }
  }

  let candidateTopics = [...params.topics];
  if (params.mode === "topic" && params.focusTopic) {
    const normFocus = params.focusTopic.trim().toLowerCase();
    const matched = candidateTopics.filter((t) => t.name.toLowerCase() === normFocus);
    if (matched.length > 0) {
      candidateTopics = matched;
    } else {
      candidateTopics = [
        {
          name: params.focusTopic,
          sourceTitle: params.topics[0]?.sourceTitle || "Geselecteerde leerstof",
          sourceSection: params.topics[0]?.sourceSection || "Brontekst",
          factCount: 3,
        },
      ];
    }
  }

  if (candidateTopics.length === 0) {
    candidateTopics = [
      {
        name: params.subject || "Kernstof",
        sourceTitle: "Geselecteerde leerstof",
        sourceSection: "Brontekst",
        factCount: 3,
      },
    ];
  }

  // Score priority per topic
  const scoredTopics = candidateTopics.map((t) => {
    const key = normalizeTopicKey(t.name, params.subject);
    const rec =
      data.topicMastery[key] ||
      masteryValues.find((m) => m.topic.toLowerCase() === t.name.toLowerCase());

    let priority = 50;
    let difficulty: PracticeDifficulty = "normal";
    let weakAspects: string[] = [];
    let reason = "Nieuw of nog weinig geoefend onderwerp";

    if (rec) {
      weakAspects = rec.weakAspects || [];
      const daysSince = Math.max(0, (now - rec.lastPracticedAt) / (24 * 60 * 60 * 1000));
      const stalenessBoost = Math.min(25, daysSince * 4);

      if (params.mode === "weak") {
        priority = (100 - rec.masteryPct) * 1.4 + rec.weakAspects.length * 14 + rec.wrongCount * 6;
        reason = `Zwak punt (${rec.masteryPct}% beheersing)`;
      } else if (params.mode === "repeat") {
        priority =
          (rec.wrongCount + rec.partialCount) * 18 +
          stalenessBoost * 1.6 +
          (100 - rec.masteryPct) * 0.6;
        reason = rec.wrongCount > 0 ? "Eerder fout beantwoord — herhalen" : "Langer geleden geoefend";
      } else if (params.mode === "exam") {
        // Balanced spread across all topics for exam prep
        priority = 60 + Math.min(20, (100 - rec.masteryPct) * 0.2);
        reason = "Toetsdekking over de leerstof";
      } else {
        // Adaptive free mode: prioritize unmastered & weak topics, reduce mastered ones
        if (rec.masteryPct >= 82 && rec.totalAttempts >= 4) {
          priority = 18 + stalenessBoost * 0.5;
          reason = "Goed beheerst (lagere frequentie)";
        } else {
          priority = (100 - rec.masteryPct) + rec.weakAspects.length * 10 + stalenessBoost;
          reason = rec.masteryPct < 55 ? "Extra oefening aanbevolen" : "Adaptieve verdieping";
        }
      }

      difficulty =
        params.settings.difficultyMode === "adaptive"
          ? rec.recommendedDifficulty
          : (params.settings.difficultyMode as PracticeDifficulty);
    } else {
      if (params.mode === "weak") priority = 40;
      else if (params.mode === "repeat") priority = 30;
      else priority = 78; // unseen topic gets healthy attention in free/exam mode

      difficulty =
        params.settings.difficultyMode === "adaptive"
          ? "normal"
          : (params.settings.difficultyMode as PracticeDifficulty);
    }

    return { topic: t, priority, difficulty, weakAspects, reason, rec };
  });

  scoredTopics.sort((a, b) => b.priority - a.priority);

  const count = params.settings.questionCount;
  const slots: AdaptiveTopicSlot[] = [];

  for (let i = 0; i < count; i++) {
    const picked = scoredTopics[i % scoredTopics.length];
    let qType: "open" | "mc-single" | "mc-multi";
    if (params.settings.questionTypeMode === "open") {
      qType = "open";
    } else if (params.settings.questionTypeMode === "mc") {
      qType = params.settings.allowMultiCorrectMc && i % 3 === 2 ? "mc-multi" : "mc-single";
    } else {
      // 'both': alternate open and mc cleanly
      if (i % 2 === 0) {
        qType = params.settings.allowMultiCorrectMc && i % 4 === 2 ? "mc-multi" : "mc-single";
      } else {
        qType = "open";
      }
    }

    slots.push({
      topic: picked.topic.name,
      sourceTitle: picked.topic.sourceTitle,
      sourceSection: picked.topic.sourceSection,
      difficulty: picked.difficulty,
      questionType: qType,
      weakAspects: picked.weakAspects,
      reason: picked.reason,
    });
  }

  const masteryLines = scoredTopics.slice(0, 12).map((s) => {
    if (!s.rec) return `- ${s.topic.name}: nog niet geoefend`;
    const weakText = s.rec.weakAspects.length > 0 ? `; aandachtspunten: ${s.rec.weakAspects.join(", ")}` : "";
    return `- ${s.topic.name}: ${s.rec.masteryPct}% beheersing (${s.rec.correctCount} goed, ${s.rec.partialCount} deels, ${s.rec.wrongCount} fout, aanbevolen niveau: ${s.rec.recommendedDifficulty}${weakText})`;
  });

  return {
    slots,
    recentQuestionPrompts,
    missedQuestionsContext: missedQuestionsContext.slice(0, 8),
    masterySummaryForPrompt: masteryLines.join("\n"),
  };
}

export function createPracticeSession(uid: string, session: PracticeSessionInternal): PracticeSessionPublic {
  const data = loadUserData(uid);
  data.sessions.unshift(session);
  saveUserData(uid, data);
  return toPublicSession(session);
}

export function getPracticeSession(uid: string, sessionId: string): PracticeSessionInternal | null {
  const data = loadUserData(uid);
  return data.sessions.find((s) => s.id === sessionId) || null;
}

export function deletePracticeSession(uid: string, sessionId: string): boolean {
  const data = loadUserData(uid);
  const before = data.sessions.length;
  data.sessions = data.sessions.filter((s) => s.id !== sessionId);
  if (data.sessions.length !== before) {
    saveUserData(uid, data);
    return true;
  }
  return false;
}

export function saveDraftAnswers(
  uid: string,
  sessionId: string,
  draftAnswers: Record<string, { typedAnswer?: string; selectedIndices?: number[] }>,
  currentIndex?: number
): PracticeSessionPublic | null {
  const data = loadUserData(uid);
  const idx = data.sessions.findIndex((s) => s.id === sessionId);
  if (idx < 0) return null;
  const session = data.sessions[idx];
  session.draftAnswers = { ...(session.draftAnswers || {}), ...draftAnswers };
  if (typeof currentIndex === "number" && currentIndex >= 0 && currentIndex < session.questions.length) {
    session.currentIndex = currentIndex;
  }
  session.updatedAt = Date.now();
  saveUserData(uid, data);
  return toPublicSession(session);
}

function applyMasteryUpdate(
  data: PracticeUserFileData,
  question: PracticeQuestionInternal,
  feedback: PracticeAnswerFeedback,
  subject: string
) {
  const key = normalizeTopicKey(question.topic, subject);
  const existing = data.topicMastery[key];
  const history: TopicMasteryEntry[] = existing ? [...existing.history] : [];

  history.push({
    date: feedback.answeredAt,
    score0to1: feedback.score0to1,
    difficulty: question.difficulty,
    questionType: question.type,
    status: feedback.status,
  });

  // Cap per-topic detailed history to last 50 attempts
  const trimmedHistory = history.slice(-50);
  const metrics = computeMasteryMetrics(trimmedHistory);

  let weakAspects = existing ? [...existing.weakAspects] : [];
  if (feedback.status === "correct") {
    // If question specifically targeted a weak aspect, remove it now that student mastered it
    if (question.targetedWeakAspect) {
      const targetLower = question.targetedWeakAspect.toLowerCase();
      weakAspects = weakAspects.filter((w) => w.toLowerCase() !== targetLower);
    } else if (metrics.consecutiveCorrect >= 2 && weakAspects.length > 0) {
      weakAspects = weakAspects.slice(1);
    }
  } else if (feedback.status === "partial" || feedback.status === "wrong") {
    for (const mp of feedback.missingPoints) {
      const clean = mp.trim();
      if (clean && !weakAspects.some((w) => w.toLowerCase() === clean.toLowerCase())) {
        weakAspects.push(clean);
      }
    }
    weakAspects = weakAspects.slice(-5);
  }

  data.topicMastery[key] = {
    key,
    topic: question.topic,
    subject: subject || question.subject || "Algemeen",
    sourceTitle: question.sourceTitle,
    masteryPct: metrics.masteryPct,
    totalAttempts: metrics.totalAttempts,
    correctCount: metrics.correctCount,
    partialCount: metrics.partialCount,
    wrongCount: metrics.wrongCount,
    consecutiveCorrect: metrics.consecutiveCorrect,
    consecutiveWrong: metrics.consecutiveWrong,
    recommendedDifficulty: metrics.recommendedDifficulty,
    weakAspects,
    lastPracticedAt: feedback.answeredAt,
    history: trimmedHistory,
  };
}

function finalizeSessionTotals(session: PracticeSessionInternal) {
  const answerList = Object.values(session.answers);
  let correct = 0;
  let partial = 0;
  let wrong = 0;
  let scoreSum = 0;
  let gradableCount = 0;

  for (const a of answerList) {
    if (a.status === "correct") correct++;
    else if (a.status === "partial") partial++;
    else if (a.status === "wrong") wrong++;

    if (a.status !== "unverifiable") {
      scoreSum += a.score0to1;
      gradableCount++;
    }
  }

  session.correctCount = correct;
  session.partialCount = partial;
  session.wrongCount = wrong;

  if (Object.keys(session.answers).length >= session.questions.length && session.questions.length > 0) {
    session.status = "completed";
    session.completedAt = session.completedAt || Date.now();
    const ratio = gradableCount > 0 ? scoreSum / gradableCount : 0;
    // Dutch 1-10 grade rounded to 1 decimal
    session.examGrade = Math.round((1 + ratio * 9) * 10) / 10;

    // Build personalized end-of-session recommendation
    const topicPerf = new Map<string, { sum: number; count: number }>();
    for (const q of session.questions) {
      const a = session.answers[q.id];
      if (!a || a.status === "unverifiable") continue;
      const prev = topicPerf.get(q.topic) || { sum: 0, count: 0 };
      prev.sum += a.score0to1;
      prev.count += 1;
      topicPerf.set(q.topic, prev);
    }
    const weakTopics = Array.from(topicPerf.entries())
      .filter(([, v]) => v.sum / v.count < 0.7)
      .map(([name]) => name);

    if (weakTopics.length > 0) {
      session.aiRecommendation = `Goed gewerkt! Besteed hierna extra aandacht aan: ${weakTopics.join(", ")}.`;
    } else {
      session.aiRecommendation =
        "Sterk resultaat op alle onderwerpen in deze sessie. Probeer een hoger niveau of een Toetsvoorbereiding.";
    }
  }
}

export function recordSessionFeedbackBatch(
  uid: string,
  sessionId: string,
  feedbackList: PracticeAnswerFeedback[],
  opts?: { currentIndex?: number; forceComplete?: boolean }
): { session: PracticeSessionPublic; dashboard: PracticeDashboardState } | null {
  const data = loadUserData(uid);
  const idx = data.sessions.findIndex((s) => s.id === sessionId);
  if (idx < 0) return null;

  const session = data.sessions[idx];
  for (const fb of feedbackList) {
    const q = session.questions.find((item) => item.id === fb.questionId);
    if (!q) continue;
    const alreadyGraded = Boolean(session.answers[fb.questionId]);
    session.answers[fb.questionId] = fb;
    if (!alreadyGraded) {
      applyMasteryUpdate(data, q, fb, session.subject);
    }
  }

  if (typeof opts?.currentIndex === "number") {
    session.currentIndex = Math.min(Math.max(0, opts.currentIndex), Math.max(0, session.questions.length - 1));
  }

  if (opts?.forceComplete) {
    // Any unanswered questions on forced exam submit count as unanswered/wrong cleanly
    const now = Date.now();
    for (const q of session.questions) {
      if (!session.answers[q.id]) {
        const emptyFb: PracticeAnswerFeedback = {
          questionId: q.id,
          status: "wrong",
          score0to1: 0,
          feedback: "Niet ingevuld binnen de beschikbare tijd of voordat de toets is ingeleverd.",
          missingPoints: [q.topic],
          explanation: q.explanation,
          referenceAnswer: q.referenceAnswer,
          correctOptionTexts:
            q.options && q.correctIndices ? q.correctIndices.map((i) => q.options![i]).filter(Boolean) : undefined,
          sourceTitle: q.sourceTitle,
          sourceSection: q.sourceSection,
          answeredAt: now,
        };
        session.answers[q.id] = emptyFb;
        applyMasteryUpdate(data, q, emptyFb, session.subject);
      }
    }
  }

  finalizeSessionTotals(session);
  session.updatedAt = Date.now();
  saveUserData(uid, data);

  return {
    session: toPublicSession(session),
    dashboard: getPracticeDashboardState(uid),
  };
}
