import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Award,
  CheckCircle2,
  Coins,
  Crown,
  Flame,
  Grid3X3,
  Heart,
  RotateCcw,
  Shield,
  Sparkles,
  Swords,
  Trophy,
  XCircle,
} from 'lucide-react';
import { StudySet } from '../../types';
import {
  ConceptItem,
  extractConcepts,
  extractQuestions,
  shuffleArray,
  SoloGameMode,
} from '../../lib/gameData';
import { playGameSound } from '../../lib/gameAudio';

interface StrategyGamesStageProps {
  mode: SoloGameMode;
  studySet: StudySet;
  soundEnabled: boolean;
}

export const StrategyGamesStage: React.FC<StrategyGamesStageProps> = ({
  mode,
  studySet,
  soundEnabled,
}) => {
  const concepts = useMemo(() => extractConcepts(studySet), [studySet]);
  const questions = useMemo(() => extractQuestions(studySet), [studySet]);

  if (mode === 'jeopardy') {
    return <JeopardyGame questions={questions} soundEnabled={soundEnabled} />;
  }
  if (mode === 'bingo') {
    return <StudyBingoGame concepts={concepts} soundEnabled={soundEnabled} />;
  }
  if (mode === 'boss-battle') {
    return <BossBattleGame questions={questions} soundEnabled={soundEnabled} />;
  }
  if (mode === 'gold-mine') {
    return <GoldMineGame questions={questions} soundEnabled={soundEnabled} />;
  }
  if (mode === 'odd-one-out') {
    return <OddOneOutGame concepts={concepts} soundEnabled={soundEnabled} />;
  }
  return null;
};

/* ============================================================================
   16. JEOPARDY BORD (3x3 Vakjes + Dagelijkse Dubbel)
   ============================================================================ */
interface JeopardyTile {
  id: number;
  points: number;
  isDouble: boolean;
  question: ReturnType<typeof extractQuestions>[number];
}

const JeopardyGame: React.FC<{
  questions: ReturnType<typeof extractQuestions>;
  soundEnabled: boolean;
}> = ({ questions, soundEnabled }) => {
  const [tiles, setTiles] = useState<JeopardyTile[]>([]);
  const [doneIds, setDoneIds] = useState<number[]>([]);
  const [activeTile, setActiveTile] = useState<JeopardyTile | null>(null);
  const [chosenOpt, setChosenOpt] = useState<number | null>(null);
  const [score, setScore] = useState(0);

  const reset = () => {
    const picked = shuffleArray(questions).slice(0, Math.min(9, questions.length));
    const doubleIdx = Math.floor(Math.random() * picked.length);
    const pointValues = [100, 100, 100, 200, 200, 200, 300, 300, 300];
    setTiles(
      picked.map((q, idx) => ({
        id: idx,
        points: pointValues[idx] || 200,
        isDouble: idx === doubleIdx,
        question: q,
      }))
    );
    setDoneIds([]);
    setActiveTile(null);
    setChosenOpt(null);
    setScore(0);
  };

  useEffect(() => {
    reset();
  }, [questions]);

  if (tiles.length === 0) {
    return <p className="text-sm text-slate-500">Geen vragen beschikbaar voor Jeopardy.</p>;
  }

  const allDone = doneIds.length === tiles.length;

  const answerTile = (optIdx: number) => {
    if (!activeTile || chosenOpt !== null) return;
    setChosenOpt(optIdx);
    const ok = optIdx === activeTile.question.correctIndex;
    const delta = activeTile.points * (activeTile.isDouble ? 2 : 1);
    if (ok) {
      setScore((s) => s + delta);
      playGameSound('correct', soundEnabled);
    } else {
      playGameSound('wrong', soundEnabled);
    }
    setDoneIds((prev) => [...prev, activeTile.id]);
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between text-xs tabular-nums">
        <span className="text-slate-500 dark:text-slate-400">
          Vakjes gespeeld: {doneIds.length} / {tiles.length}
        </span>
        <span className="font-mono text-sm font-bold text-indigo-600 dark:text-indigo-400">
          Score: {score} punten
        </span>
      </div>

      {allDone && !activeTile ? (
        <div className="py-10 text-center space-y-4">
          <Crown className="w-10 h-10 text-amber-500 mx-auto" />
          <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            Jeopardy Bord leeggespeeld!
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
            <span>Nieuw bord</span>
          </button>
        </div>
      ) : activeTile ? (
        <div className="max-w-2xl mx-auto p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 space-y-4">
          <div className="flex items-center justify-between text-xs font-semibold">
            <span className="text-indigo-600 dark:text-indigo-400">
              {activeTile.isDouble
                ? `DAGELIJKSE DUBBEL · ${activeTile.points * 2} ptn`
                : `Vraag voor ${activeTile.points} punten`}
            </span>
          </div>
          <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
            {activeTile.question.question}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {activeTile.question.options.map((opt, idx) => {
              const isRight = idx === activeTile.question.correctIndex;
              const isPicked = chosenOpt === idx;
              const reveal = chosenOpt !== null;
              return (
                <button
                  key={idx}
                  type="button"
                  disabled={reveal}
                  onClick={() => answerTile(idx)}
                  className={`p-3.5 rounded-xl border text-left text-sm font-medium flex items-start justify-between gap-2 ${
                    !reveal
                      ? 'bg-white dark:bg-[#111827] border-slate-200 dark:border-slate-800 hover:border-indigo-500'
                      : isRight
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500 text-emerald-900 dark:text-emerald-200'
                        : isPicked
                          ? 'bg-red-50 dark:bg-red-950/40 border-red-500 text-red-900 dark:text-red-200'
                          : 'bg-white/40 dark:bg-[#111827]/40 border-slate-200 dark:border-slate-800 text-slate-400'
                  }`}
                >
                  <span>{opt}</span>
                  {reveal && isRight && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
                  {reveal && isPicked && !isRight && <XCircle className="w-4 h-4 text-red-600 shrink-0" />}
                </button>
              );
            })}
          </div>
          {chosenOpt !== null && (
            <div className="flex items-center justify-between gap-3 pt-2">
              <p className="text-xs text-slate-600 dark:text-slate-400">
                {activeTile.question.explanation}
              </p>
              <button
                type="button"
                onClick={() => {
                  setActiveTile(null);
                  setChosenOpt(null);
                }}
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shrink-0"
              >
                Terug naar bord
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-3 max-w-xl mx-auto">
          {tiles.map((t) => {
            const done = doneIds.includes(t.id);
            return (
              <button
                key={t.id}
                type="button"
                disabled={done}
                onClick={() => {
                  playGameSound('click', soundEnabled);
                  setActiveTile(t);
                }}
                className={`h-24 rounded-2xl border font-mono font-bold text-xl tabular-nums transition-all ${
                  done
                    ? 'bg-slate-100 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800 text-slate-400 opacity-50'
                    : 'bg-indigo-600 hover:bg-indigo-700 border-indigo-500 text-white shadow-sm'
                }`}
              >
                {done ? '✓' : t.points}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

/* ============================================================================
   17. STUDIE BINGO (3x3 Kaart met Rij/Kolom/Diagonaal Detectie)
   ============================================================================ */
const BINGO_LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

const StudyBingoGame: React.FC<{ concepts: ConceptItem[]; soundEnabled: boolean }> = ({
  concepts,
  soundEnabled,
}) => {
  const [board, setBoard] = useState<ConceptItem[]>([]);
  const [callOrder, setCallOrder] = useState<ConceptItem[]>([]);
  const [callIdx, setCallIdx] = useState(0);
  const [markedIndices, setMarkedIndices] = useState<number[]>([]);
  const [bingoCount, setBingoCount] = useState(0);
  const [mistakes, setMistakes] = useState(0);

  const reset = () => {
    // Repeat up to 9 if fewer than 9 unique concepts exist
    let pool = shuffleArray(concepts);
    if (pool.length === 0) return;
    while (pool.length < 9) {
      pool = [...pool, ...shuffleArray(concepts)];
    }
    const nine = pool.slice(0, 9);
    setBoard(nine);
    setCallOrder(shuffleArray(nine));
    setCallIdx(0);
    setMarkedIndices([]);
    setBingoCount(0);
    setMistakes(0);
  };

  useEffect(() => {
    reset();
  }, [concepts]);

  if (concepts.length < 3) {
    return <p className="text-sm text-slate-500">Minimaal 3 begrippen nodig voor Studie Bingo.</p>;
  }

  const currentCall = callOrder[callIdx];
  const allMarked = markedIndices.length === 9 && board.length === 9;

  const pickCell = (cellIdx: number) => {
    if (!currentCall || markedIndices.includes(cellIdx) || allMarked) return;
    const cellConcept = board[cellIdx];
    if (cellConcept.id === currentCall.id) {
      const nextMarked = [...markedIndices, cellIdx];
      setMarkedIndices(nextMarked);
      const completedLines = BINGO_LINES.filter((line) =>
        line.every((i) => nextMarked.includes(i))
      ).length;

      if (completedLines > bingoCount) {
        setBingoCount(completedLines);
        playGameSound('win', soundEnabled);
      } else {
        playGameSound('correct', soundEnabled);
      }
      setCallIdx((i) => i + 1);
    } else {
      setMistakes((m) => m + 1);
      playGameSound('wrong', soundEnabled);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="flex items-center justify-between text-xs tabular-nums">
        <span className="flex items-center gap-1.5 font-semibold text-indigo-600 dark:text-indigo-400">
          <Grid3X3 className="w-4 h-4" />
          Bingo-rijen: {bingoCount}
        </span>
        <span className="text-slate-500 dark:text-slate-400">
          Afgevinkt: {markedIndices.length} / 9 · Fouten: {mistakes}
        </span>
      </div>

      {allMarked ? (
        <div className="py-10 text-center space-y-4">
          <Trophy className="w-10 h-10 text-amber-500 mx-auto" />
          <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            VOLLE KAART! ({bingoCount} Bingo-rijen gehaald)
          </h3>
          <button
            type="button"
            onClick={reset}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium inline-flex items-center gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Nieuwe Bingokaart</span>
          </button>
        </div>
      ) : (
        <>
          {currentCall && (
            <div className="p-4 rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 text-center space-y-1">
              <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400">
                Vind de omschrijving op je Bingokaart voor:
              </span>
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                {currentCall.term}
              </h3>
            </div>
          )}

          <div className="grid grid-cols-3 gap-2.5">
            {board.map((c, idx) => {
              const marked = markedIndices.includes(idx);
              return (
                <button
                  key={`${c.id}-${idx}`}
                  type="button"
                  disabled={marked}
                  onClick={() => pickCell(idx)}
                  className={`min-h-[92px] p-3 rounded-xl border text-left text-xs leading-snug transition-colors ${
                    marked
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500 text-emerald-800 dark:text-emerald-200'
                      : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-indigo-500 text-slate-800 dark:text-slate-200'
                  }`}
                >
                  {marked ? (
                    <span className="flex items-center gap-1 font-bold">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      {c.term}
                    </span>
                  ) : (
                    <span className="line-clamp-4">{c.definition}</span>
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
};

/* ============================================================================
   18. RPG BAASGEVECHT (Versla de Tentamen-Draak)
   ============================================================================ */
const BossBattleGame: React.FC<{
  questions: ReturnType<typeof extractQuestions>;
  soundEnabled: boolean;
}> = ({ questions, soundEnabled }) => {
  const [bossHp, setBossHp] = useState(100);
  const [playerHp, setPlayerHp] = useState(100);
  const [qIdx, setQIdx] = useState(0);
  const [streak, setStreak] = useState(0);
  const [potions, setPotions] = useState(1);
  const [log, setLog] = useState('De Tentamen-Draak verspert het pad! Beantwoord goed om aan te vallen.');

  const reset = () => {
    setBossHp(100);
    setPlayerHp(100);
    setQIdx(0);
    setStreak(0);
    setPotions(1);
    setLog('De Tentamen-Draak verspert het pad! Beantwoord goed om aan te vallen.');
  };

  useEffect(() => {
    reset();
  }, [questions]);

  if (questions.length === 0) {
    return <p className="text-sm text-slate-500">Geen vragen beschikbaar voor Baasgevecht.</p>;
  }

  const current = questions[qIdx % questions.length];
  const victory = bossHp <= 0;
  const defeat = playerHp <= 0;

  const attack = (optIdx: number) => {
    if (victory || defeat) return;
    if (optIdx === current.correctIndex) {
      const nextStreak = streak + 1;
      const dmg = 20 + Math.min(nextStreak - 1, 4) * 5;
      const nextBoss = Math.max(0, bossHp - dmg);
      setBossHp(nextBoss);
      setStreak(nextStreak);
      if (nextStreak === 3) {
        setPotions((p) => p + 1);
        setLog(`Kritieke treffer (-${dmg} HP)! Je verdiende een Hersteldrank.`);
      } else {
        setLog(`Raak! Je deed ${dmg} schade aan de Tentamen-Draak.`);
      }
      playGameSound(nextBoss === 0 ? 'win' : 'correct', soundEnabled);
    } else {
      const nextPlayer = Math.max(0, playerHp - 25);
      setPlayerHp(nextPlayer);
      setStreak(0);
      setLog(`Mis! De draak slaat terug (-25 HP). Juiste antwoord: ${current.options[current.correctIndex]}`);
      playGameSound('wrong', soundEnabled);
    }
    setQIdx((i) => i + 1);
  };

  const usePotion = () => {
    if (potions <= 0 || playerHp >= 100 || victory || defeat) return;
    setPotions((p) => p - 1);
    setPlayerHp((hp) => Math.min(100, hp + 25));
    setLog('Hersteldrank gebruikt (+25 HP)!');
    playGameSound('correct', soundEnabled);
  };

  if (victory || defeat) {
    return (
      <div className="py-10 text-center space-y-4">
        <Swords className={`w-10 h-10 mx-auto ${victory ? 'text-emerald-500' : 'text-red-500'}`} />
        <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">
          {victory ? 'Overwinning! Tentamen-Draak verslagen!' : 'Verslagen! Probeer het nog een keer.'}
        </h3>
        <button
          type="button"
          onClick={reset}
          className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium inline-flex items-center gap-2"
        >
          <RotateCcw className="w-4 h-4" />
          <span>Nieuw gevecht</span>
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* Battle HP Bars */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 space-y-2">
          <div className="flex items-center justify-between text-xs font-bold tabular-nums">
            <span className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
              <Heart className="w-4 h-4" />
              Jij
            </span>
            <span>HP: {playerHp} / 100</span>
          </div>
          <div className="h-2.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
            <div className="h-full bg-emerald-500 transition-all" style={{ width: `${playerHp}%` }} />
          </div>
        </div>

        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 space-y-2">
          <div className="flex items-center justify-between text-xs font-bold tabular-nums">
            <span className="flex items-center gap-1.5 text-red-600 dark:text-red-400">
              <Flame className="w-4 h-4" />
              Tentamen-Draak
            </span>
            <span>HP: {bossHp} / 100</span>
          </div>
          <div className="h-2.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
            <div className="h-full bg-red-500 transition-all" style={{ width: `${bossHp}%` }} />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs bg-slate-100 dark:bg-slate-900 px-4 py-2.5 rounded-xl">
        <span className="text-slate-700 dark:text-slate-300">{log}</span>
        <button
          type="button"
          disabled={potions <= 0 || playerHp >= 100}
          onClick={usePotion}
          className="px-3 py-1 rounded-md bg-emerald-600 text-white font-semibold disabled:opacity-40 whitespace-nowrap ml-2"
        >
          Drankje ({potions})
        </button>
      </div>

      <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">{current.question}</h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {current.options.map((opt, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => attack(idx)}
            className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] hover:border-indigo-500 text-left text-sm font-medium transition-colors"
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
};

/* ============================================================================
   19. GOUDMIJN STRATEGIE (Gimkit / Blooket-stijl Upgrades & Schatkisten)
   ============================================================================ */
const GoldMineGame: React.FC<{
  questions: ReturnType<typeof extractQuestions>;
  soundEnabled: boolean;
}> = ({ questions, soundEnabled }) => {
  const [coins, setCoins] = useState(0);
  const [multiplier, setMultiplier] = useState(1);
  const [hasShield, setHasShield] = useState(false);
  const [round, setRound] = useState(0);
  const [phase, setPhase] = useState<'question' | 'chest' | 'done'>('question');
  const [chestResult, setChestResult] = useState<string | null>(null);

  const maxRounds = Math.min(questions.length, 10);

  const reset = () => {
    setCoins(0);
    setMultiplier(1);
    setHasShield(false);
    setRound(0);
    setPhase('question');
    setChestResult(null);
  };

  useEffect(() => {
    reset();
  }, [questions]);

  if (questions.length === 0) {
    return <p className="text-sm text-slate-500">Geen vragen beschikbaar voor Goudmijn.</p>;
  }

  const current = questions[round % questions.length];

  const handleAnswer = (optIdx: number) => {
    if (optIdx === current.correctIndex) {
      const gained = Math.round(100 * multiplier);
      setCoins((c) => c + gained);
      playGameSound('correct', soundEnabled);
      setPhase('chest');
      setChestResult(null);
    } else {
      playGameSound('wrong', soundEnabled);
      if (hasShield) {
        setHasShield(false);
      } else {
        setCoins((c) => Math.max(0, c - 40));
      }
      if (round + 1 >= maxRounds) setPhase('done');
      else setRound((r) => r + 1);
    }
  };

  const openChest = (chestIdx: number) => {
    const roll = (chestIdx + round + Math.floor(Math.random() * 3)) % 3;
    if (roll === 0) {
      setCoins((c) => c + 150);
      setChestResult('+150 gouden munten gevonden!');
      playGameSound('correct', soundEnabled);
    } else if (roll === 1) {
      setCoins((c) => Math.round(c * 1.25) + 50);
      setChestResult('+25% kluisbonus + 50 munten!');
      playGameSound('correct', soundEnabled);
    } else {
      if (hasShield) {
        setHasShield(false);
        setChestResult('Valstrik geblokkeerd door je schild!');
      } else {
        setCoins((c) => Math.max(0, Math.round(c * 0.85)));
        setChestResult('Oei, valstrik! -15% munten.');
      }
      playGameSound('wrong', soundEnabled);
    }
  };

  const nextQuestion = () => {
    if (round + 1 >= maxRounds) {
      setPhase('done');
      playGameSound('win', soundEnabled);
    } else {
      setRound((r) => r + 1);
      setPhase('question');
    }
  };

  if (phase === 'done') {
    return (
      <div className="py-10 text-center space-y-4">
        <Coins className="w-10 h-10 text-amber-500 mx-auto" />
        <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">
          Goudmijn expeditie voltooid!
        </h3>
        <p className="text-lg font-mono font-bold tabular-nums text-amber-600 dark:text-amber-400">
          Totale schat: {coins} munten (Multiplier {multiplier}x)
        </p>
        <button
          type="button"
          onClick={reset}
          className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium inline-flex items-center gap-2"
        >
          <RotateCcw className="w-4 h-4" />
          <span>Opnieuw delven</span>
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      {/* Wallet & Upgrades HUD */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs tabular-nums">
        <div className="flex items-center gap-4">
          <span className="font-mono font-bold text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
            <Coins className="w-4 h-4" />
            {coins} munten
          </span>
          <span className="font-semibold text-slate-700 dark:text-slate-300">
            Bonus: {multiplier}x
          </span>
          {hasShield && (
            <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1 font-semibold">
              <Shield className="w-3.5 h-3.5" />
              Schild actief
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={coins < 150 || multiplier >= 3}
            onClick={() => {
              setCoins((c) => c - 150);
              setMultiplier((m) => Number((m + 0.5).toFixed(1)));
            }}
            className="px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111827] font-semibold disabled:opacity-40"
          >
            +0.5x (150m)
          </button>
          <button
            type="button"
            disabled={coins < 100 || hasShield}
            onClick={() => {
              setCoins((c) => c - 100);
              setHasShield(true);
            }}
            className="px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111827] font-semibold disabled:opacity-40"
          >
            Schild (100m)
          </button>
        </div>
      </div>

      {phase === 'question' ? (
        <>
          <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            Ronde {round + 1} van {maxRounds}
          </p>
          <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
            {current.question}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {current.options.map((opt, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleAnswer(idx)}
                className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] hover:border-indigo-500 text-left text-sm font-medium"
              >
                {opt}
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="p-6 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-center space-y-4">
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
            {chestResult || 'Goed geantwoord! Kies een schatkist:'}
          </h3>
          {!chestResult ? (
            <div className="grid grid-cols-3 gap-3 max-w-md mx-auto">
              {[0, 1, 2].map((i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => openChest(i)}
                  className="py-5 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 hover:bg-amber-100 dark:hover:bg-amber-950/60 font-bold text-sm text-amber-800 dark:text-amber-300"
                >
                  Kist #{i + 1}
                </button>
              ))}
            </div>
          ) : (
            <button
              type="button"
              onClick={nextQuestion}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold"
            >
              Volgende mijnronde
            </button>
          )}
        </div>
      )}
    </div>
  );
};

/* ============================================================================
   20. FOUTENJAGER (Spot de ene foutief gekoppelde stelling)
   ============================================================================ */
interface OddRound {
  cards: Array<{ term: string; shownDef: string; trueDef: string; isFake: boolean }>;
}

const OddOneOutGame: React.FC<{ concepts: ConceptItem[]; soundEnabled: boolean }> = ({
  concepts,
  soundEnabled,
}) => {
  const rounds = useMemo<OddRound[]>(() => {
    if (concepts.length < 4) return [];
    return shuffleArray(concepts).map((fakeTarget, idx) => {
      const others = shuffleArray(concepts.filter((c) => c.id !== fakeTarget.id)).slice(0, 3);
      const wrongDef = others[0].definition;
      const fourCards = shuffleArray([
        { term: fakeTarget.term, shownDef: wrongDef, trueDef: fakeTarget.definition, isFake: true },
        ...others.map((o) => ({
          term: o.term,
          shownDef: o.definition,
          trueDef: o.definition,
          isFake: false,
        })),
      ]);
      return { cards: fourCards };
    });
  }, [concepts]);

  const [idx, setIdx] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [score, setScore] = useState(0);

  const reset = () => {
    setIdx(0);
    setPicked(null);
    setScore(0);
  };

  useEffect(() => {
    reset();
  }, [rounds]);

  if (rounds.length === 0) {
    return <p className="text-sm text-slate-500">Minimaal 4 begrippen nodig voor Foutenjager.</p>;
  }

  const finished = idx >= rounds.length;
  const current = rounds[idx];

  const chooseCard = (cardIdx: number) => {
    if (picked !== null || !current) return;
    setPicked(cardIdx);
    const ok = current.cards[cardIdx].isFake;
    if (ok) {
      setScore((s) => s + 100);
      playGameSound('correct', soundEnabled);
    } else {
      playGameSound('wrong', soundEnabled);
    }
  };

  if (finished) {
    return (
      <div className="py-10 text-center space-y-4">
        <Award className="w-10 h-10 text-amber-500 mx-auto" />
        <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">
          Foutenjager afgerond!
        </h3>
        <p className="text-lg font-mono font-bold tabular-nums text-indigo-600 dark:text-indigo-400">
          Score: {score} / {rounds.length * 100} punten
        </p>
        <button
          type="button"
          onClick={reset}
          className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium inline-flex items-center gap-2"
        >
          <RotateCcw className="w-4 h-4" />
          <span>Opnieuw jagen</span>
        </button>
      </div>
    );
  }

  const fakeCard = current.cards.find((c) => c.isFake);

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 tabular-nums">
        <span>Ronde {idx + 1} van {rounds.length}</span>
        <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">{score} ptn</span>
      </div>

      <div className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-slate-100">
        <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
        <span>Klik op de ÉNE foutieve koppeling (3 van de 4 kloppen!):</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {current.cards.map((c, cIdx) => {
          const reveal = picked !== null;
          const isPicked = picked === cIdx;
          return (
            <button
              key={cIdx}
              type="button"
              disabled={reveal}
              onClick={() => chooseCard(cIdx)}
              className={`p-4 rounded-xl border text-left space-y-1 transition-colors ${
                !reveal
                  ? 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-indigo-500'
                  : c.isFake
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500'
                    : isPicked
                      ? 'bg-red-50 dark:bg-red-950/40 border-red-500'
                      : 'bg-slate-50/50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800 opacity-60'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
                  {c.term}
                </span>
                {reveal && c.isFake && (
                  <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                    Fout gevonden
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                {c.shownDef}
              </p>
            </button>
          );
        })}
      </div>

      {picked !== null && fakeCard && (
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-xs text-slate-700 dark:text-slate-300">
            <strong>{fakeCard.term}</strong> betekent eigenlijk: {fakeCard.trueDef}
          </p>
          <button
            type="button"
            onClick={() => {
              setIdx((i) => i + 1);
              setPicked(null);
            }}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shrink-0"
          >
            Volgende ronde
          </button>
        </div>
      )}
    </div>
  );
};
