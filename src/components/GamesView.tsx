import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Flame,
  Gamepad2,
  Layers,
  Play,
  RotateCcw,
  Sparkles,
  Timer,
  Trash2,
  Trophy,
  Users,
  XCircle,
} from 'lucide-react';
import { Folder, MultiplayerMode, StudyItem, StudySet } from '../types';
import {
  createMultiplayerRoom,
  createStudySet,
  deleteStudySet,
} from '../lib/studyStore';
import { ConfirmModal } from './ConfirmModal';
import { MultiplayerRoomView } from './MultiplayerRoomView';
import { ListSkeleton } from './Skeletons';
import { postAiJson } from '../lib/apiClient';

interface GamesViewProps {
  userId: string;
  userName: string;
  folders: Folder[];
  items: StudyItem[];
  studySets: StudySet[];
  loading: boolean;
  onOpenJoinModal: () => void;
}

type SourceType = 'item' | 'folder' | 'paste';
type SoloGameMode = 'flashcards' | 'memory' | 'quiz';

export const GamesView: React.FC<GamesViewProps> = ({
  userId,
  userName,
  folders,
  items,
  studySets,
  loading,
  onOpenJoinModal,
}) => {
  // Generator state
  const [sourceType, setSourceType] = useState<SourceType>(items.length > 0 ? 'item' : 'paste');
  const [selectedItemId, setSelectedItemId] = useState(items[0]?.id || '');
  const [selectedFolderId, setSelectedFolderId] = useState(folders[0]?.id || '');
  const [pastedTitle, setPastedTitle] = useState('');
  const [pastedSubject, setPastedSubject] = useState('');
  const [pastedText, setPastedText] = useState('');
  const [questionCount, setQuestionCount] = useState(8);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  // Active set & game mode
  const [activeSetId, setActiveSetId] = useState<string | null>(null);
  const [soloMode, setSoloMode] = useState<SoloGameMode | null>(null);
  const [hostingRoomCode, setHostingRoomCode] = useState<string | null>(null);
  const [hostModeChoice, setHostModeChoice] = useState<MultiplayerMode>('quiz');
  const [hostBusy, setHostBusy] = useState(false);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<StudySet | null>(null);
  const [deleting, setDeleting] = useState(false);

  // --- Solo Flashcards State ---
  const [fcQueue, setFcQueue] = useState<number[]>([]);
  const [fcKnown, setFcKnown] = useState<number[]>([]);
  const [fcFlipped, setFcFlipped] = useState(false);

  // --- Solo Memory State ---
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

  // --- Solo Quiz Battle State ---
  const [quizIdx, setQuizIdx] = useState(0);
  const [quizScore, setQuizScore] = useState(0);
  const [quizStreak, setQuizStreak] = useState(0);
  const [quizChosen, setQuizChosen] = useState<number | null>(null);
  const [quizFinished, setQuizFinished] = useState(false);

  const activeSet = useMemo(
    () => studySets.find((s) => s.id === activeSetId) || studySets[0] || null,
    [studySets, activeSetId]
  );

  // Memory timer
  useEffect(() => {
    if (soloMode !== 'memory' || !activeSet) return;
    if (memMatched.length > 0 && memMatched.length === activeSet.pairs.length) return;
    const id = window.setInterval(() => setMemSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(id);
  }, [soloMode, activeSet, memMatched.length]);

  const handleGenerateSet = async (e: React.FormEvent) => {
    e.preventDefault();
    setGenError(null);
    let title = 'Oefenset';
    let subject = 'Algemeen';
    let content = '';
    let aiSourceType: string = sourceType;

    if (sourceType === 'item') {
      const it = items.find((i) => i.id === selectedItemId) || items[0];
      if (!it) {
        setGenError('Geen bestand gevonden. Kies "Tekst plakken" of voeg eerst een notitie toe.');
        return;
      }
      title = it.title;
      subject = it.subject || 'Algemeen';
      content = it.content;
      aiSourceType = it.type;
    } else if (sourceType === 'folder') {
      const fld = folders.find((f) => f.id === selectedFolderId) || folders[0];
      if (!fld) {
        setGenError('Geen map geselecteerd.');
        return;
      }
      const folderItems = items.filter((i) => i.folderId === fld.id);
      if (folderItems.length === 0) {
        setGenError('Deze map bevat nog geen documenten.');
        return;
      }
      title = fld.name;
      subject = fld.subject || fld.name;
      content = folderItems.map((fi) => `${fi.title}:\n${fi.content}`).join('\n\n');
    } else {
      title = pastedTitle.trim() || 'Geplakte leerstof';
      subject = pastedSubject.trim() || 'Algemeen';
      content = pastedText;
    }

    if (!content || content.trim().length < 20) {
      setGenError('Voeg minimaal een paar zinnen leerstof toe om vragen te kunnen genereren.');
      return;
    }

    setGenerating(true);
    try {
      const data = await postAiJson<{
        setTitle?: string;
        flashcards?: Array<{ front: string; back: string }>;
        pairs?: Array<{ id: string; term: string; definition: string }>;
        questions?: Array<{
          question: string;
          options: string[];
          correctIndex: number;
          explanation: string;
        }>;
      }>('/api/ai/game', {
        title,
        subject,
        content,
        count: questionCount,
        sourceType: aiSourceType,
      });

      const id = await createStudySet(userId, {
        title: data.setTitle || title,
        subject,
        sourceTitle: title,
        flashcards: Array.isArray(data.flashcards) ? data.flashcards : [],
        pairs: Array.isArray(data.pairs) ? data.pairs : [],
        questions: Array.isArray(data.questions) ? data.questions : [],
      });
      setActiveSetId(id);
      setSoloMode(null);
      setPastedText('');
    } catch (err) {
      setGenError(err instanceof Error ? err.message : 'Fout bij genereren van spel.');
    } finally {
      setGenerating(false);
    }
  };

  const startFlashcards = (set: StudySet) => {
    setActiveSetId(set.id);
    setFcQueue(set.flashcards.map((_, i) => i));
    setFcKnown([]);
    setFcFlipped(false);
    setSoloMode('flashcards');
  };

  const startMemory = (set: StudySet) => {
    setActiveSetId(set.id);
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
        setMemMatched((prev) => [...prev, first.pairId]);
        setMemPicked([]);
      } else {
        window.setTimeout(() => setMemPicked([]), 750);
      }
    }
  };

  const startQuizBattle = (set: StudySet) => {
    setActiveSetId(set.id);
    setQuizIdx(0);
    setQuizScore(0);
    setQuizStreak(0);
    setQuizChosen(null);
    setQuizFinished(false);
    setSoloMode('quiz');
  };

  const handleQuizAnswer = (optionIdx: number) => {
    if (!activeSet || quizChosen !== null) return;
    const q = activeSet.questions[quizIdx];
    if (!q) return;
    setQuizChosen(optionIdx);
    if (optionIdx === q.correctIndex) {
      const nextStreak = quizStreak + 1;
      const multiplier = nextStreak >= 4 ? 3 : nextStreak >= 3 ? 2 : nextStreak >= 2 ? 1.5 : 1;
      setQuizStreak(nextStreak);
      setQuizScore((s) => s + Math.round(100 * multiplier));
    } else {
      setQuizStreak(0);
    }
  };

  const handleHostMultiplayer = async (set: StudySet) => {
    setHostBusy(true);
    setGenError(null);
    try {
      const roomCode = await createMultiplayerRoom({
        hostId: userId,
        hostName: userName,
        title: set.title,
        gameMode: hostModeChoice,
        questions: set.questions,
        pairs: set.pairs,
      });
      setHostingRoomCode(roomCode);
    } catch (err) {
      setGenError(err instanceof Error ? err.message : 'Kon multiplayer kamer niet starten.');
    } finally {
      setHostBusy(false);
    }
  };

  if (loading) {
    return <ListSkeleton rows={5} />;
  }

  if (hostingRoomCode) {
    return (
      <MultiplayerRoomView
        roomCode={hostingRoomCode}
        currentUserId={userId}
        isHost={true}
        onExit={() => setHostingRoomCode(null)}
      />
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
            Spelletjes &amp; Oefenen
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
            Zet leerstof om in flashcards, memory, quiz battles of een realtime multiplayer spel.
          </p>
        </div>

        <button
          type="button"
          onClick={onOpenJoinModal}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2 whitespace-nowrap shrink-0"
        >
          <Users className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          <span>Meedoen via gamecode</span>
        </button>
      </div>

      {/* Solo Mini-Game Active Stage */}
      {soloMode && activeSet && (
        <section className="rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-6 sm:p-8 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
            <div>
              <p className="text-xs font-medium text-indigo-600 dark:text-indigo-400">
                {soloMode === 'flashcards'
                  ? 'Flashcards (Actieve Herinnering)'
                  : soloMode === 'memory'
                    ? 'Memory / Match-spel'
                    : 'Quiz Battle (Solo)'}
              </p>
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                {activeSet.title}
              </h2>
            </div>

            <button
              type="button"
              onClick={() => setSoloMode(null)}
              className="px-3.5 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Spel sluiten
            </button>
          </div>

          {/* 1. FLASHCARDS */}
          {soloMode === 'flashcards' && (
            <div className="max-w-xl mx-auto space-y-6">
              <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                <span>Beheerst: {fcKnown.length} / {activeSet.flashcards.length}</span>
                <span>Nog te oefenen: {fcQueue.length}</span>
              </div>

              {fcQueue.length === 0 ? (
                <div className="py-10 text-center space-y-4">
                  <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
                  <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                    Alle {activeSet.flashcards.length} kaarten afgerond!
                  </h3>
                  <button
                    type="button"
                    onClick={() => startFlashcards(activeSet)}
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
                      {/* Front */}
                      <div className="absolute inset-0 backface-hidden rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 p-8 flex flex-col items-center justify-center text-center">
                        <span className="text-xs font-medium text-slate-400 mb-3">
                          Vraag / Begrip (klik om te draaien)
                        </span>
                        <p className="text-lg font-bold text-slate-900 dark:text-slate-100 leading-snug">
                          {activeSet.flashcards[fcQueue[0]].front}
                        </p>
                      </div>
                      {/* Back */}
                      <div className="absolute inset-0 backface-hidden rotate-y-180 rounded-2xl border border-indigo-300 dark:border-indigo-700 bg-indigo-50/70 dark:bg-indigo-950/40 p-8 flex flex-col items-center justify-center text-center">
                        <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400 mb-3">
                          Antwoord
                        </span>
                        <p className="text-base font-medium text-slate-900 dark:text-slate-100 leading-relaxed">
                          {activeSet.flashcards[fcQueue[0]].back}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => {
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

          {/* 2. MEMORY / MATCH */}
          {soloMode === 'memory' && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-4 text-xs text-slate-600 dark:text-slate-400 tabular-nums">
                <span className="flex items-center gap-1.5 font-mono">
                  <Timer className="w-4 h-4" />
                  {memSeconds}s
                </span>
                <span>Gevonden paren: {memMatched.length} / {Math.min(activeSet.pairs.length, 6)}</span>
                <span>Pogingen: {memAttempts}</span>
              </div>

              {memMatched.length === Math.min(activeSet.pairs.length, 6) && memCards.length > 0 ? (
                <div className="py-10 text-center space-y-4">
                  <Trophy className="w-10 h-10 text-amber-500 mx-auto" />
                  <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                    Alles gekoppeld in {memSeconds} seconden ({memAttempts} pogingen)!
                  </h3>
                  <button
                    type="button"
                    onClick={() => startMemory(activeSet)}
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
          {soloMode === 'quiz' && activeSet.questions.length > 0 && (
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
                    onClick={() => startQuizBattle(activeSet)}
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
                      Vraag {quizIdx + 1} van {activeSet.questions.length}
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

                  <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                    {activeSet.questions[quizIdx].question}
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {activeSet.questions[quizIdx].options.map((opt, idx) => {
                      const isRight = idx === activeSet.questions[quizIdx].correctIndex;
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
                        {quizChosen === activeSet.questions[quizIdx].correctIndex
                          ? 'Goed beantwoord!'
                          : 'Uitleg bij het juiste antwoord:'}
                      </p>
                      <p className="text-sm text-slate-600 dark:text-slate-400">
                        {activeSet.questions[quizIdx].explanation}
                      </p>
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => {
                            if (quizIdx + 1 >= activeSet.questions.length) {
                              setQuizFinished(true);
                            } else {
                              setQuizIdx((i) => i + 1);
                              setQuizChosen(null);
                            }
                          }}
                          className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold"
                        >
                          {quizIdx + 1 >= activeSet.questions.length
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
        </section>
      )}

      {/* Split Layout: AI Game Generator + Saved Sets */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* AI Set Generator */}
        <div className="lg:col-span-5 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-6 space-y-5">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Nieuwe spelset maken met AI
            </h2>
          </div>

          <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-900">
            {[
              { id: 'item', label: 'Bestand / PDF' },
              { id: 'folder', label: 'Hele map' },
              { id: 'paste', label: 'Tekst plakken' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSourceType(tab.id as SourceType)}
                className={`flex-1 py-1.5 px-2 rounded-md text-xs font-medium transition-colors whitespace-nowrap ${
                  sourceType === tab.id
                    ? 'bg-white dark:bg-[#161D2B] text-slate-900 dark:text-slate-100 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {genError && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300">
              {genError}
            </div>
          )}

          <form onSubmit={handleGenerateSet} className="space-y-4">
            {sourceType === 'item' && (
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Selecteer document of PDF
                </label>
                <select
                  value={selectedItemId}
                  onChange={(e) => setSelectedItemId(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm"
                >
                  {items.length === 0 ? (
                    <option value="">Nog geen bestanden</option>
                  ) : (
                    items.map((it) => {
                      const kindLabel = it.type === 'pdf' ? 'PDF' : 'Notitie';
                      return (
                        <option key={it.id} value={it.id}>
                          {it.title} ({kindLabel} · {it.subject || 'Algemeen'})
                        </option>
                      );
                    })
                  )}
                </select>
              </div>
            )}

            {sourceType === 'folder' && (
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Selecteer map
                </label>
                <select
                  value={selectedFolderId}
                  onChange={(e) => setSelectedFolderId(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm"
                >
                  {folders.length === 0 ? (
                    <option value="">Nog geen mappen</option>
                  ) : (
                    folders.map((fld) => (
                      <option key={fld.id} value={fld.id}>
                        {fld.name}
                      </option>
                    ))
                  )}
                </select>
              </div>
            )}

            {sourceType === 'paste' && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="text"
                    value={pastedTitle}
                    onChange={(e) => setPastedTitle(e.target.value)}
                    placeholder="Titel van spelset"
                    className="px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm"
                  />
                  <input
                    type="text"
                    value={pastedSubject}
                    onChange={(e) => setPastedSubject(e.target.value)}
                    placeholder="Vak (bijv. Engels)"
                    className="px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm"
                  />
                </div>
                <textarea
                  rows={5}
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                  placeholder="Plak hier je woordenlijst, begrippen of lesstof..."
                  className="w-full px-3.5 py-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm"
                />
              </>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                Aantal vragen / kaarten ({questionCount})
              </label>
              <input
                type="range"
                min={4}
                max={15}
                value={questionCount}
                onChange={(e) => setQuestionCount(Number(e.target.value))}
                className="w-full accent-indigo-600"
              />
            </div>

            <button
              type="submit"
              disabled={generating}
              className="w-full py-2.5 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
            >
              <Sparkles className="w-4 h-4" />
              <span>{generating ? 'Spelset genereren...' : 'Genereer Spelset'}</span>
            </button>
          </form>
        </div>

        {/* Saved Study Sets & Launchers */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Jouw speelklaar oefensets ({studySets.length})
            </h2>
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-500 dark:text-slate-400">Multiplayer modus:</span>
              <select
                value={hostModeChoice}
                onChange={(e) => setHostModeChoice(e.target.value as MultiplayerMode)}
                className="px-2 py-1 rounded-md bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 text-xs font-medium"
              >
                <option value="quiz">Quiz Battle</option>
                <option value="speed-match">Speed-Match</option>
              </select>
            </div>
          </div>

          {studySets.length === 0 ? (
            <div className="rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-10 text-center space-y-2">
              <Gamepad2 className="w-8 h-8 text-slate-400 mx-auto" />
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Nog geen leerspelletjes gegenereerd
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Kies links een document of plak leerstof om direct flashcards, memory en een quiz
                te maken.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {studySets.map((set) => (
                <div
                  key={set.id}
                  className="rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5 space-y-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {set.subject} · {set.flashcards.length} flashcards · {set.questions.length}{' '}
                        quizvragen
                      </p>
                      <h3 className="mt-0.5 text-base font-bold text-slate-900 dark:text-slate-100">
                        {set.title}
                      </h3>
                    </div>

                    <button
                      type="button"
                      onClick={() => setDeleteTarget(set)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 dark:hover:text-red-400"
                      aria-label="Spelset verwijderen"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => startFlashcards(set)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <Layers className="w-3.5 h-3.5" />
                      <span>Flashcards</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => startMemory(set)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <Play className="w-3.5 h-3.5" />
                      <span>Memory</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => startQuizBattle(set)}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 flex items-center gap-1.5 whitespace-nowrap"
                    >
                      <Trophy className="w-3.5 h-3.5" />
                      <span>Quiz Battle</span>
                    </button>
                    <button
                      type="button"
                      disabled={hostBusy}
                      onClick={() => handleHostMultiplayer(set)}
                      className="ml-auto px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-1.5 whitespace-nowrap disabled:opacity-60"
                    >
                      <Users className="w-3.5 h-3.5" />
                      <span>Host Multiplayer Spel</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Spelset verwijderen?"
        description={`Weet je zeker dat je "${deleteTarget?.title}" wilt verwijderen?`}
        busy={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return;
          setDeleting(true);
          try {
            await deleteStudySet(userId, deleteTarget.id);
            setDeleteTarget(null);
          } finally {
            setDeleting(false);
          }
        }}
      />
    </div>
  );
};
