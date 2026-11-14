import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Bomb,
  CheckCircle2,
  Flame,
  Heart,
  Orbit,
  RotateCcw,
  Rocket,
  Timer,
  Trophy,
  XCircle,
  Zap,
} from 'lucide-react';
import { StudySet } from '../../types';
import {
  ConceptItem,
  extractConcepts,
  extractQuestions,
  isCloseAnswer,
  shuffleArray,
  SoloGameMode,
} from '../../lib/gameData';
import { playGameSound } from '../../lib/gameAudio';

interface ArcadeGamesStageProps {
  mode: SoloGameMode;
  studySet: StudySet;
  soundEnabled: boolean;
}

export const ArcadeGamesStage: React.FC<ArcadeGamesStageProps> = ({
  mode,
  studySet,
  soundEnabled,
}) => {
  const concepts = useMemo(() => extractConcepts(studySet), [studySet]);
  const questions = useMemo(() => extractQuestions(studySet), [studySet]);

  if (mode === 'gravity') {
    return <GravityCometsGame concepts={concepts} soundEnabled={soundEnabled} />;
  }
  if (mode === 'speed-match') {
    return <SpeedMatchGame concepts={concepts} soundEnabled={soundEnabled} />;
  }
  if (mode === 'true-false') {
    return <TrueFalseBlitzGame concepts={concepts} soundEnabled={soundEnabled} />;
  }
  if (mode === 'typeracer') {
    return <TyperacerGame concepts={concepts} soundEnabled={soundEnabled} />;
  }
  if (mode === 'bomb') {
    return <TimeBombGame questions={questions} soundEnabled={soundEnabled} />;
  }
  return null;
};

/* ============================================================================
   6. KOMETENREGEN (Quizlet Gravity-stijl vallende kometen)
   ============================================================================ */
interface Comet {
  uid: number;
  concept: ConceptItem;
  xPct: number;
  yPct: number;
  speed: number;
}

const GravityCometsGame: React.FC<{ concepts: ConceptItem[]; soundEnabled: boolean }> = ({
  concepts,
  soundEnabled,
}) => {
  const [comets, setComets] = useState<Comet[]>([]);
  const [lives, setLives] = useState(3);
  const [score, setScore] = useState(0);
  const [cleared, setCleared] = useState(0);
  const [inputVal, setInputVal] = useState('');
  const [gameOver, setGameOver] = useState(false);
  const nextUid = useRef(1);

  const spawnComet = (waveBonus: number): Comet => {
    const c = concepts[Math.floor(Math.random() * concepts.length)];
    return {
      uid: nextUid.current++,
      concept: c,
      xPct: 12 + Math.random() * 64,
      yPct: 4,
      speed: 0.32 + waveBonus * 0.06,
    };
  };

  const reset = () => {
    nextUid.current = 1;
    setLives(3);
    setScore(0);
    setCleared(0);
    setInputVal('');
    setGameOver(false);
    if (concepts.length > 0) {
      setComets([spawnComet(0)]);
    } else {
      setComets([]);
    }
  };

  useEffect(() => {
    reset();
  }, [concepts]);

  useEffect(() => {
    if (gameOver || concepts.length === 0) return;

    const tick = window.setInterval(() => {
      setComets((prev) => {
        let lostLife = 0;
        const moved = prev
          .map((c) => ({ ...c, yPct: c.yPct + c.speed }))
          .filter((c) => {
            if (c.yPct >= 86) {
              lostLife += 1;
              return false;
            }
            return true;
          });

        if (lostLife > 0) {
          playGameSound('wrong', soundEnabled);
          setLives((l) => {
            const nl = Math.max(0, l - lostLife);
            if (nl === 0) setGameOver(true);
            return nl;
          });
        }

        const wave = Math.floor(cleared / 5);
        if (moved.length === 0 || (moved.length < 2 && Math.random() < 0.03)) {
          moved.push(spawnComet(wave));
        }
        return moved;
      });
    }, 60);

    return () => window.clearInterval(tick);
  }, [gameOver, concepts, cleared, soundEnabled]);

  if (concepts.length < 2) {
    return <p className="text-sm text-slate-500">Minimaal 2 begrippen nodig voor Kometenregen.</p>;
  }

  // Lowest comet is active target for quick choice buttons
  const targetComet =
    comets.length > 0
      ? [...comets].sort((a, b) => b.yPct - a.yPct)[0]
      : null;

  const quickOptions = useMemo(() => {
    if (!targetComet) return [];
    const others = shuffleArray(concepts.filter((c) => c.id !== targetComet.concept.id))
      .slice(0, 3)
      .map((c) => c.term);
    return shuffleArray([targetComet.concept.term, ...others]);
  }, [targetComet?.uid, concepts]);

  const destroyComet = (uid: number) => {
    playGameSound('correct', soundEnabled);
    setComets((prev) => prev.filter((c) => c.uid !== uid));
    setCleared((c) => c + 1);
    setScore((s) => s + 100);
    setInputVal('');
  };

  const handleTypedSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputVal.trim() || gameOver) return;
    const hit = comets.find((c) => isCloseAnswer(inputVal, c.concept.term));
    if (hit) {
      destroyComet(hit.uid);
    } else {
      playGameSound('wrong', soundEnabled);
    }
  };

  const handleQuickPick = (term: string) => {
    if (!targetComet || gameOver) return;
    if (term === targetComet.concept.term) {
      destroyComet(targetComet.uid);
    } else {
      playGameSound('wrong', soundEnabled);
      setScore((s) => Math.max(0, s - 25));
    }
  };

  if (gameOver) {
    return (
      <div className="py-10 text-center space-y-4">
        <Orbit className="w-10 h-10 text-indigo-500 mx-auto" />
        <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">
          Kometenregen afgelopen!
        </h3>
        <p className="text-sm font-mono font-bold tabular-nums text-indigo-600 dark:text-indigo-400">
          {cleared} kometen geraakt · Score: {score} punten
        </p>
        <button
          type="button"
          onClick={reset}
          className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium inline-flex items-center gap-2"
        >
          <RotateCcw className="w-4 h-4" />
          <span>Opnieuw verdedigen</span>
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4 text-xs tabular-nums">
        <div className="flex items-center gap-2">
          <Heart className="w-4 h-4 text-red-500" />
          <span className="font-semibold text-slate-700 dark:text-slate-300">
            Schilden: {lives} / 3
          </span>
        </div>
        <span className="text-slate-500 dark:text-slate-400">
          Golf {Math.floor(cleared / 5) + 1} · Kometen geraakt: {cleared}
        </span>
        <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
          {score} ptn
        </span>
      </div>

      {/* Space Stage */}
      <div className="relative h-[300px] w-full rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden select-none">
        {comets.map((c) => {
          const isTarget = targetComet?.uid === c.uid;
          return (
            <div
              key={c.uid}
              style={{
                left: `${c.xPct}%`,
                top: `${c.yPct}%`,
                transform: 'translate(-50%, 0)',
              }}
              className={`absolute max-w-[240px] px-3 py-2 rounded-xl border text-xs leading-snug transition-colors ${
                isTarget
                  ? 'bg-indigo-950/95 border-indigo-400 text-white shadow-lg'
                  : 'bg-slate-800/90 border-slate-700 text-slate-200'
              }`}
            >
              <span className="block font-medium line-clamp-2">{c.concept.definition}</span>
            </div>
          );
        })}

        {/* Planet defense line */}
        <div className="absolute bottom-0 inset-x-0 h-8 bg-gradient-to-t from-emerald-950/90 to-transparent border-t border-emerald-500/30 flex items-center justify-center">
          <span className="text-[11px] font-medium text-emerald-300">
            Verdedigingslijn — kies of typ het juiste begrip!
          </span>
        </div>
      </div>

      {/* Controls: Quick Click OR Fast Typing */}
      {targetComet && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {quickOptions.map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => handleQuickPick(opt)}
              className="py-2.5 px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 hover:border-indigo-500 text-xs font-semibold text-slate-900 dark:text-slate-100 truncate"
            >
              {opt}
            </button>
          ))}
        </div>
      )}

      <form onSubmit={handleTypedSubmit} className="flex gap-2">
        <input
          type="text"
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          placeholder="Of typ het begrip en druk op Enter voor directe laser-hit..."
          className="flex-1 px-4 py-2 rounded-xl bg-white dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-800 text-sm"
        />
        <button
          type="submit"
          className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold"
        >
          Vuur
        </button>
      </form>
    </div>
  );
};

/* ============================================================================
   7. SPEED-MATCH SPRINT (60 Seconden Twee-Kolommen Match)
   ============================================================================ */
const SpeedMatchGame: React.FC<{ concepts: ConceptItem[]; soundEnabled: boolean }> = ({
  concepts,
  soundEnabled,
}) => {
  const [timeLeft, setTimeLeft] = useState(60);
  const [leftList, setLeftList] = useState<ConceptItem[]>([]);
  const [rightList, setRightList] = useState<ConceptItem[]>([]);
  const [selectedLeft, setSelectedLeft] = useState<string | null>(null);
  const [selectedRight, setSelectedRight] = useState<string | null>(null);
  const [combo, setCombo] = useState(0);
  const [score, setScore] = useState(0);
  const [matches, setMatches] = useState(0);

  const loadBoard = () => {
    const slice = shuffleArray(concepts).slice(0, Math.min(5, concepts.length));
    setLeftList(shuffleArray(slice));
    setRightList(shuffleArray(slice));
    setSelectedLeft(null);
    setSelectedRight(null);
  };

  const reset = () => {
    setTimeLeft(60);
    setCombo(0);
    setScore(0);
    setMatches(0);
    loadBoard();
  };

  useEffect(() => {
    reset();
  }, [concepts]);

  useEffect(() => {
    if (timeLeft <= 0) return;
    const id = window.setInterval(() => setTimeLeft((t) => Math.max(0, t - 1)), 1000);
    return () => window.clearInterval(id);
  }, [timeLeft]);

  useEffect(() => {
    if (!selectedLeft || !selectedRight) return;
    if (selectedLeft === selectedRight) {
      const nextCombo = combo + 1;
      setCombo(nextCombo);
      setMatches((m) => m + 1);
      setScore((s) => s + 25 * Math.min(nextCombo, 5));
      playGameSound('correct', soundEnabled);

      const remainingL = leftList.filter((item) => item.id !== selectedLeft);
      const remainingR = rightList.filter((item) => item.id !== selectedRight);
      setSelectedLeft(null);
      setSelectedRight(null);

      if (remainingL.length === 0) {
        loadBoard();
      } else {
        setLeftList(remainingL);
        setRightList(remainingR);
      }
    } else {
      setCombo(0);
      playGameSound('wrong', soundEnabled);
      const t = window.setTimeout(() => {
        setSelectedLeft(null);
        setSelectedRight(null);
      }, 280);
      return () => window.clearTimeout(t);
    }
  }, [selectedLeft, selectedRight]);

  if (concepts.length < 2) {
    return <p className="text-sm text-slate-500">Minimaal 2 begrippen nodig voor Speed-Match.</p>;
  }

  if (timeLeft === 0) {
    return (
      <div className="py-10 text-center space-y-4">
        <Trophy className="w-10 h-10 text-amber-500 mx-auto" />
        <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">
          Tijd om! {matches} koppelingen gemaakt
        </h3>
        <p className="text-lg font-mono font-bold tabular-nums text-indigo-600 dark:text-indigo-400">
          Eindscore: {score} punten
        </p>
        <button
          type="button"
          onClick={reset}
          className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium inline-flex items-center gap-2"
        >
          <RotateCcw className="w-4 h-4" />
          <span>Nieuwe sprint</span>
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-xs tabular-nums">
        <span className="flex items-center gap-1.5 font-mono font-bold text-slate-900 dark:text-slate-100">
          <Timer className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
          {timeLeft}s
        </span>
        <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium">
          <Flame className="w-3.5 h-3.5" />
          Combo {combo}x
        </span>
        <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
          {score} ptn · {matches} paren
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Begrippen</p>
          {leftList.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSelectedLeft(item.id)}
              className={`w-full p-3.5 rounded-xl border text-left text-sm font-semibold transition-colors ${
                selectedLeft === item.id
                  ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-800 dark:text-indigo-200'
                  : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 hover:border-indigo-400'
              }`}
            >
              {item.term}
            </button>
          ))}
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">Definities</p>
          {rightList.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSelectedRight(item.id)}
              className={`w-full p-3.5 rounded-xl border text-left text-xs leading-relaxed transition-colors ${
                selectedRight === item.id
                  ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-800 dark:text-indigo-200'
                  : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 hover:border-indigo-400'
              }`}
            >
              {item.definition}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

/* ============================================================================
   8. WAAR OF NIET WAAR BLITZ (Snel Discrimineren + Pijltoetsen)
   ============================================================================ */
interface TfStatement {
  term: string;
  shownDef: string;
  trueDef: string;
  isTrue: boolean;
}

const TrueFalseBlitzGame: React.FC<{ concepts: ConceptItem[]; soundEnabled: boolean }> = ({
  concepts,
  soundEnabled,
}) => {
  const statements = useMemo<TfStatement[]>(() => {
    if (concepts.length < 2) return [];
    return shuffleArray(concepts).map((c, idx) => {
      const makeTrue = Math.random() >= 0.48;
      if (makeTrue) {
        return { term: c.term, shownDef: c.definition, trueDef: c.definition, isTrue: true };
      }
      const others = concepts.filter((o) => o.id !== c.id);
      const fake = others[idx % others.length];
      return { term: c.term, shownDef: fake.definition, trueDef: c.definition, isTrue: false };
    });
  }, [concepts]);

  const [idx, setIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [feedback, setFeedback] = useState<{ ok: boolean; answerIsTrue: boolean } | null>(null);

  const reset = () => {
    setIdx(0);
    setScore(0);
    setStreak(0);
    setFeedback(null);
  };

  useEffect(() => {
    reset();
  }, [statements]);

  const finished = idx >= statements.length && statements.length > 0;
  const current = statements[idx];

  const decide = (pickedTrue: boolean) => {
    if (!current || feedback !== null || finished) return;
    const ok = pickedTrue === current.isTrue;
    setFeedback({ ok, answerIsTrue: current.isTrue });
    if (ok) {
      const nextStreak = streak + 1;
      setStreak(nextStreak);
      setScore((s) => s + 100 + nextStreak * 15);
      playGameSound('correct', soundEnabled);
    } else {
      setStreak(0);
      playGameSound('wrong', soundEnabled);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (feedback !== null && (e.key === 'Enter' || e.key === ' ')) {
        e.preventDefault();
        setIdx((i) => i + 1);
        setFeedback(null);
        return;
      }
      if (feedback === null) {
        if (e.key === 'ArrowLeft') {
          e.preventDefault();
          decide(false);
        } else if (e.key === 'ArrowRight') {
          e.preventDefault();
          decide(true);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (statements.length === 0) {
    return <p className="text-sm text-slate-500">Minimaal 2 begrippen nodig.</p>;
  }

  if (finished) {
    return (
      <div className="py-10 text-center space-y-4">
        <Zap className="w-10 h-10 text-amber-500 mx-auto" />
        <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">
          Waar / Niet Waar Blitz voltooid!
        </h3>
        <p className="text-lg font-mono font-bold tabular-nums text-indigo-600 dark:text-indigo-400">
          Score: {score} punten
        </p>
        <button
          type="button"
          onClick={reset}
          className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium inline-flex items-center gap-2"
        >
          <RotateCcw className="w-4 h-4" />
          <span>Opnieuw spelen</span>
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto space-y-5">
      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 tabular-nums">
        <span>Stelling {idx + 1} van {statements.length}</span>
        <div className="flex items-center gap-4">
          <span className="text-amber-600 dark:text-amber-400">Streak {streak}x</span>
          <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">{score} ptn</span>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-6 text-center space-y-3">
        <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">{current.term}</h3>
        <p className="text-xs text-slate-400">betekent volgens de stelling:</p>
        <p className="text-base text-slate-700 dark:text-slate-300 leading-relaxed">
          "{current.shownDef}"
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          disabled={feedback !== null}
          onClick={() => decide(false)}
          className="py-3.5 px-4 rounded-xl border border-red-300 dark:border-red-900 bg-red-50/70 dark:bg-red-950/30 text-red-700 dark:text-red-300 font-semibold text-sm hover:bg-red-100 dark:hover:bg-red-950/50 disabled:opacity-50"
        >
          ← Niet waar
        </button>
        <button
          type="button"
          disabled={feedback !== null}
          onClick={() => decide(true)}
          className="py-3.5 px-4 rounded-xl border border-emerald-300 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300 font-semibold text-sm hover:bg-emerald-100 dark:hover:bg-emerald-950/50 disabled:opacity-50"
        >
          Waar →
        </button>
      </div>

      {feedback && (
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B0F17] flex items-center justify-between gap-3">
          <div className="text-xs space-y-0.5">
            <p className="font-bold text-slate-900 dark:text-slate-100">
              {feedback.ok ? 'Goed gezien!' : 'Helaas fout!'} (Het was{' '}
              {feedback.answerIsTrue ? 'WAAR' : 'NIET WAAR'})
            </p>
            {!current.isTrue && (
              <p className="text-slate-600 dark:text-slate-400">
                Juiste betekenis: {current.trueDef}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              setIdx((i) => i + 1);
              setFeedback(null);
            }}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shrink-0"
          >
            Volgende
          </button>
        </div>
      )}
    </div>
  );
};

/* ============================================================================
   9. TYPERACER SPRINT (Live Letter-voor-Letter Race)
   ============================================================================ */
const TyperacerGame: React.FC<{ concepts: ConceptItem[]; soundEnabled: boolean }> = ({
  concepts,
  soundEnabled,
}) => {
  const raceItems = useMemo(() => shuffleArray(concepts).slice(0, 6), [concepts]);
  const [idx, setIdx] = useState(0);
  const [typed, setTyped] = useState('');
  const [elapsed, setElapsed] = useState(0);
  const [finished, setFinished] = useState(false);

  const reset = () => {
    setIdx(0);
    setTyped('');
    setElapsed(0);
    setFinished(false);
  };

  useEffect(() => {
    reset();
  }, [raceItems]);

  useEffect(() => {
    if (finished || raceItems.length === 0) return;
    const id = window.setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => window.clearInterval(id);
  }, [finished, raceItems.length]);

  if (raceItems.length === 0) {
    return <p className="text-sm text-slate-500">Geen begrippen beschikbaar.</p>;
  }

  const current = raceItems[idx];
  const progressPct = finished ? 100 : Math.round((idx / raceItems.length) * 100);

  const handleChange = (val: string) => {
    setTyped(val);
    if (current && val.trim().toLowerCase() === current.term.trim().toLowerCase()) {
      playGameSound('correct', soundEnabled);
      if (idx + 1 >= raceItems.length) {
        setFinished(true);
        playGameSound('win', soundEnabled);
      } else {
        setIdx((i) => i + 1);
        setTyped('');
      }
    }
  };

  if (finished) {
    return (
      <div className="py-10 text-center space-y-4">
        <Rocket className="w-10 h-10 text-indigo-500 mx-auto" />
        <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">
          Finish bereikt in {elapsed} seconden!
        </h3>
        <p className="text-sm text-slate-600 dark:text-slate-400 tabular-nums">
          {raceItems.length} begrippen foutloos overgetypt.
        </p>
        <button
          type="button"
          onClick={reset}
          className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium inline-flex items-center gap-2"
        >
          <RotateCcw className="w-4 h-4" />
          <span>Opnieuw racen</span>
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 tabular-nums">
        <span>Etappe {idx + 1} van {raceItems.length}</span>
        <span className="font-mono font-bold text-slate-900 dark:text-slate-100">{elapsed}s</span>
      </div>

      {/* Race Track */}
      <div className="relative h-10 rounded-full bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-3 flex items-center overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 bg-indigo-500/15 transition-transform duration-300"
          style={{ width: `${progressPct}%` }}
        />
        <div
          className="relative z-10 flex items-center gap-1.5 transition-all duration-300"
          style={{ marginLeft: `${Math.min(progressPct, 88)}%` }}
        >
          <Rocket className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-6 space-y-3">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Omschrijving: {current.definition}
        </p>
        <p className="font-mono text-lg font-bold tracking-wide">
          {current.term.split('').map((ch, i) => {
            const typedChar = typed[i];
            const cls =
              typedChar === undefined
                ? 'text-slate-400 dark:text-slate-500'
                : typedChar.toLowerCase() === ch.toLowerCase()
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-red-600 dark:text-red-400 underline';
            return (
              <span key={i} className={cls}>
                {ch}
              </span>
            );
          })}
        </p>
      </div>

      <input
        type="text"
        value={typed}
        onChange={(e) => handleChange(e.target.value)}
        placeholder="Typ het bovenstaande begrip zo snel mogelijk..."
        autoFocus
        className="w-full px-4 py-3 rounded-xl bg-white dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-700 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />
    </div>
  );
};

/* ============================================================================
   10. BOM ONTMANTELEN (Tikkende Klok + 3 Draden/Levens)
   ============================================================================ */
const TimeBombGame: React.FC<{
  questions: ReturnType<typeof extractQuestions>;
  soundEnabled: boolean;
}> = ({ questions, soundEnabled }) => {
  const [idx, setIdx] = useState(0);
  const [seconds, setSeconds] = useState(25);
  const [wires, setWires] = useState(3);
  const [score, setScore] = useState(0);
  const [status, setStatus] = useState<'playing' | 'defused' | 'exploded'>('playing');

  const reset = () => {
    setIdx(0);
    setSeconds(25);
    setWires(3);
    setScore(0);
    setStatus('playing');
  };

  useEffect(() => {
    reset();
  }, [questions]);

  useEffect(() => {
    if (status !== 'playing') return;
    const id = window.setInterval(() => {
      setSeconds((s) => {
        if (s <= 1) {
          setStatus('exploded');
          playGameSound('wrong', soundEnabled);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [status, soundEnabled]);

  if (questions.length === 0) {
    return <p className="text-sm text-slate-500">Geen vragen beschikbaar in deze set.</p>;
  }

  const totalModules = Math.min(questions.length, 8);
  const current = questions[idx];

  const handleOption = (optIdx: number) => {
    if (status !== 'playing' || !current) return;
    if (optIdx === current.correctIndex) {
      playGameSound('correct', soundEnabled);
      setScore((s) => s + 120);
      setSeconds((s) => s + 4);
      if (idx + 1 >= totalModules) {
        setStatus('defused');
        playGameSound('win', soundEnabled);
      } else {
        setIdx((i) => i + 1);
      }
    } else {
      playGameSound('wrong', soundEnabled);
      setSeconds((s) => Math.max(1, s - 3));
      setWires((w) => {
        const nw = w - 1;
        if (nw <= 0) setStatus('exploded');
        return nw;
      });
    }
  };

  if (status !== 'playing') {
    return (
      <div className="py-10 text-center space-y-4">
        <Bomb
          className={`w-10 h-10 mx-auto ${
            status === 'defused' ? 'text-emerald-500' : 'text-red-500'
          }`}
        />
        <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">
          {status === 'defused'
            ? 'Bom succesvol ontmanteld!'
            : 'BOEM! De timer liep af.'}
        </h3>
        <p className="text-sm font-mono font-bold tabular-nums text-indigo-600 dark:text-indigo-400">
          Modules: {status === 'defused' ? totalModules : idx} / {totalModules} · Score: {score} ptn
        </p>
        <button
          type="button"
          onClick={reset}
          className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium inline-flex items-center gap-2"
        >
          <RotateCcw className="w-4 h-4" />
          <span>Opnieuw proberen</span>
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4 text-xs tabular-nums">
        <span
          className={`font-mono text-base font-bold flex items-center gap-1.5 ${
            seconds <= 8 ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-slate-100'
          }`}
        >
          <Timer className="w-4 h-4" />
          {seconds}s (+4s per goed antwoord)
        </span>
        <span>Draden over: {wires} / 3</span>
        <span>Module {idx + 1} / {totalModules}</span>
      </div>

      <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">{current.question}</h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {current.options.map((opt, oIdx) => (
          <button
            key={oIdx}
            type="button"
            onClick={() => handleOption(oIdx)}
            className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 hover:border-indigo-500 text-left text-sm font-medium transition-colors"
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
};
