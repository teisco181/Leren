import React, { useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  CheckCircle2,
  DoorOpen,
  KeyRound,
  Lock,
  PlugZap,
  Sparkles,
} from 'lucide-react';
import { isCloseAnswer, shuffleArray } from '../../../lib/gameData';
import {
  checkSoloGameSufficiency,
  getStrictConcepts,
  getStrictPuzzles,
  getStrictQuestions,
} from '../../../lib/newGamesData';
import { playGameSound } from '../../../lib/gameAudio';
import {
  calculateDutchGrade,
  GAME_THEMES,
  GameDifficulty,
  GameResultScreen,
  GameStartScreen,
} from '../GameShell';
import type { OriginalGameProps } from './OriginalGamesStage';

const theme = GAME_THEMES.violet;

interface StationDef {
  id: number;
  kind: 'puzzle0' | 'book' | 'wire' | 'puzzle1' | 'door';
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

export const EscapeClassroomGame: React.FC<OriginalGameProps> = ({
  material,
  studySet,
  soundEnabled,
  initialProgress,
  onSaveProgress,
  onExit,
}) => {
  const source = material ?? studySet;
  const concepts = useMemo(() => getStrictConcepts(source), [source]);
  const questions = useMemo(() => getStrictQuestions(source), [source]);
  const puzzles = useMemo(() => getStrictPuzzles(source), [source]);

  const insufficientReason = useMemo(() => {
    if (material) {
      const check = checkSoloGameSufficiency('escape-classroom', material);
      if (!check.ok) return check.reason;
    }
    if (concepts.length < 3 && questions.length + puzzles.length < 3) {
      return 'Escape the Classroom vereist minimaal 3 begrippen of vragen/puzzels uit jouw geselecteerde leerstof.';
    }
    return undefined;
  }, [material, concepts.length, questions.length, puzzles.length]);

  const sourceLabel = material
    ? material.fileStatuses.filter((f) => f.readable).map((f) => f.title).join(', ') || material.title
    : studySet?.sourceTitle || studySet?.title || 'Geselecteerde leerstof';

  const parsedProgress = useMemo(() => {
    if (!initialProgress) return null;
    try {
      return JSON.parse(initialProgress) as {
        solvedSteps?: number[];
        wrongCount?: number;
        score?: number;
      };
    } catch {
      return null;
    }
  }, [initialProgress]);

  const [phase, setPhase] = useState<'start' | 'play' | 'result'>('start');
  const [difficulty, setDifficulty] = useState<GameDifficulty>('normal');
  const [solvedSteps, setSolvedSteps] = useState<number[]>(parsedProgress?.solvedSteps || []);
  const [activeStation, setActiveStation] = useState<number>(1);
  const [wrongCount, setWrongCount] = useState(parsedProgress?.wrongCount || 0);
  const [score, setScore] = useState(parsedProgress?.score || 0);
  const [feedback, setFeedback] = useState<string | null>(null);

  // Station contents strictly built from selected material (no general math or external sequences!)
  const puzzle0 = puzzles[0];
  const groundedPuzzle1 = puzzles[1];
  const fallbackQuestion1 = !groundedPuzzle1 ? questions[1] : undefined;

  // Typ-woord slot if no grounded puzzle[0]
  const codeConcept = concepts[concepts.length - 1] || concepts[0];
  const [codeInput, setCodeInput] = useState('');

  // Bookshelf word lock
  const wordTarget = concepts[0];
  const wordOptions = useMemo(() => {
    if (!wordTarget) return [];
    const others = shuffleArray(concepts.filter((c) => c.id !== wordTarget.id)).slice(0, 3);
    return shuffleArray([wordTarget, ...others]);
  }, [concepts, wordTarget]);

  // Wire Connect (2 or 3 concept pairs)
  const wirePairs = useMemo(() => concepts.slice(0, Math.min(3, concepts.length)), [concepts]);
  const wireRight = useMemo(() => shuffleArray(wirePairs), [wirePairs]);
  const [wireLeftPick, setWireLeftPick] = useState<string | null>(null);
  const [wiredIds, setWiredIds] = useState<string[]>([]);

  // Final Door Question (from grounded questions or constructed from concept)
  const doorQuestion = useMemo(() => {
    if (questions[0]) return questions[0];
    if (concepts.length >= 2) {
      const c = concepts[0];
      const distractors = shuffleArray(concepts.filter((x) => x.id !== c.id)).slice(0, 3).map((x) => x.term);
      const opts = shuffleArray([c.term, ...distractors]);
      return {
        question: `Welk begrip hoort bij: "${c.definition}"?`,
        options: opts,
        correctIndex: opts.indexOf(c.term),
        explanation: `${c.term}: ${c.definition}`,
        difficulty: 'normal' as const,
        sourceTitle: c.sourceTitle,
        sourceSection: c.sourceSection,
      };
    }
    return null;
  }, [questions, concepts]);

  // Dynamic active stations list — skip any step that has no grounded content
  const stations = useMemo<StationDef[]>(() => {
    const list: StationDef[] = [];
    if (puzzle0 || codeConcept) {
      list.push({ id: 1, kind: 'puzzle0', label: `${list.length + 1}. Broncode-slot`, icon: Lock });
    }
    if (wordTarget && wordOptions.length >= 2) {
      list.push({ id: 2, kind: 'book', label: `${list.length + 1}. Boekenkast`, icon: BookOpen });
    }
    if (wirePairs.length >= 2) {
      list.push({ id: 3, kind: 'wire', label: `${list.length + 1}. Schakelbord`, icon: PlugZap });
    }
    if (groundedPuzzle1 || fallbackQuestion1) {
      list.push({ id: 4, kind: 'puzzle1', label: `${list.length + 1}. Prikbord`, icon: Sparkles });
    }
    if (doorQuestion) {
      list.push({ id: 5, kind: 'door', label: `${list.length + 1}. Klasdeur`, icon: DoorOpen });
    }
    return list;
  }, [puzzle0, codeConcept, wordTarget, wordOptions.length, wirePairs.length, groundedPuzzle1, fallbackQuestion1, doorQuestion]);

  const startGame = (resume = false) => {
    if (insufficientReason || stations.length === 0) return;
    if (!resume) {
      setSolvedSteps([]);
      setWrongCount(0);
      setScore(0);
      setActiveStation(stations[0].id);
    } else {
      const nextOpen = stations.find((st) => !solvedSteps.includes(st.id));
      setActiveStation(nextOpen ? nextOpen.id : stations[0].id);
    }
    setFeedback(null);
    setCodeInput('');
    setWireLeftPick(null);
    setWiredIds([]);
    setPhase('play');
  };

  const persist = (nextSolved: number[], nextWrong: number, nextScore: number, done: boolean) => {
    onSaveProgress?.({
      difficulty,
      score: nextScore,
      completed: done,
      progress: JSON.stringify({ solvedSteps: nextSolved, wrongCount: nextWrong, score: nextScore }),
    });
  };

  const completeStep = (stepId: number, msg: string) => {
    playGameSound('correct', soundEnabled);
    setFeedback(msg);
    const nextScore = score + 200;
    setScore(nextScore);
    setSolvedSteps((prev) => {
      const next = prev.includes(stepId) ? prev : [...prev, stepId];
      const allDone = stations.every((s) => next.includes(s.id));
      persist(next, wrongCount, nextScore, allDone);
      if (allDone) {
        playGameSound('win', soundEnabled);
        window.setTimeout(() => setPhase('result'), 800);
      } else {
        const nextOpen = stations.find((s) => !next.includes(s.id));
        if (nextOpen) setActiveStation(nextOpen.id);
      }
      return next;
    });
  };

  const registerError = (msg: string) => {
    playGameSound('wrong', soundEnabled);
    const nextWrong = wrongCount + 1;
    setWrongCount(nextWrong);
    setFeedback(msg);
    persist(solvedSteps, nextWrong, score, false);
  };

  useEffect(() => {
    if (phase === 'result') {
      persist(solvedSteps, wrongCount, score, true);
    }
  }, [phase]);

  if (phase === 'start') {
    return (
      <GameStartScreen
        title="Escape the Classroom – Ontsnap uit het lokaal"
        description="De klasdeur zit op slot! Onderzoek de klikbare voorwerpen in het lokaal en los puzzels op die volledig afkomstig zijn uit jouw geselecteerde leerstof."
        durationLabel="6–10 min · Mini-Escape Room"
        theme={theme}
        icon={<DoorOpen className="w-6 h-6" />}
        difficulty={difficulty}
        onChangeDifficulty={setDifficulty}
        sourceLabel={sourceLabel}
        insufficientReason={insufficientReason}
        onStart={() => startGame(Boolean(parsedProgress && (parsedProgress.solvedSteps?.length || 0) > 0))}
      />
    );
  }

  if (phase === 'result') {
    const grade = calculateDutchGrade(stations.length, wrongCount, 0.4);
    return (
      <GameResultScreen
        title="Escape the Classroom"
        score={score}
        correct={stations.length}
        wrong={wrongCount}
        grade={grade}
        evaluation={
          wrongCount <= 2
            ? `Ontsnapt als een meesterbrein! Alle ${stations.length} puzzels uit jouw leerstof gekraakt.`
            : `Je bent ontsnapt uit het klaslokaal na alle ${stations.length} leerstofpuzzels!`
        }
        sourceSummary={sourceLabel}
        theme={theme}
        onReplay={() => startGame(false)}
        onExit={onExit}
      />
    );
  }

  const nonDoorIds = stations.filter((s) => s.id !== 5).map((s) => s.id);
  const doorLocked = nonDoorIds.some((id) => !solvedSteps.includes(id));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs tabular-nums">
        <span className="font-semibold text-violet-600 dark:text-violet-400">
          Opgelost: {solvedSteps.length} / {stations.length} puzzels
        </span>
        <span className="text-slate-500 dark:text-slate-400">Fouten: {wrongCount}</span>
        <span className="font-mono font-bold text-violet-600 dark:text-violet-400">
          {score} ptn
        </span>
      </div>

      <div className="rounded-2xl border border-violet-200 dark:border-violet-900 bg-slate-100 dark:bg-slate-900 p-4 sm:p-5 space-y-4">
        <p className="text-xs font-medium text-slate-600 dark:text-slate-400">
          Klik op een object in het klaslokaal om de brongestuurde puzzel te openen:
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
          {stations.map((st) => {
            const Icon = st.icon;
            const isSolved = solvedSteps.includes(st.id);
            const isActive = activeStation === st.id;
            const isLockedDoor = st.id === 5 && doorLocked;
            return (
              <button
                key={st.id}
                type="button"
                disabled={isLockedDoor}
                onClick={() => {
                  setFeedback(null);
                  setActiveStation(st.id);
                }}
                className={`p-3 rounded-xl border text-left transition-all flex flex-col gap-2 ${
                  isSolved
                    ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-400 text-emerald-800 dark:text-emerald-300'
                    : isActive
                      ? 'bg-violet-600 border-violet-600 text-white shadow-sm'
                      : isLockedDoor
                        ? 'bg-slate-200/70 dark:bg-slate-800/50 border-slate-300 dark:border-slate-700 text-slate-400 opacity-65'
                        : 'bg-white dark:bg-[#111827] border-slate-200 dark:border-slate-800 hover:border-violet-400'
                }`}
              >
                <div className="flex items-center justify-between">
                  <Icon className="w-5 h-5" />
                  {isSolved && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                </div>
                <span className="text-xs font-bold">{st.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {feedback && (
        <div className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-800 dark:text-slate-200">
          {feedback}
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B0F17] p-6 space-y-4">
        {solvedSteps.includes(activeStation) ? (
          <div className="py-6 text-center space-y-2">
            <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto" />
            <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Deze puzzel is al gekraakt! Klik op een volgend object hierboven.
            </p>
          </div>
        ) : activeStation === 1 ? (
          puzzle0 ? (
            <div className="space-y-4">
              <div className="space-y-1">
                <p className="text-[11px] font-medium text-violet-600 dark:text-violet-400">
                  Bron: {puzzle0.sourceTitle} · {puzzle0.sourceSection}
                </p>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-violet-500" />
                  <span>Kraak het broncode-slot</span>
                </h3>
              </div>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                {puzzle0.prompt}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Hint uit brontekst: {puzzle0.hint}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {puzzle0.options.map((opt, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      if (opt === puzzle0.answer) {
                        completeStep(1, `Slot gekraakt! ${puzzle0.explanation}`);
                      } else {
                        registerError(`Niet juist. Hint: ${puzzle0.hint}`);
                      }
                    }}
                    className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 hover:border-violet-500 text-left text-sm font-medium"
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            codeConcept && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (
                    isCloseAnswer(codeInput, codeConcept.term) ||
                    isCloseAnswer(codeInput, codeConcept.cleanWord)
                  ) {
                    completeStep(
                      1,
                      `Klik! Het kluisslot schiet open. (${codeConcept.sourceTitle} · ${codeConcept.sourceSection})`
                    );
                  } else {
                    registerError(
                      `Niet het juiste sleutelwoord. Hint uit "${codeConcept.sourceTitle}": begint met "${codeConcept.term.slice(0, 2)}".`
                    );
                  }
                }}
                className="space-y-4 max-w-lg"
              >
                <p className="text-[11px] font-medium text-violet-600 dark:text-violet-400">
                  Bron: {codeConcept.sourceTitle} · {codeConcept.sourceSection}
                </p>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-violet-500" />
                  <span>Typ het sleutelbegrip uit de leerstof</span>
                </h3>
                <p className="text-sm text-slate-700 dark:text-slate-300">
                  Omschrijving: <strong>{codeConcept.definition}</strong>
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={codeInput}
                    onChange={(e) => setCodeInput(e.target.value)}
                    placeholder="Typ het juiste begrip..."
                    className="flex-1 px-4 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm"
                  />
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold"
                  >
                    Open slot
                  </button>
                </div>
              </form>
            )
          )
        ) : activeStation === 2 && wordTarget ? (
          <div className="space-y-4">
            <p className="text-[11px] font-medium text-violet-600 dark:text-violet-400">
              Bron: {wordTarget.sourceTitle} · {wordTarget.sourceSection}
            </p>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Open de boekenkast met het juiste begrip
            </h3>
            <p className="text-sm text-slate-700 dark:text-slate-300">
              Aanwijzing in de brontekst: <strong>"{wordTarget.definition}"</strong>
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {wordOptions.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    if (opt.id === wordTarget.id) {
                      completeStep(
                        2,
                        `De boekenkast schuift opzij! (${wordTarget.term} · Bron: ${wordTarget.sourceTitle})`
                      );
                    } else {
                      registerError('Verkeerd boek gekozen! Lees de uitleg uit je bron nog eens.');
                    }
                  }}
                  className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 hover:border-violet-500 text-left text-sm font-semibold"
                >
                  {opt.term}
                </button>
              ))}
            </div>
          </div>
        ) : activeStation === 3 ? (
          <div className="space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Verbind alle {wirePairs.length} draden op het schakelbord ({wiredIds.length}/{wirePairs.length})
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                {wirePairs.map((wp) => {
                  const done = wiredIds.includes(wp.id);
                  return (
                    <button
                      key={wp.id}
                      type="button"
                      disabled={done}
                      onClick={() => setWireLeftPick(wp.id)}
                      className={`w-full p-3 rounded-xl border text-left text-xs font-bold ${
                        done
                          ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-400 opacity-60'
                          : wireLeftPick === wp.id
                            ? 'bg-violet-50 dark:bg-violet-950/40 border-violet-500'
                            : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                      }`}
                    >
                      {wp.term}
                      <span className="block text-[10px] font-normal text-slate-400 mt-0.5">
                        {wp.sourceTitle}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="space-y-2">
                {wireRight.map((wp) => {
                  const done = wiredIds.includes(wp.id);
                  return (
                    <button
                      key={wp.id}
                      type="button"
                      disabled={done || !wireLeftPick}
                      onClick={() => {
                        if (wireLeftPick === wp.id) {
                          const next = [...wiredIds, wp.id];
                          setWiredIds(next);
                          setWireLeftPick(null);
                          playGameSound('correct', soundEnabled);
                          if (next.length === wirePairs.length) {
                            completeStep(3, 'Stroom hersteld op het schakelbord!');
                          }
                        } else {
                          setWireLeftPick(null);
                          registerError('Kortsluiting! Dat begrip hoort niet bij deze uitleg.');
                        }
                      }}
                      className={`w-full p-3 rounded-xl border text-left text-xs ${
                        done
                          ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-400 opacity-60'
                          : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-violet-500'
                      }`}
                    >
                      {wp.definition}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        ) : activeStation === 4 && (groundedPuzzle1 || fallbackQuestion1) ? (
          <div className="space-y-4">
            <p className="text-[11px] font-medium text-violet-600 dark:text-violet-400">
              Bron: {(groundedPuzzle1 || fallbackQuestion1)!.sourceTitle} ·{' '}
              {(groundedPuzzle1 || fallbackQuestion1)!.sourceSection}
            </p>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Aanwijzing op het prikbord
            </h3>
            {groundedPuzzle1 ? (
              <>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  {groundedPuzzle1.prompt}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {groundedPuzzle1.options.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => {
                        if (opt === groundedPuzzle1.answer) {
                          completeStep(4, `Prikbord opgelost! ${groundedPuzzle1.explanation}`);
                        } else {
                          registerError(`Niet juist. Hint: ${groundedPuzzle1.hint}`);
                        }
                      }}
                      className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 hover:border-violet-500 text-left text-xs font-semibold"
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </>
            ) : fallbackQuestion1 ? (
              <>
                <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                  {fallbackQuestion1.question}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {fallbackQuestion1.options.map((opt, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => {
                        if (idx === fallbackQuestion1.correctIndex) {
                          completeStep(4, `Prikbord opgelost! ${fallbackQuestion1.explanation}`);
                        } else {
                          registerError(`Helaas! Uitleg uit je bron: ${fallbackQuestion1.explanation}`);
                        }
                      }}
                      className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 hover:border-violet-500 text-left text-xs font-semibold"
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </>
            ) : null}
          </div>
        ) : (
          doorQuestion && (
            <div className="space-y-4">
              <p className="text-[11px] font-medium text-violet-600 dark:text-violet-400">
                Bron: {doorQuestion.sourceTitle} · {doorQuestion.sourceSection}
              </p>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                De Finale Deurvraag
              </h3>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                {doorQuestion.question}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {doorQuestion.options.map((opt, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      if (idx === doorQuestion.correctIndex) {
                        completeStep(5, `De deur zwaait open! ${doorQuestion.explanation}`);
                      } else {
                        registerError(`De deur blijft dicht. Uitleg uit je bron: ${doorQuestion.explanation}`);
                      }
                    }}
                    className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 hover:border-violet-500 text-left text-sm font-medium"
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>
          )
        )}
      </div>
    </div>
  );
};
