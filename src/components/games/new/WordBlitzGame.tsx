import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Flame, Timer, Zap } from 'lucide-react';
import { GroundedConcept } from '../../../types';
import { shuffleArray } from '../../../lib/gameData';
import { checkSoloGameSufficiency, getStrictConcepts } from '../../../lib/newGamesData';
import { playGameSound } from '../../../lib/gameAudio';
import {
  calculateDutchGrade,
  GAME_THEMES,
  GameDifficulty,
  GameResultScreen,
  GameStartScreen,
} from '../GameShell';
import type { OriginalGameProps } from './OriginalGamesStage';

interface MovingBubble {
  id: string;
  label: string;
  isCorrect: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

const theme = GAME_THEMES.amber;

export const WordBlitzGame: React.FC<OriginalGameProps> = ({
  material,
  studySet,
  soundEnabled,
  initialProgress,
  onSaveProgress,
  onExit,
}) => {
  const source = material ?? studySet;
  const concepts = useMemo(() => getStrictConcepts(source), [source]);

  const insufficientReason = useMemo(() => {
    if (material) {
      const check = checkSoloGameSufficiency('word-blitz', material);
      if (!check.ok) return check.reason;
    }
    if (concepts.length < 4) {
      return `Voor Word Blitz zijn minimaal 4 begrippen uit jouw geselecteerde leerstof nodig (gevonden: ${concepts.length}).`;
    }
    return undefined;
  }, [material, concepts.length]);

  const parsedProgress = useMemo(() => {
    if (!initialProgress) return null;
    try {
      return JSON.parse(initialProgress) as {
        score?: number;
        correct?: number;
        wrong?: number;
        maxCombo?: number;
        roundIdx?: number;
      };
    } catch {
      return null;
    }
  }, [initialProgress]);

  const [phase, setPhase] = useState<'start' | 'play' | 'result'>('start');
  const [difficulty, setDifficulty] = useState<GameDifficulty>('normal');

  const [timeLeft, setTimeLeft] = useState(60);
  const [score, setScore] = useState(parsedProgress?.score || 0);
  const [combo, setCombo] = useState(0);
  const [maxCombo, setMaxCombo] = useState(parsedProgress?.maxCombo || 0);
  const [correct, setCorrect] = useState(parsedProgress?.correct || 0);
  const [wrong, setWrong] = useState(parsedProgress?.wrong || 0);
  const [roundIdx, setRoundIdx] = useState(parsedProgress?.roundIdx || 0);
  const [deck, setDeck] = useState<GroundedConcept[]>([]);
  const [bubbles, setBubbles] = useState<MovingBubble[]>([]);
  const [flash, setFlash] = useState<'none' | 'good' | 'bad'>('none');
  const [lastFeedback, setLastFeedback] = useState<string | null>(null);
  const roundStartedAt = useRef<number>(Date.now());

  const speedMultiplier = difficulty === 'easy' ? 0.65 : difficulty === 'hard' ? 1.35 : 1;
  const bubbleCount = Math.min(concepts.length, difficulty === 'easy' ? 4 : difficulty === 'hard' ? 6 : 5);
  const startSeconds = difficulty === 'easy' ? 75 : difficulty === 'hard' ? 50 : 60;

  const sourceLabel = material
    ? material.fileStatuses.filter((f) => f.readable).map((f) => f.title).join(', ') || material.title
    : studySet?.sourceTitle || studySet?.title || 'Geselecteerde leerstof';

  const buildBubbles = (target: GroundedConcept, pool: GroundedConcept[], waveLevel: number) => {
    const distractors = shuffleArray(pool.filter((c) => c.id !== target.id)).slice(
      0,
      Math.max(1, bubbleCount - 1)
    );
    const items = shuffleArray([target, ...distractors]);
    const spd = (0.38 + Math.min(waveLevel, 10) * 0.04) * speedMultiplier;

    const spawned: MovingBubble[] = items.map((item, i) => {
      const angle = (Math.PI * 2 * i) / items.length + Math.random() * 0.5;
      return {
        id: `${item.id}-${Date.now()}-${i}`,
        label: item.term,
        isCorrect: item.id === target.id,
        x: 15 + ((i * 22 + Math.random() * 14) % 70),
        y: 16 + ((i * 26 + Math.random() * 12) % 68),
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd * 1.15,
      };
    });
    setBubbles(spawned);
    roundStartedAt.current = Date.now();
  };

  const startGame = (resume = false) => {
    if (insufficientReason) return;
    const shuffled = shuffleArray(concepts);
    setDeck(shuffled);
    setTimeLeft(startSeconds);
    const initRound = resume && parsedProgress?.roundIdx ? parsedProgress.roundIdx : 0;
    if (!resume) {
      setScore(0);
      setMaxCombo(0);
      setCorrect(0);
      setWrong(0);
      setRoundIdx(0);
    } else {
      setRoundIdx(initRound);
    }
    setCombo(0);
    setFlash('none');
    setLastFeedback(null);
    setPhase('play');
    if (shuffled.length > 0) {
      buildBubbles(shuffled[initRound % shuffled.length], concepts, initRound);
    }
  };

  useEffect(() => {
    if (phase !== 'play') return;
    const id = window.setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          setPhase('result');
          playGameSound('win', soundEnabled);
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [phase, soundEnabled]);

  useEffect(() => {
    if (phase !== 'play') return;
    const id = window.setInterval(() => {
      setBubbles((prev) =>
        prev.map((b) => {
          let nx = b.x + b.vx;
          let ny = b.y + b.vy;
          let nvx = b.vx;
          let nvy = b.vy;
          if (nx < 12 || nx > 88) {
            nvx = -nvx;
            nx = Math.max(12, Math.min(88, nx));
          }
          if (ny < 14 || ny > 86) {
            nvy = -nvy;
            ny = Math.max(14, Math.min(86, ny));
          }
          return { ...b, x: nx, y: ny, vx: nvx, vy: nvy };
        })
      );
    }, 33);
    return () => window.clearInterval(id);
  }, [phase]);

  const currentTarget = deck[roundIdx % Math.max(deck.length, 1)];

  const persist = (nextScore: number, nextCorrect: number, nextWrong: number, nextMax: number, nextRound: number, done: boolean) => {
    onSaveProgress?.({
      difficulty,
      score: nextScore,
      completed: done,
      progress: JSON.stringify({
        score: nextScore,
        correct: nextCorrect,
        wrong: nextWrong,
        maxCombo: nextMax,
        roundIdx: nextRound,
      }),
    });
  };

  const handleBubbleClick = (bubble: MovingBubble) => {
    if (phase !== 'play' || !currentTarget) return;
    if (bubble.isCorrect) {
      const elapsedMs = Date.now() - roundStartedAt.current;
      const speedBonus = elapsedMs < 2500 ? 60 : elapsedMs < 4500 ? 30 : 0;
      const nextCombo = combo + 1;
      const pts = 100 + speedBonus + Math.min(nextCombo, 6) * 20;
      const nextScore = score + pts;
      const nextCorrect = correct + 1;
      const nextMax = Math.max(maxCombo, nextCombo);
      const nextIdx = roundIdx + 1;

      setScore(nextScore);
      setCombo(nextCombo);
      setMaxCombo(nextMax);
      setCorrect(nextCorrect);
      setFlash('good');
      setLastFeedback(`Goed! "${currentTarget.term}" (${currentTarget.sourceTitle} · ${currentTarget.sourceSection})`);
      playGameSound('correct', soundEnabled);
      persist(nextScore, nextCorrect, wrong, nextMax, nextIdx, false);

      setRoundIdx(nextIdx);
      const nextConcept = deck[nextIdx % deck.length];
      window.setTimeout(() => setFlash('none'), 260);
      buildBubbles(nextConcept, concepts, nextIdx);
    } else {
      const nextWrong = wrong + 1;
      const nextScore = Math.max(0, score - 25);
      setCombo(0);
      setWrong(nextWrong);
      setScore(nextScore);
      setFlash('bad');
      setLastFeedback(
        `Fout! Dat was "${bubble.label}". Gezocht begrip volgens ${currentTarget.sourceTitle} (${currentTarget.sourceSection}): "${currentTarget.term}".`
      );
      playGameSound('wrong', soundEnabled);
      persist(nextScore, correct, nextWrong, maxCombo, roundIdx, false);
      window.setTimeout(() => setFlash('none'), 260);
    }
  };

  useEffect(() => {
    if (phase === 'result') {
      persist(score, correct, wrong, maxCombo, roundIdx, true);
    }
  }, [phase]);

  if (phase === 'start') {
    return (
      <div className="space-y-3">
        <GameStartScreen
          title="Word Blitz – Snelheid en kennis"
          description="Er verschijnt een omschrijving uit jouw gekozen bestanden. Klik zo snel mogelijk op het juiste bewegende begrip voordat de tijd om is!"
          durationLabel="5–6 min · Arcade"
          theme={theme}
          icon={<Zap className="w-6 h-6" />}
          difficulty={difficulty}
          onChangeDifficulty={setDifficulty}
          sourceLabel={sourceLabel}
          insufficientReason={insufficientReason}
          onStart={() => startGame(Boolean(parsedProgress && (parsedProgress.correct || 0) > 0))}
        />
      </div>
    );
  }

  if (phase === 'result') {
    const grade = calculateDutchGrade(correct, wrong, Math.min(1, maxCombo / 8));
    return (
      <GameResultScreen
        title="Word Blitz"
        score={score}
        correct={correct}
        wrong={wrong}
        grade={grade}
        extraStats={[{ label: 'Hoogste combo', value: `${maxCombo}x` }]}
        sourceSummary={sourceLabel}
        theme={theme}
        onReplay={() => startGame(false)}
        onExit={onExit}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4 text-xs tabular-nums">
        <span
          className={`font-mono text-sm font-bold flex items-center gap-1.5 ${
            timeLeft <= 10 ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-slate-100'
          }`}
        >
          <Timer className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          {timeLeft}s
        </span>
        <span className="flex items-center gap-1 font-semibold text-amber-600 dark:text-amber-400">
          <Flame className="w-4 h-4" />
          Combo {combo}x
        </span>
        <span className="text-slate-600 dark:text-slate-400">
          Goed: {correct} · Fout: {wrong}
        </span>
        <span className="font-mono text-sm font-bold text-amber-600 dark:text-amber-400">
          {score} ptn
        </span>
      </div>

      {currentTarget && (
        <div
          className={`p-4 rounded-2xl border text-center transition-colors space-y-1 ${
            flash === 'good'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-400'
              : flash === 'bad'
                ? 'bg-red-50 dark:bg-red-950/40 border-red-400'
                : 'bg-amber-50/70 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800'
          }`}
        >
          <p className="text-[11px] font-medium text-amber-700 dark:text-amber-300 flex items-center justify-center gap-1">
            <BookOpen className="w-3.5 h-3.5" />
            <span>Bron: {currentTarget.sourceTitle} · {currentTarget.sourceSection}</span>
          </p>
          <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100">
            {currentTarget.definition}
          </h3>
        </div>
      )}

      {lastFeedback && (
        <p className="text-xs font-medium text-center px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300">
          {lastFeedback}
        </p>
      )}

      <div className="relative h-[320px] sm:h-[360px] w-full rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden select-none">
        {bubbles.map((b) => (
          <button
            key={b.id}
            type="button"
            onClick={() => handleBubbleClick(b)}
            style={{
              left: `${b.x}%`,
              top: `${b.y}%`,
              transform: 'translate(-50%, -50%)',
            }}
            className="absolute px-4 py-2.5 rounded-xl bg-white dark:bg-[#161D2B] border border-amber-400/70 hover:border-amber-300 hover:scale-105 active:scale-95 shadow-md text-xs sm:text-sm font-bold text-slate-900 dark:text-slate-100 max-w-[185px] truncate transition-transform"
          >
            {b.label}
          </button>
        ))}
      </div>
    </div>
  );
};
