import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BookmarkPlus,
  BookOpen,
  CheckCircle2,
  Flame,
  Gamepad2,
  History,
  Layers,
  Lock,
  Play,
  RotateCcw,
  ShieldCheck,
  Timer,
  Trash2,
  Trophy,
  Users,
  Volume2,
  VolumeX,
  XCircle,
} from 'lucide-react';
import {
  AnalyzedMaterial,
  Folder,
  SoloGameSession,
  StudyItem,
  StudySet,
} from '../types';
import {
  createSoloGameSession,
  createStudySet,
  deleteSoloGameSession,
  deleteStudySet,
  updateSoloGameSession,
} from '../lib/studyStore';
import { ConfirmModal } from './ConfirmModal';
import { MaterialSelector } from './MaterialSelector';
import { MultiplayerHub } from './multiplayer/MultiplayerHub';
import { ListSkeleton } from './Skeletons';
import {
  GAME_CATALOG,
  GameCategory,
  SoloGameMode,
} from '../lib/gameData';
import {
  analyzedMaterialToStudySet,
  checkSoloGameSufficiency,
} from '../lib/newGamesData';
import { playGameSound } from '../lib/gameAudio';
import { RecallGamesStage } from './games/RecallGamesStage';
import { ArcadeGamesStage } from './games/ArcadeGamesStage';
import { PuzzleGamesStage } from './games/PuzzleGamesStage';
import { StrategyGamesStage } from './games/StrategyGamesStage';
import {
  ORIGINAL_GAMES,
  OriginalGameMode,
  OriginalGamesStage,
} from './games/new/OriginalGamesStage';

interface GamesViewProps {
  userId: string;
  userName: string;
  folders: Folder[];
  items: StudyItem[];
  studySets: StudySet[];
  soloSessions: SoloGameSession[];
  loading: boolean;
  onOpenJoinModal: () => void;
}

const CATEGORY_TABS: Array<{ id: GameCategory; label: string }> = [
  { id: 'all', label: 'Alle 23 spellen' },
  { id: 'recall', label: 'Diep onthouden (5)' },
  { id: 'arcade', label: 'Snelheid & Arcade (5)' },
  { id: 'puzzle', label: 'Woord & Puzzel (5)' },
  { id: 'strategy', label: 'Strategie & Quizshow (5)' },
  { id: 'classic', label: 'Klassiek (3)' },
];

function studySetToAnalyzedMaterial(set: StudySet): AnalyzedMaterial {
  const concepts = (set.pairs || []).map((p, idx) => ({
    id: p.id || `c-${idx + 1}`,
    term: p.term,
    definition: p.definition,
    cleanWord: p.term
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/[^A-Z]/g, '')
      .slice(0, 12),
    sourceTitle: p.sourceTitle || set.sourceTitle || set.title,
    sourceSection: p.sourceSection || 'Opgeslagen oefenset',
  }));
  const questions = (set.questions || []).map((q) => ({
    question: q.question,
    options: q.options,
    correctIndex: q.correctIndex,
    explanation: q.explanation,
    difficulty: q.difficulty || ('normal' as const),
    sourceTitle: q.sourceTitle || set.sourceTitle || set.title,
    sourceSection: q.sourceSection || 'Opgeslagen oefenset',
  }));

  return {
    id: set.id,
    title: set.title,
    subject: set.subject,
    selectedFolderIds: set.selectedFolderIds || [],
    selectedItemIds: set.selectedItemIds || [],
    fileStatuses: [
      {
        itemId: set.id,
        title: set.sourceTitle || set.title,
        type: 'note',
        readable: concepts.length > 0 || questions.length > 0,
        charCount: 500,
        topics: (set.topics || []).map((t) => t.name),
      },
    ],
    topics: set.topics || [],
    concepts,
    questions,
    sortRounds: set.sortRounds || [],
    puzzles: set.puzzles || [],
    warnings: [],
    analyzedAt: Date.now(),
  };
}

function parseSessionMaterial(raw: string): AnalyzedMaterial | null {
  try {
    const parsed = JSON.parse(raw) as AnalyzedMaterial;
    if (parsed && Array.isArray(parsed.fileStatuses)) return parsed;
    return null;
  } catch {
    return null;
  }
}

export const GamesView: React.FC<GamesViewProps> = ({
  userId,
  userName,
  folders,
  items,
  studySets,
  soloSessions,
  loading,
  onOpenJoinModal,
}) => {
  const [hubTab, setHubTab] = useState<'singleplayer' | 'multiplayer'>('singleplayer');

  // Strict material selection state
  const [analyzedMaterial, setAnalyzedMaterial] = useState<AnalyzedMaterial | null>(null);
  const [selectedSavedSetId, setSelectedSavedSetId] = useState<string | null>(null);
  const [savingSet, setSavingSet] = useState(false);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  // Active solo stages & persistence
  const [soloMode, setSoloMode] = useState<SoloGameMode | null>(null);
  const [activeOriginalMode, setActiveOriginalMode] = useState<OriginalGameMode | null>(null);
  const [activeMaterial, setActiveMaterial] = useState<AnalyzedMaterial | null>(null);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [initialProgress, setInitialProgress] = useState<string | undefined>(undefined);
  const [launchError, setLaunchError] = useState<string | null>(null);

  const [categoryFilter, setCategoryFilter] = useState<GameCategory>('all');
  const [soundEnabled, setSoundEnabled] = useState(true);

  const stageRef = useRef<HTMLElement | null>(null);
  const libraryRef = useRef<HTMLElement | null>(null);

  // Delete confirmations
  const [deleteSetTarget, setDeleteSetTarget] = useState<StudySet | null>(null);
  const [deleteSessionTarget, setDeleteSessionTarget] = useState<SoloGameSession | null>(null);
  const [deleting, setDeleting] = useState(false);

  // --- Classic Flashcards State ---
  const [fcQueue, setFcQueue] = useState<number[]>([]);
  const [fcKnown, setFcKnown] = useState<number[]>([]);
  const [fcFlipped, setFcFlipped] = useState(false);

  // --- Classic Memory State ---
  interface MemoryCard {
    key: string;
    pairId: string;
    label: string;
    kind: 'term' | 'def';
  }
  const [memCards, setMemCards] = useState<MemoryCard[]>([]);
  const [memPicked, setMemPicked] = useState<number[]>([]);
  const [memMatched, setMemMatched] = useState<string[]>([]);
  const [memAttempts, setMemAttempts] = useState(0);
  const [memSeconds, setMemSeconds] = useState(0);

  // --- Classic Quiz Battle State ---
  const [quizIdx, setQuizIdx] = useState(0);
  const [quizScore, setQuizScore] = useState(0);
  const [quizStreak, setQuizStreak] = useState(0);
  const [quizChosen, setQuizChosen] = useState<number | null>(null);
  const [quizFinished, setQuizFinished] = useState(false);

  const selectedSavedSet = useMemo(
    () => studySets.find((s) => s.id === selectedSavedSetId) || null,
    [studySets, selectedSavedSetId]
  );

  // Current material ready to launch new games from
  const readyMaterial = useMemo<AnalyzedMaterial | null>(() => {
    if (analyzedMaterial) return analyzedMaterial;
    if (selectedSavedSet) return studySetToAnalyzedMaterial(selectedSavedSet);
    return null;
  }, [analyzedMaterial, selectedSavedSet]);

  const activeStudySet = useMemo<StudySet | null>(() => {
    if (activeMaterial) return analyzedMaterialToStudySet(activeMaterial);
    if (readyMaterial) return analyzedMaterialToStudySet(readyMaterial);
    return null;
  }, [activeMaterial, readyMaterial]);

  const activeGameMeta = useMemo(
    () => GAME_CATALOG.find((g) => g.id === soloMode) || null,
    [soloMode]
  );

  const activeOriginalMeta = useMemo(
    () => ORIGINAL_GAMES.find((g) => g.id === activeOriginalMode) || null,
    [activeOriginalMode]
  );

  const visibleGames = useMemo(
    () =>
      categoryFilter === 'all'
        ? GAME_CATALOG
        : GAME_CATALOG.filter((g) => g.category === categoryFilter),
    [categoryFilter]
  );

  // Memory timer
  useEffect(() => {
    if (soloMode !== 'memory' || !activeStudySet) return;
    const totalPairs = Math.min(activeStudySet.pairs.length, 6);
    if (totalPairs > 0 && memMatched.length === totalPairs) return;
    const id = window.setInterval(() => setMemSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [soloMode, activeStudySet, memMatched.length]);

  const handleSaveAsStudySet = async () => {
    if (!analyzedMaterial) return;
    setSavingSet(true);
    setSaveNotice(null);
    try {
      const converted = analyzedMaterialToStudySet(analyzedMaterial);
      const id = await createStudySet(userId, {
        title: converted.title,
        subject: converted.subject,
        sourceTitle: converted.sourceTitle,
        flashcards: converted.flashcards,
        pairs: converted.pairs,
        questions: converted.questions,
        selectedFolderIds: converted.selectedFolderIds,
        selectedItemIds: converted.selectedItemIds,
        topics: converted.topics,
        sortRounds: converted.sortRounds,
        puzzles: converted.puzzles,
      });
      setSelectedSavedSetId(id);
      setSaveNotice(`Leerstof opgeslagen als oefenset "${converted.title}".`);
    } catch (err) {
      setLaunchError(err instanceof Error ? err.message : 'Kon oefenset niet opslaan.');
    } finally {
      setSavingSet(false);
    }
  };

  const startFlashcards = (set: StudySet) => {
    setFcQueue(set.flashcards.map((_, i) => i));
    setFcKnown([]);
    setFcFlipped(false);
    setSoloMode('flashcards');
  };

  const startMemory = (set: StudySet) => {
    const slicePairs = set.pairs.slice(0, 6);
    const cards: MemoryCard[] = [];
    slicePairs.forEach((p) => {
      cards.push({ key: `${p.id}-t`, pairId: p.id, label: p.term, kind: 'term' });
      cards.push({ key: `${p.id}-d`, pairId: p.id, label: p.definition, kind: 'def' });
    });
    cards.sort(() => Math.random() - 0.5);
    setMemCards(cards);
    setMemPicked([]);
    setMemMatched([]);
    setMemAttempts(0);
    setMemSeconds(0);
    setSoloMode('memory');
  };

  const startQuizBattle = (set: StudySet) => {
    setQuizIdx(0);
    setQuizScore(0);
    setQuizStreak(0);
    setQuizChosen(null);
    setQuizFinished(false);
    setSoloMode('quiz');
  };

  const launchLibraryGame = (mode: SoloGameMode, setOverride?: StudySet) => {
    setLaunchError(null);
    const mat = setOverride
      ? studySetToAnalyzedMaterial(setOverride)
      : readyMaterial;

    if (!mat) {
      setLaunchError(
        'Selecteer en controleer eerst minimaal één bestand of map met leerstof voordat je een spel start.'
      );
      return;
    }
    const check = checkSoloGameSufficiency(mode, mat);
    if (!check.ok) {
      setLaunchError(check.reason || 'Onvoldoende bruikbare leerstof voor dit spel.');
      return;
    }

    const targetSet = analyzedMaterialToStudySet(mat);
    playGameSound('click', soundEnabled);
    setActiveOriginalMode(null);
    setActiveSessionId(null);
    setInitialProgress(undefined);
    setActiveMaterial(mat);

    if (mode === 'flashcards') {
      startFlashcards(targetSet);
    } else if (mode === 'memory') {
      startMemory(targetSet);
    } else if (mode === 'quiz') {
      startQuizBattle(targetSet);
    } else {
      setSoloMode(mode);
    }

    window.setTimeout(() => {
      stageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  };

  const launchOriginalGame = async (mode: OriginalGameMode) => {
    setLaunchError(null);
    if (!readyMaterial) {
      setLaunchError(
        'Selecteer en analyseer eerst minimaal één bestand of map hierboven. Spellen starten nooit zonder geselecteerde leerstof.'
      );
      return;
    }
    const check = checkSoloGameSufficiency(mode, readyMaterial);
    if (!check.ok) {
      setLaunchError(check.reason || 'Onvoldoende leerstof voor dit spel.');
      return;
    }

    const meta = ORIGINAL_GAMES.find((g) => g.id === mode);
    playGameSound('click', soundEnabled);
    setSoloMode(null);
    setInitialProgress(undefined);
    setActiveMaterial(readyMaterial);
    setActiveOriginalMode(mode);

    try {
      const sessionId = await createSoloGameSession(userId, {
        gameId: mode,
        gameTitle: meta?.title || mode,
        difficulty: 'normal',
        material: JSON.stringify(readyMaterial),
        progress: JSON.stringify({ startedAt: Date.now() }),
        score: 0,
        completed: false,
      });
      setActiveSessionId(sessionId);
    } catch {
      setActiveSessionId(null);
    }

    window.setTimeout(() => {
      stageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  };

  const handleResumeSession = (session: SoloGameSession) => {
    setLaunchError(null);
    const parsedMat = parseSessionMaterial(session.material);
    if (!parsedMat) {
      setLaunchError('De gekoppelde leerstof van dit opgeslagen spel kon niet worden gelezen.');
      return;
    }
    playGameSound('click', soundEnabled);
    setSoloMode(null);
    setActiveMaterial(parsedMat);
    setActiveSessionId(session.id);
    setInitialProgress(session.progress);
    setActiveOriginalMode(session.gameId as OriginalGameMode);
    window.setTimeout(() => {
      stageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  };

  const handlePickMemoryCard = (idx: number) => {
    if (memPicked.length === 2 || memPicked.includes(idx)) return;
    const card = memCards[idx];
    if (!card || memMatched.includes(card.pairId)) return;

    const nextPicked = [...memPicked, idx];
    setMemPicked(nextPicked);
    if (nextPicked.length === 2) {
      setMemAttempts((a) => a + 1);
      const first = memCards[nextPicked[0]];
      const second = memCards[nextPicked[1]];
      if (first.pairId === second.pairId && first.kind !== second.kind) {
        playGameSound('correct', soundEnabled);
        setMemMatched((prev) => [...prev, first.pairId]);
        setMemPicked([]);
      } else {
        playGameSound('wrong', soundEnabled);
        window.setTimeout(() => setMemPicked([]), 750);
      }
    }
  };

  const handleQuizAnswer = (optionIdx: number) => {
    if (!activeStudySet || quizChosen !== null) return;
    const q = activeStudySet.questions[quizIdx];
    if (!q) return;
    setQuizChosen(optionIdx);
    if (optionIdx === q.correctIndex) {
      playGameSound('correct', soundEnabled);
      const nextStreak = quizStreak + 1;
      const multiplier = nextStreak >= 4 ? 3 : nextStreak >= 3 ? 2 : nextStreak >= 2 ? 1.5 : 1;
      setQuizStreak(nextStreak);
      setQuizScore((s) => s + Math.round(100 * multiplier));
    } else {
      playGameSound('wrong', soundEnabled);
      setQuizStreak(0);
    }
  };

  if (loading) {
    return <ListSkeleton rows={5} />;
  }

  const activeCategory = activeGameMeta?.category;

  return (
    <div className="space-y-8">
      {/* Header + Singleplayer / Multiplayer Sub-tab Switcher */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
            Spelplatform &amp; Oefenen
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
            Alle spellen gebruiken uitsluitend jouw geselecteerde bestanden en mappen — geen algemene kennis.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex p-1 rounded-xl bg-slate-200/80 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setHubTab('singleplayer')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                hubTab === 'singleplayer'
                  ? 'bg-white dark:bg-[#161D2B] text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              Singleplayer (33)
            </button>
            <button
              type="button"
              onClick={() => setHubTab('multiplayer')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
                hubTab === 'multiplayer'
                  ? 'bg-white dark:bg-[#161D2B] text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Multiplayer (8)</span>
            </button>
          </div>

          <button
            type="button"
            onClick={onOpenJoinModal}
            className="px-4 py-2 rounded-lg text-xs font-semibold bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2 whitespace-nowrap shrink-0"
          >
            <Users className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <span>Meedoen via gamecode</span>
          </button>
        </div>
      </div>

      {hubTab === 'multiplayer' ? (
        <MultiplayerHub
          userId={userId}
          userName={userName}
          folders={folders}
          items={items}
          onOpenJoinModal={onOpenJoinModal}
        />
      ) : (
        <div className="space-y-8">
          {/* Active Stage for 10 Original Games */}
          {activeOriginalMode && activeOriginalMeta && activeMaterial && (
            <section
              ref={stageRef}
              className="rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-6 sm:p-8 space-y-6 shadow-xs"
            >
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
                <div className="space-y-0.5">
                  <p className={`text-xs font-semibold ${activeOriginalMeta.theme.accentText}`}>
                    {activeOriginalMeta.genre} · {activeOriginalMeta.duration} · Bron: {activeMaterial.title}
                  </p>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                    {activeOriginalMeta.title}
                  </h2>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setSoundEnabled((s) => !s)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 whitespace-nowrap"
                  >
                    {soundEnabled ? (
                      <Volume2 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                    ) : (
                      <VolumeX className="w-3.5 h-3.5 text-slate-400" />
                    )}
                    <span>{soundEnabled ? 'Geluid aan' : 'Gedempt'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveOriginalMode(null)}
                    className="px-3.5 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
                  >
                    Spel sluiten
                  </button>
                </div>
              </div>

              <OriginalGamesStage
                mode={activeOriginalMode}
                material={activeMaterial}
                studySet={activeStudySet}
                soundEnabled={soundEnabled}
                initialProgress={initialProgress}
                onSaveProgress={(payload) => {
                  if (!activeSessionId) return;
                  updateSoloGameSession(userId, activeSessionId, payload).catch(() => {});
                }}
                onExit={() => setActiveOriginalMode(null)}
              />
            </section>
          )}

          {/* Active Stage for 23 Library Games */}
          {soloMode && activeStudySet && activeGameMeta && (
            <section
              ref={stageRef}
              className="rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-6 sm:p-8 space-y-6"
            >
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
                <div className="space-y-0.5">
                  <p className="text-xs font-medium text-indigo-600 dark:text-indigo-400">
                    {activeGameMeta.categoryLabel} · {activeGameMeta.title}
                  </p>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                    {activeStudySet.title}
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Waarom dit helpt: {activeGameMeta.retentionTip}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setSoundEnabled((s) => !s)}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 whitespace-nowrap"
                  >
                    {soundEnabled ? (
                      <Volume2 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                    ) : (
                      <VolumeX className="w-3.5 h-3.5 text-slate-400" />
                    )}
                    <span>{soundEnabled ? 'Geluid aan' : 'Gedempt'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSoloMode(null)}
                    className="px-3.5 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
                  >
                    Spel sluiten
                  </button>
                </div>
              </div>

              {/* 1. FLASHCARDS */}
              {soloMode === 'flashcards' && (
                <div className="max-w-xl mx-auto space-y-6">
                  <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                    <span>Beheerst: {fcKnown.length} / {activeStudySet.flashcards.length}</span>
                    <span>Nog te oefenen: {fcQueue.length}</span>
                  </div>

                  {fcQueue.length === 0 ? (
                    <div className="py-10 text-center space-y-4">
                      <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
                      <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                        Alle {activeStudySet.flashcards.length} kaarten uit jouw bronnen afgerond!
                      </h3>
                      <button
                        type="button"
                        onClick={() => startFlashcards(activeStudySet)}
                        className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium inline-flex items-center gap-2"
                      >
                        <RotateCcw className="w-4 h-4" />
                        <span>Opnieuw oefenen</span>
                      </button>
                    </div>
                  ) : (
                    <>
                      <div
                        onClick={() => setFcFlipped((f) => !f)}
                        className="perspective-1000 cursor-pointer select-none"
                      >
                        <div
                          className={`relative min-h-[240px] w-full transition-transform duration-500 transform-style-3d ${
                            fcFlipped ? 'rotate-y-180' : ''
                          }`}
                        >
                          <div className="absolute inset-0 backface-hidden rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 p-8 flex flex-col items-center justify-center text-center">
                            <span className="text-xs font-medium text-slate-400 mb-3">
                              Vraag / Begrip (klik om te draaien)
                            </span>
                            <p className="text-lg font-bold text-slate-900 dark:text-slate-100 leading-snug">
                              {activeStudySet.flashcards[fcQueue[0]].front}
                            </p>
                            {activeStudySet.flashcards[fcQueue[0]].sourceTitle && (
                              <span className="mt-4 text-[11px] text-slate-500">
                                Bron: {activeStudySet.flashcards[fcQueue[0]].sourceTitle} ·{' '}
                                {activeStudySet.flashcards[fcQueue[0]].sourceSection || 'Brontekst'}
                              </span>
                            )}
                          </div>
                          <div className="absolute inset-0 backface-hidden rotate-y-180 rounded-2xl border border-indigo-300 dark:border-indigo-700 bg-indigo-50/70 dark:bg-indigo-950/40 p-8 flex flex-col items-center justify-center text-center">
                            <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400 mb-3">
                              Antwoord
                            </span>
                            <p className="text-base font-medium text-slate-900 dark:text-slate-100 leading-relaxed">
                              {activeStudySet.flashcards[fcQueue[0]].back}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            playGameSound('wrong', soundEnabled);
                            const [current, ...rest] = fcQueue;
                            setFcQueue([...rest, current]);
                            setFcFlipped(false);
                          }}
                          className="py-3 px-4 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/30 text-amber-800 dark:text-amber-300 text-sm font-semibold hover:bg-amber-100 dark:hover:bg-amber-950/50"
                        >
                          Nog eens oefenen
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            playGameSound('correct', soundEnabled);
                            const [current, ...rest] = fcQueue;
                            setFcKnown((k) => [...k, current]);
                            setFcQueue(rest);
                            setFcFlipped(false);
                          }}
                          className="py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold"
                        >
                          Weet ik!
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* 2. MEMORY */}
              {soloMode === 'memory' && (
                <div className="space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-4 text-xs text-slate-600 dark:text-slate-400 tabular-nums">
                    <span className="flex items-center gap-1.5 font-mono">
                      <Timer className="w-4 h-4" />
                      {memSeconds}s
                    </span>
                    <span>Gevonden paren: {memMatched.length} / {Math.min(activeStudySet.pairs.length, 6)}</span>
                    <span>Pogingen: {memAttempts}</span>
                  </div>

                  {memMatched.length === Math.min(activeStudySet.pairs.length, 6) && memCards.length > 0 ? (
                    <div className="py-10 text-center space-y-4">
                      <Trophy className="w-10 h-10 text-amber-500 mx-auto" />
                      <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                        Alles gekoppeld in {memSeconds} seconden ({memAttempts} pogingen)!
                      </h3>
                      <button
                        type="button"
                        onClick={() => startMemory(activeStudySet)}
                        className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium inline-flex items-center gap-2"
                      >
                        <RotateCcw className="w-4 h-4" />
                        <span>Nog een keer</span>
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                      {memCards.map((card, idx) => {
                        const isMatched = memMatched.includes(card.pairId);
                        const isPicked = memPicked.includes(idx);
                        return (
                          <button
                            key={card.key}
                            type="button"
                            disabled={isMatched}
                            onClick={() => handlePickMemoryCard(idx)}
                            className={`min-h-[96px] p-3.5 rounded-xl border text-left text-xs leading-relaxed transition-all ${
                              isMatched
                                ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-400 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 opacity-50'
                                : isPicked
                                  ? 'bg-indigo-50 dark:bg-indigo-950/50 border-indigo-500 text-indigo-900 dark:text-indigo-200'
                                  : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-indigo-400'
                            }`}
                          >
                            <span className="block text-[10px] font-medium text-slate-400 mb-1">
                              {card.kind === 'term' ? 'Begrip' : 'Definitie'}
                            </span>
                            <span className="font-medium text-slate-900 dark:text-slate-100">
                              {card.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* 3. QUIZ BATTLE SOLO */}
              {soloMode === 'quiz' && activeStudySet.questions.length > 0 && (
                <div className="max-w-2xl mx-auto space-y-6">
                  {quizFinished ? (
                    <div className="py-8 text-center space-y-4">
                      <Trophy className="w-10 h-10 text-amber-500 mx-auto" />
                      <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                        Quiz Battle voltooid!
                      </h3>
                      <p className="font-mono text-2xl font-bold tabular-nums text-indigo-600 dark:text-indigo-400">
                        Eindscore: {quizScore} punten
                      </p>
                      <button
                        type="button"
                        onClick={() => startQuizBattle(activeStudySet)}
                        className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium inline-flex items-center gap-2"
                      >
                        <RotateCcw className="w-4 h-4" />
                        <span>Opnieuw spelen</span>
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between text-xs font-medium text-slate-500 dark:text-slate-400 tabular-nums">
                        <span>
                          Vraag {quizIdx + 1} van {activeStudySet.questions.length}
                        </span>
                        <div className="flex items-center gap-4">
                          <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                            <Flame className="w-3.5 h-3.5" />
                            Streak {quizStreak}x
                          </span>
                          <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                            {quizScore} ptn
                          </span>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                          {activeStudySet.questions[quizIdx].question}
                        </h3>
                        {activeStudySet.questions[quizIdx].sourceTitle && (
                          <p className="text-[11px] text-slate-500 flex items-center gap-1">
                            <BookOpen className="w-3.5 h-3.5" />
                            <span>
                              Bron: {activeStudySet.questions[quizIdx].sourceTitle} ·{' '}
                              {activeStudySet.questions[quizIdx].sourceSection || 'Brontekst'}
                            </span>
                          </p>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {activeStudySet.questions[quizIdx].options.map((opt, idx) => {
                          const isRight = idx === activeStudySet.questions[quizIdx].correctIndex;
                          const isPicked = quizChosen === idx;
                          const reveal = quizChosen !== null;
                          return (
                            <button
                              key={idx}
                              type="button"
                              disabled={reveal}
                              onClick={() => handleQuizAnswer(idx)}
                              className={`p-4 rounded-xl border text-left text-sm font-medium flex items-start justify-between gap-2 transition-colors ${
                                !reveal
                                  ? 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-indigo-500'
                                  : isRight
                                    ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500 text-emerald-900 dark:text-emerald-200'
                                    : isPicked
                                      ? 'bg-red-50 dark:bg-red-950/40 border-red-500 text-red-900 dark:text-red-200'
                                      : 'bg-slate-50/50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800 text-slate-400'
                              }`}
                            >
                              <span>{opt}</span>
                              {reveal && isRight && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
                              {reveal && isPicked && !isRight && <XCircle className="w-4 h-4 text-red-600 shrink-0" />}
                            </button>
                          );
                        })}
                      </div>

                      {quizChosen !== null && (
                        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
                          <p className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                            {quizChosen === activeStudySet.questions[quizIdx].correctIndex
                              ? 'Goed beantwoord!'
                              : 'Uitleg uit jouw geselecteerde bron:'}
                          </p>
                          <p className="text-sm text-slate-600 dark:text-slate-400">
                            {activeStudySet.questions[quizIdx].explanation}
                          </p>
                          <div className="flex justify-end">
                            <button
                              type="button"
                              onClick={() => {
                                if (quizIdx + 1 >= activeStudySet.questions.length) {
                                  setQuizFinished(true);
                                } else {
                                  setQuizIdx((i) => i + 1);
                                  setQuizChosen(null);
                                }
                              }}
                              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold"
                            >
                              {quizIdx + 1 >= activeStudySet.questions.length
                                ? 'Bekijk resultaat'
                                : 'Volgende vraag'}
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* 4-23: 20 Bibliotheek Spellen */}
              {activeCategory === 'recall' && (
                <RecallGamesStage mode={soloMode} studySet={activeStudySet} soundEnabled={soundEnabled} />
              )}
              {activeCategory === 'arcade' && (
                <ArcadeGamesStage mode={soloMode} studySet={activeStudySet} soundEnabled={soundEnabled} />
              )}
              {activeCategory === 'puzzle' && (
                <PuzzleGamesStage mode={soloMode} studySet={activeStudySet} soundEnabled={soundEnabled} />
              )}
              {activeCategory === 'strategy' && (
                <StrategyGamesStage mode={soloMode} studySet={activeStudySet} soundEnabled={soundEnabled} />
              )}
            </section>
          )}

          {/* Mandatory Material Selector */}
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <span>Stap 1: Selecteer &amp; controleer jouw leerstof (verplicht)</span>
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Elk spel hieronder gebruikt uitsluitend wat je hier selecteert en analyseert. Er worden nooit feiten buiten deze bronnen gebruikt.
                </p>
              </div>

              {analyzedMaterial && analyzedMaterial.concepts.length + analyzedMaterial.questions.length > 0 && (
                <button
                  type="button"
                  disabled={savingSet}
                  onClick={handleSaveAsStudySet}
                  className="px-3.5 py-2 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50/70 dark:bg-indigo-950/30 text-indigo-700 dark:text-indigo-300 text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-indigo-100 dark:hover:bg-indigo-950/50 disabled:opacity-60"
                >
                  <BookmarkPlus className="w-4 h-4" />
                  <span>{savingSet ? 'Opslaan...' : 'Bewaar als oefenset'}</span>
                </button>
              )}
            </div>

            {saveNotice && (
              <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-xs text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{saveNotice}</span>
              </div>
            )}

            {launchError && (
              <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{launchError}</span>
              </div>
            )}

            <MaterialSelector
              folders={folders}
              items={items}
              initialMaterial={analyzedMaterial}
              onAnalyzed={(m) => {
                setAnalyzedMaterial(m);
                setLaunchError(null);
                setSaveNotice(null);
                if (m) setSelectedSavedSetId(null);
              }}
            />
          </section>

          {/* Saved Personal Solo Game Sessions + Saved StudySets */}
          {(soloSessions.length > 0 || studySets.length > 0) && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
              {/* Saved Solo Sessions */}
              <section className="rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-6 space-y-4">
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <History className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <span>Opgeslagen persoonlijke spellen ({soloSessions.length})</span>
                </h2>
                {soloSessions.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Zodra je één van de 10 spellen start wordt je voortgang inclusief gekoppelde leerstof hier opgeslagen.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {soloSessions.slice(0, 8).map((sess) => {
                      const mat = parseSessionMaterial(sess.material);
                      const sourceNames = mat
                        ? mat.fileStatuses.filter((f) => f.readable).map((f) => f.title)
                        : [];
                      return (
                        <div
                          key={sess.id}
                          className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60 flex items-start justify-between gap-3"
                        >
                          <div className="space-y-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                                {sess.gameTitle}
                              </span>
                              <span
                                className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                                  sess.completed
                                    ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                                    : 'bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300'
                                }`}
                              >
                                {sess.completed ? 'Voltooid' : 'Bezig'}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                              Bron: {sourceNames.join(', ') || mat?.title || 'Geselecteerde leerstof'} · Score: {sess.score}
                            </p>
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleResumeSession(sess)}
                              className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold"
                            >
                              Hervatten
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteSessionTarget(sess)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-red-600"
                              aria-label="Sessie verwijderen"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* Saved Study Sets */}
              <section className="rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-6 space-y-4">
                <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <span>Bewaarde oefensets ({studySets.length})</span>
                </h2>
                {studySets.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Analyseer leerstof hierboven en klik op &ldquo;Bewaar als oefenset&rdquo; om hem vaker te gebruiken.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {studySets.map((set) => {
                      const isSelected = !analyzedMaterial && selectedSavedSet?.id === set.id;
                      return (
                        <div
                          key={set.id}
                          className={`p-4 rounded-xl border space-y-3 transition-colors ${
                            isSelected
                              ? 'border-indigo-500 bg-indigo-50/40 dark:bg-indigo-950/20'
                              : 'border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setAnalyzedMaterial(null);
                                setSelectedSavedSetId(set.id);
                              }}
                              className="text-left"
                            >
                              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                {set.subject} · {set.pairs.length} begrippen · {set.questions.length} vragen
                                {isSelected ? ' · Actief geselecteerd' : ''}
                              </p>
                              <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
                                {set.title}
                              </p>
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteSetTarget(set)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-red-600"
                              aria-label="Oefenset verwijderen"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => launchLibraryGame('flashcards', set)}
                              className="px-2.5 py-1 rounded-lg bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 text-xs font-medium hover:border-indigo-400"
                            >
                              Flashcards
                            </button>
                            <button
                              type="button"
                              onClick={() => launchLibraryGame('memory', set)}
                              className="px-2.5 py-1 rounded-lg bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 text-xs font-medium hover:border-indigo-400"
                            >
                              Memory
                            </button>
                            <button
                              type="button"
                              onClick={() => launchLibraryGame('quiz', set)}
                              className="px-2.5 py-1 rounded-lg bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 text-xs font-medium hover:border-indigo-400"
                            >
                              Quiz Battle
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setAnalyzedMaterial(null);
                                setSelectedSavedSetId(set.id);
                                libraryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                              }}
                              className="px-2.5 py-1 rounded-lg text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
                            >
                              Gebruik voor alle spellen →
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>
          )}

          {/* 10 Originele Interactieve Leerspellen Showcase */}
          <section className="rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-6 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                  10 Originele Interactieve Leerspellen
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {readyMaterial
                    ? `Geselecteerde leerstof: "${readyMaterial.title}" · Eindcijfer 1 t/m 10`
                    : 'Selecteer en analyseer eerst leerstof in Stap 1 hierboven om een spel vrij te spelen.'}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {ORIGINAL_GAMES.map((g) => {
                const Icon = g.icon;
                const isPlaying = activeOriginalMode === g.id;
                const check = readyMaterial
                  ? checkSoloGameSufficiency(g.id, readyMaterial)
                  : {
                      ok: false,
                      reason: 'Selecteer en controleer eerst jouw leerstof in Stap 1.',
                    };

                return (
                  <div
                    key={g.id}
                    className={`rounded-2xl border p-5 flex flex-col justify-between gap-4 transition-all ${
                      isPlaying
                        ? `${g.theme.accentBorder} ${g.theme.accentSoftBg}`
                        : 'border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/50'
                    }`}
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div
                          className={`w-10 h-10 rounded-xl ${g.theme.accentBg} text-white flex items-center justify-center shrink-0 shadow-xs`}
                        >
                          <Icon className="w-5 h-5" />
                        </div>
                        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                          {g.genre} · {g.duration}
                        </span>
                      </div>

                      <div className="space-y-1">
                        <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                          {g.title}
                        </h3>
                        <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                          {g.shortDesc}
                        </p>
                      </div>

                      {!check.ok && (
                        <p className="text-[11px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-lg px-2.5 py-1.5 flex items-start gap-1.5">
                          <Lock className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                          <span>{check.reason}</span>
                        </p>
                      )}
                    </div>

                    <button
                      type="button"
                      disabled={!check.ok}
                      onClick={() => launchOriginalGame(g.id)}
                      className={`w-full py-2.5 px-4 rounded-xl ${g.theme.accentBg} ${g.theme.accentHover} text-white text-xs font-semibold inline-flex items-center justify-center gap-2 transition-colors disabled:opacity-45 disabled:cursor-not-allowed`}
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>{check.ok ? 'Start spel' : 'Eerst leerstof kiezen'}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          </section>

          {/* 23-Game Library */}
          <section
            ref={libraryRef}
            className="rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-6 space-y-5"
          >
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                  Spelbibliotheek · 23 manieren om stof écht te onthouden
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {readyMaterial
                    ? `Actieve leerstof: ${readyMaterial.title} (${readyMaterial.subject}). Alle vragen en woorden komen uitsluitend uit jouw selectie.`
                    : 'Selecteer en analyseer hierboven eerst leerstof (of kies een bewaarde oefenset) om deze 23 spellen te spelen.'}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-xl bg-slate-100 dark:bg-slate-900">
              {CATEGORY_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setCategoryFilter(tab.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    categoryFilter === tab.id
                      ? 'bg-white dark:bg-[#161D2B] text-slate-900 dark:text-slate-100 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {visibleGames.map((game) => {
                const isActive = soloMode === game.id;
                const check = readyMaterial
                  ? checkSoloGameSufficiency(game.id, readyMaterial)
                  : { ok: false, reason: 'Eerst leerstof kiezen' };

                return (
                  <button
                    key={game.id}
                    type="button"
                    disabled={!check.ok}
                    onClick={() => launchLibraryGame(game.id)}
                    className={`text-left rounded-xl border p-4 flex flex-col justify-between gap-3 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                      isActive
                        ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/30'
                        : 'border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/60 hover:border-indigo-400 dark:hover:border-indigo-700'
                    }`}
                  >
                    <div className="space-y-1.5">
                      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                        <span>{game.categoryLabel}</span>
                        {game.isNew && (
                          <>
                            <span aria-hidden="true"> · </span>
                            <span className="text-indigo-600 dark:text-indigo-400 font-semibold">
                              Nieuw
                            </span>
                          </>
                        )}
                      </p>
                      <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                        {game.title}
                      </h3>
                      <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                        {game.shortDesc}
                      </p>
                    </div>

                    <div className="pt-2 border-t border-slate-200/80 dark:border-slate-800 flex items-center justify-between gap-2 text-xs">
                      <span className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1">
                        {check.ok ? game.retentionTip : check.reason}
                      </span>
                      <span className="font-semibold text-indigo-600 dark:text-indigo-400 whitespace-nowrap shrink-0">
                        {check.ok ? 'Spelen →' : 'Vergrendeld'}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        </div>
      )}

      <ConfirmModal
        open={Boolean(deleteSetTarget)}
        title="Oefenset verwijderen?"
        description={`Weet je zeker dat je "${deleteSetTarget?.title}" wilt verwijderen?`}
        busy={deleting}
        onCancel={() => setDeleteSetTarget(null)}
        onConfirm={async () => {
          if (!deleteSetTarget) return;
          setDeleting(true);
          try {
            await deleteStudySet(userId, deleteSetTarget.id);
            if (selectedSavedSetId === deleteSetTarget.id) setSelectedSavedSetId(null);
            setDeleteSetTarget(null);
          } finally {
            setDeleting(false);
          }
        }}
      />

      <ConfirmModal
        open={Boolean(deleteSessionTarget)}
        title="Opgeslagen spel verwijderen?"
        description={`Weet je zeker dat je jouw voortgang voor "${deleteSessionTarget?.gameTitle}" wilt verwijderen?`}
        busy={deleting}
        onCancel={() => setDeleteSessionTarget(null)}
        onConfirm={async () => {
          if (!deleteSessionTarget) return;
          setDeleting(true);
          try {
            await deleteSoloGameSession(userId, deleteSessionTarget.id);
            setDeleteSessionTarget(null);
          } finally {
            setDeleting(false);
          }
        }}
      />
    </div>
  );
};
