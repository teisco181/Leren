import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, CheckCircle2, Compass, Cpu, Fuel, Radio, Rocket, Wrench } from 'lucide-react';
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

const theme = GAME_THEMES.sky;

export const MissionControlGame: React.FC<OriginalGameProps> = ({
  material,
  studySet,
  soundEnabled,
  onSaveProgress,
  onExit,
}) => {
  const source = material ?? studySet;
  const concepts = useMemo(() => getStrictConcepts(source), [source]);
  const questions = useMemo(() => getStrictQuestions(source), [source]);
  const puzzles = useMemo(() => getStrictPuzzles(source), [source]);

  const insufficientReason = useMemo(() => {
    if (material) {
      const check = checkSoloGameSufficiency('mission-control', material);
      if (!check.ok) return check.reason;
    }
    if (concepts.length < 3 && questions.length + puzzles.length < 3) {
      return 'Mission Control vereist minimaal 3 begrippen of vragen/puzzels uit jouw geselecteerde leerstof.';
    }
    return undefined;
  }, [material, concepts.length, questions.length, puzzles.length]);

  const sourceLabel = material
    ? material.fileStatuses.filter((f) => f.readable).map((f) => f.title).join(', ') || material.title
    : studySet?.sourceTitle || studySet?.title || 'Geselecteerde leerstof';

  const [phase, setPhase] = useState<'start' | 'play' | 'result'>('start');
  const [difficulty, setDifficulty] = useState<GameDifficulty>('normal');
  const [stepIdx, setStepIdx] = useState(0);
  const [fuel, setFuel] = useState(100);
  const [score, setScore] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [wrong, setWrong] = useState(0);
  const [log, setLog] = useState<string>('Systeem 1 vereist directe aandacht, Kapitein.');

  // Step type 1: Source-grounded code/keyword lock
  const [codeInput, setCodeInput] = useState('');
  const reactorPuzzle = puzzles[0];
  const reactorConcept = concepts[0];

  // Step type 2: Source question / sequence check
  const navQuestion = questions[1] || questions[0];

  // Step type 3: Signal match (2 or 3 concept pairs)
  const signalPairs = useMemo(() => concepts.slice(0, Math.min(3, concepts.length)), [concepts]);
  const signalRight = useMemo(() => shuffleArray(signalPairs), [signalPairs]);
  const [signalLeft, setSignalLeft] = useState<string | null>(null);
  const [signalDone, setSignalDone] = useState<string[]>([]);

  // Step type 4: Computer concept / puzzle check
  const compPuzzle = puzzles[1];
  const compTarget = concepts[2] || concepts[1] || concepts[0];
  const compOptions = useMemo(() => {
    if (!compTarget) return [];
    const others = shuffleArray(concepts.filter((c) => c.id !== compTarget.id)).slice(0, 3);
    return shuffleArray([compTarget, ...others]);
  }, [concepts, compTarget]);

  // Step type 5: Finale landingsvraag
  const landingQ = questions[0] || (concepts.length >= 2 ? {
    question: `Welk begrip uit jouw bron hoort bij: "${concepts[concepts.length - 1].definition}"?`,
    options: shuffleArray([
      concepts[concepts.length - 1].term,
      ...concepts.slice(0, -1).slice(0, 3).map((x) => x.term),
    ]),
    correctIndex: 0, // resolved below
    explanation: `${concepts[concepts.length - 1].term}: ${concepts[concepts.length - 1].definition}`,
    sourceTitle: concepts[concepts.length - 1].sourceTitle,
    sourceSection: concepts[concepts.length - 1].sourceSection,
  } : null);

  const normalizedLandingQ = useMemo(() => {
    if (!landingQ) return null;
    if (questions[0]) return landingQ;
    const c = concepts[concepts.length - 1];
    return {
      ...landingQ,
      correctIndex: landingQ.options.indexOf(c.term),
    };
  }, [landingQ, questions, concepts]);

  // Build ordered active systems exclusively from available grounded material
  const activeSystems = useMemo(() => {
    const list: Array<'reactor' | 'nav' | 'signal' | 'computer' | 'landing'> = [];
    if (reactorPuzzle || reactorConcept) list.push('reactor');
    if (navQuestion) list.push('nav');
    if (signalPairs.length >= 2) list.push('signal');
    if (compPuzzle || (compTarget && compOptions.length >= 2)) list.push('computer');
    if (normalizedLandingQ) list.push('landing');
    return list;
  }, [reactorPuzzle, reactorConcept, navQuestion, signalPairs.length, compPuzzle, compTarget, compOptions.length, normalizedLandingQ]);

  const startGame = () => {
    if (insufficientReason || activeSystems.length === 0) return;
    setStepIdx(0);
    setFuel(100);
    setScore(0);
    setCorrect(0);
    setWrong(0);
    setCodeInput('');
    setSignalLeft(null);
    setSignalDone([]);
    setLog('Reactor 1 mist energie. Los de opdracht uit jouw leerstof op om door te vliegen!');
    setPhase('play');
  };

  useEffect(() => {
    if (phase === 'result') {
      onSaveProgress?.({
        difficulty,
        score,
        completed: true,
        progress: JSON.stringify({ stepIdx, fuel, correct, wrong, score }),
      });
    }
  }, [phase]);

  const handleSuccess = (msg: string, bonus = 200) => {
    playGameSound('correct', soundEnabled);
    setCorrect((c) => c + 1);
    setScore((s) => s + bonus);
    setLog(msg);

    if (stepIdx + 1 >= activeSystems.length) {
      playGameSound('win', soundEnabled);
      setScore((s) => s + fuel * 3);
      window.setTimeout(() => setPhase('result'), 700);
    } else {
      setStepIdx((st) => st + 1);
    }
  };

  const handleFail = (msg: string) => {
    playGameSound('wrong', soundEnabled);
    setWrong((w) => w + 1);
    const fuelLoss = difficulty === 'hard' ? 25 : 18;
    setLog(msg);
    setFuel((f) => {
      const next = Math.max(0, f - fuelLoss);
      if (next === 0) {
        window.setTimeout(() => setPhase('result'), 500);
      }
      return next;
    });
  };

  if (phase === 'start') {
    return (
      <GameStartScreen
        title="Mission Control – Red de ruimtemissie"
        description="Bestuur het StudyFlow-ruimteschip naar veilige landing! Herstel alle boordsystemen met begrippen, puzzels en vragen die uitsluitend uit jouw gekozen bestanden komen."
        durationLabel="6–8 min · Ruimte-avontuur"
        theme={theme}
        icon={<Rocket className="w-6 h-6" />}
        difficulty={difficulty}
        onChangeDifficulty={setDifficulty}
        sourceLabel={sourceLabel}
        insufficientReason={insufficientReason}
        onStart={startGame}
      />
    );
  }

  if (phase === 'result') {
    const arrived = fuel > 0 && stepIdx + 1 >= activeSystems.length;
    const grade = calculateDutchGrade(correct, wrong, arrived ? fuel / 150 : 0);
    return (
      <GameResultScreen
        title="Mission Control"
        score={score}
        correct={correct}
        wrong={wrong}
        grade={grade}
        evaluation={
          arrived
            ? `Missie geslaagd! Alle ${activeSystems.length} boordsystemen hersteld met ${fuel}% brandstof over.`
            : 'Brandstof opgeraakt in de ruimte. Herstel de systemen en probeer het opnieuw!'
        }
        extraStats={[{ label: 'Brandstof over', value: `${fuel}%` }]}
        sourceSummary={sourceLabel}
        theme={theme}
        onReplay={startGame}
        onExit={onExit}
      />
    );
  }

  const currentSystem = activeSystems[stepIdx];
  const shipPct = Math.min(92, Math.round((stepIdx / Math.max(1, activeSystems.length)) * 90 + 6));

  return (
    <div className="space-y-5">
      <div className="rounded-2xl bg-slate-950 border border-sky-900/60 p-5 text-white space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-4 text-xs tabular-nums">
          <span className="font-semibold text-sky-300 flex items-center gap-1.5">
            <Rocket className="w-4 h-4" />
            Systeem {stepIdx + 1} van {activeSystems.length}
          </span>
          <div className="flex items-center gap-2">
            <Fuel className={`w-4 h-4 ${fuel <= 35 ? 'text-red-400' : 'text-emerald-400'}`} />
            <span>Brandstof: {fuel}%</span>
            <div className="w-24 h-2 rounded-full bg-slate-800 overflow-hidden">
              <div
                className={`h-full transition-all ${fuel <= 35 ? 'bg-red-500' : 'bg-emerald-500'}`}
                style={{ width: `${fuel}%` }}
              />
            </div>
          </div>
          <span className="font-mono font-bold text-sky-300">{score} ptn</span>
        </div>

        <div className="relative h-12 rounded-xl bg-slate-900/90 border border-slate-800 px-4 flex items-center justify-between overflow-hidden">
          <span className="text-[11px] font-semibold text-slate-400 z-10">Startbasis</span>
          <div className="absolute inset-x-14 top-1/2 -translate-y-1/2 border-t border-dashed border-sky-500/40" />
          <div
            className="absolute top-1/2 -translate-y-1/2 transition-all duration-500 z-20"
            style={{ left: `${shipPct}%` }}
          >
            <Rocket className="w-5 h-5 text-sky-400 rotate-45" />
          </div>
          <span className="text-[11px] font-semibold text-emerald-400 z-10">Eindstation</span>
        </div>

        <p className="text-xs text-sky-200/90">{log}</p>
      </div>

      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B0F17] p-6 space-y-4">
        {currentSystem === 'reactor' && (
          reactorPuzzle ? (
            <div className="space-y-4">
              <p className="text-[11px] font-medium text-sky-600 dark:text-sky-400 flex items-center gap-1">
                <BookOpen className="w-3.5 h-3.5" />
                <span>Bron: {reactorPuzzle.sourceTitle} · {reactorPuzzle.sourceSection}</span>
              </p>
              <h3 className="text-base font-bold flex items-center gap-2 text-slate-900 dark:text-slate-100">
                <Wrench className="w-4 h-4 text-sky-500" />
                <span>Reactor-code herstellen</span>
              </h3>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                {reactorPuzzle.prompt}
              </p>
              <p className="text-xs text-slate-500">Hint: {reactorPuzzle.hint}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {reactorPuzzle.options.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => {
                      if (opt === reactorPuzzle.answer) {
                        handleSuccess(`Reactor online! ${reactorPuzzle.explanation}`);
                      } else {
                        handleFail(`Verkeerde spanning! Hint: ${reactorPuzzle.hint}`);
                      }
                    }}
                    className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 hover:border-sky-500 text-left text-sm font-medium"
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>
          ) : reactorConcept && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (
                  isCloseAnswer(codeInput, reactorConcept.term) ||
                  isCloseAnswer(codeInput, reactorConcept.cleanWord)
                ) {
                  handleSuccess(`Reactor online! (${reactorConcept.term}: ${reactorConcept.definition})`);
                } else {
                  handleFail(
                    `Verkeerde invoer! Hint uit ${reactorConcept.sourceTitle}: begint met "${reactorConcept.term.slice(0, 2)}".`
                  );
                }
              }}
              className="space-y-4 max-w-lg"
            >
              <p className="text-[11px] font-medium text-sky-600 dark:text-sky-400">
                Bron: {reactorConcept.sourceTitle} · {reactorConcept.sourceSection}
              </p>
              <h3 className="text-base font-bold flex items-center gap-2 text-slate-900 dark:text-slate-100">
                <Wrench className="w-4 h-4 text-sky-500" />
                <span>Reactor-begrip activeren</span>
              </h3>
              <p className="text-sm text-slate-700 dark:text-slate-300">
                Typ het juiste begrip bij: <strong>{reactorConcept.definition}</strong>
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={codeInput}
                  onChange={(e) => setCodeInput(e.target.value)}
                  placeholder="Typ sleutelbegrip..."
                  className="flex-1 px-4 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm"
                />
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold"
                >
                  Activeer
                </button>
              </div>
            </form>
          )
        )}

        {currentSystem === 'nav' && navQuestion && (
          <div className="space-y-4">
            <p className="text-[11px] font-medium text-sky-600 dark:text-sky-400 flex items-center gap-1">
              <BookOpen className="w-3.5 h-3.5" />
              <span>Bron: {navQuestion.sourceTitle} · {navQuestion.sourceSection}</span>
            </p>
            <h3 className="text-base font-bold flex items-center gap-2 text-slate-900 dark:text-slate-100">
              <Compass className="w-4 h-4 text-sky-500" />
              <span>Navigatie-check</span>
            </h3>
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {navQuestion.question}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {navQuestion.options.map((opt, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    if (idx === navQuestion.correctIndex) {
                      handleSuccess(`Koers vergrendeld! ${navQuestion.explanation}`);
                    } else {
                      handleFail(`Verkeerde koers! Uitleg: ${navQuestion.explanation}`);
                    }
                  }}
                  className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 hover:border-sky-500 text-left text-sm font-medium"
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        )}

        {currentSystem === 'signal' && (
          <div className="space-y-4">
            <h3 className="text-base font-bold flex items-center gap-2 text-slate-900 dark:text-slate-100">
              <Radio className="w-4 h-4 text-sky-500" />
              <span>Antenne Signaal Koppelen ({signalDone.length}/{signalPairs.length})</span>
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                {signalPairs.map((sp) => {
                  const done = signalDone.includes(sp.id);
                  return (
                    <button
                      key={sp.id}
                      type="button"
                      disabled={done}
                      onClick={() => setSignalLeft(sp.id)}
                      className={`w-full p-3 rounded-xl border text-left text-xs font-bold ${
                        done
                          ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-400 opacity-60'
                          : signalLeft === sp.id
                            ? 'bg-sky-50 dark:bg-sky-950/40 border-sky-500'
                            : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                      }`}
                    >
                      {sp.term}
                      <span className="block text-[10px] font-normal text-slate-400 mt-0.5">
                        {sp.sourceTitle}
                      </span>
                    </button>
                  );
                })}
              </div>
              <div className="space-y-2">
                {signalRight.map((sp) => {
                  const done = signalDone.includes(sp.id);
                  return (
                    <button
                      key={sp.id}
                      type="button"
                      disabled={done || !signalLeft}
                      onClick={() => {
                        if (signalLeft === sp.id) {
                          const next = [...signalDone, sp.id];
                          setSignalDone(next);
                          setSignalLeft(null);
                          playGameSound('correct', soundEnabled);
                          if (next.length === signalPairs.length) {
                            handleSuccess('Signaal volledig hersteld!');
                          }
                        } else {
                          setSignalLeft(null);
                          handleFail('Signaalstoring! Die koppeling klopt niet met je bron.');
                        }
                      }}
                      className={`w-full p-3 rounded-xl border text-left text-xs ${
                        done
                          ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-400 opacity-60'
                          : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-sky-500'
                      }`}
                    >
                      {sp.definition}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {currentSystem === 'computer' && (
          compPuzzle ? (
            <div className="space-y-4">
              <p className="text-[11px] font-medium text-sky-600 dark:text-sky-400">
                Bron: {compPuzzle.sourceTitle} · {compPuzzle.sourceSection}
              </p>
              <h3 className="text-base font-bold flex items-center gap-2 text-slate-900 dark:text-slate-100">
                <Cpu className="w-4 h-4 text-sky-500" />
                <span>Boordcomputer Deductie</span>
              </h3>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                {compPuzzle.prompt}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {compPuzzle.options.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => {
                      if (opt === compPuzzle.answer) {
                        handleSuccess(`Boordcomputer hersteld! ${compPuzzle.explanation}`);
                      } else {
                        handleFail(`Fout geheugenblok! Hint: ${compPuzzle.hint}`);
                      }
                    }}
                    className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 hover:border-sky-500 text-left text-sm font-semibold"
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>
          ) : compTarget && (
            <div className="space-y-4">
              <p className="text-[11px] font-medium text-sky-600 dark:text-sky-400">
                Bron: {compTarget.sourceTitle} · {compTarget.sourceSection}
              </p>
              <h3 className="text-base font-bold flex items-center gap-2 text-slate-900 dark:text-slate-100">
                <Cpu className="w-4 h-4 text-sky-500" />
                <span>Boordcomputer Geheugen Herstellen</span>
              </h3>
              <p className="text-sm text-slate-700 dark:text-slate-300">
                Welk begrip hoort bij: <strong>"{compTarget.definition}"</strong>?
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {compOptions.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      if (opt.id === compTarget.id) {
                        handleSuccess(`Boordcomputer hersteld! (${compTarget.term})`);
                      } else {
                        handleFail('Fout geheugenblok geselecteerd!');
                      }
                    }}
                    className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 hover:border-sky-500 text-left text-sm font-semibold"
                  >
                    {opt.term}
                  </button>
                ))}
              </div>
            </div>
          )
        )}

        {currentSystem === 'landing' && normalizedLandingQ && (
          <div className="space-y-4">
            <p className="text-[11px] font-medium text-sky-600 dark:text-sky-400">
              Bron: {normalizedLandingQ.sourceTitle} · {normalizedLandingQ.sourceSection}
            </p>
            <h3 className="text-base font-bold flex items-center gap-2 text-slate-900 dark:text-slate-100">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              <span>Finale Landingsroute Kiezen</span>
            </h3>
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {normalizedLandingQ.question}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {normalizedLandingQ.options.map((opt, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    if (idx === normalizedLandingQ.correctIndex) {
                      handleSuccess(`Touchdown geslaagd! ${normalizedLandingQ.explanation}`);
                    } else {
                      handleFail(`Verkeerde landingsbaan! ${normalizedLandingQ.explanation}`);
                    }
                  }}
                  className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 hover:border-sky-500 text-left text-sm font-medium"
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
