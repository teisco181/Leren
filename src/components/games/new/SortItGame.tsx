import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDown, BookOpen, Flame, FolderKanban, Timer } from 'lucide-react';
import { GroundedSortRound } from '../../../types';
import { checkSoloGameSufficiency, getStrictSortRounds } from '../../../lib/newGamesData';
import { playGameSound } from '../../../lib/gameAudio';
import {
  calculateDutchGrade,
  GAME_THEMES,
  GameDifficulty,
  GameResultScreen,
  GameStartScreen,
} from '../GameShell';
import type { OriginalGameProps } from './OriginalGamesStage';

const theme = GAME_THEMES.lime;

export const SortItGame: React.FC<OriginalGameProps> = ({
  material,
  studySet,
  soundEnabled,
  onSaveProgress,
  onExit,
}) => {
  const source = material ?? studySet;
  const rounds = useMemo<GroundedSortRound[]>(() => getStrictSortRounds(source), [source]);

  const insufficientReason = useMemo(() => {
    if (material) {
      const check = checkSoloGameSufficiency('sort-it', material);
      if (!check.ok) return check.reason;
    }
    if (rounds.length === 0) {
      return 'Sort It! heeft minstens twee te onderscheiden subonderwerpen of bestanden nodig in jouw selectie. Voeg extra bronnen of rijkere leerstof toe.';
    }
    return undefined;
  }, [material, rounds.length]);

  const sourceLabel = material
    ? material.fileStatuses.filter((f) => f.readable).map((f) => f.title).join(', ') || material.title
    : studySet?.sourceTitle || studySet?.title || 'Geselecteerde leerstof';

  const [phase, setPhase] = useState<'start' | 'play' | 'result'>('start');
  const [difficulty, setDifficulty] = useState<GameDifficulty>('normal');
  const [roundIdx, setRoundIdx] = useState(0);
  const [itemIdx, setItemIdx] = useState(0);
  const [dropProgress, setDropProgress] = useState(0);
  const [timeLeft, setTimeLeft] = useState(75);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [wrong, setWrong] = useState(0);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [dragging, setDragging] = useState(false);

  const startSeconds = difficulty === 'easy' ? 90 : difficulty === 'hard' ? 60 : 75;
  const fallRate = difficulty === 'easy' ? 0.6 : difficulty === 'hard' ? 1.45 : 1.0;

  const startGame = () => {
    if (insufficientReason) return;
    setRoundIdx(0);
    setItemIdx(0);
    setDropProgress(0);
    setTimeLeft(startSeconds);
    setScore(0);
    setCombo(0);
    setCorrect(0);
    setWrong(0);
    setFeedback(null);
    setPhase('play');
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
    if (phase === 'result') {
      onSaveProgress?.({
        difficulty,
        score,
        completed: true,
        progress: JSON.stringify({ correct, wrong, score }),
      });
    }
  }, [phase]);

  const currentRound = rounds[roundIdx];
  const currentItem = currentRound?.items[itemIdx];

  const advanceItem = () => {
    if (!currentRound) return;
    setDropProgress(0);
    if (itemIdx + 1 < currentRound.items.length) {
      setItemIdx((i) => i + 1);
    } else if (roundIdx + 1 < rounds.length) {
      setRoundIdx((r) => r + 1);
      setItemIdx(0);
    } else {
      playGameSound('win', soundEnabled);
      setPhase('result');
    }
  };

  useEffect(() => {
    if (phase !== 'play' || !currentItem || !currentRound) return;
    const id = window.setInterval(() => {
      setDropProgress((p) => {
        const next = p + fallRate;
        if (next >= 100) {
          setCombo(0);
          setWrong((w) => w + 1);
          playGameSound('wrong', soundEnabled);
          setFeedback({
            ok: false,
            text: `Te laat! "${currentItem.label}" hoort bij ${currentRound.buckets[currentItem.bucketIndex]} (${currentItem.sourceTitle} · ${currentItem.sourceSection}).`,
          });
          advanceItem();
          return 0;
        }
        return next;
      });
    }, 90);
    return () => window.clearInterval(id);
  }, [phase, currentItem, currentRound, fallRate, roundIdx, itemIdx]);

  const sortIntoBucket = (bucketIndex: 0 | 1) => {
    if (phase !== 'play' || !currentItem || !currentRound) return;
    setDragging(false);
    if (bucketIndex === currentItem.bucketIndex) {
      const nextCombo = combo + 1;
      setCombo(nextCombo);
      setCorrect((c) => c + 1);
      const pts = 90 + Math.min(nextCombo, 5) * 20;
      setScore((s) => s + pts);
      playGameSound('correct', soundEnabled);
      setFeedback({
        ok: true,
        text: `Raak! +${pts} ptn (${currentItem.sourceTitle} · ${currentItem.sourceSection})`,
      });
    } else {
      setCombo(0);
      setWrong((w) => w + 1);
      playGameSound('wrong', soundEnabled);
      setFeedback({
        ok: false,
        text: `Fout vak! "${currentItem.label}" hoort bij ${currentRound.buckets[currentItem.bucketIndex]} (${currentItem.sourceTitle} · ${currentItem.sourceSection}).`,
      });
    }
    advanceItem();
  };

  if (phase === 'start') {
    return (
      <GameStartScreen
        title="Sort It! – Snel sorteren"
        description="Begrippen uit jouw gekozen bestanden zakken naar beneden. Sleep elk item naar het juiste categorie-vak voordat de timer afloopt!"
        durationLabel="5–7 min · Sorteren"
        theme={theme}
        icon={<FolderKanban className="w-6 h-6" />}
        difficulty={difficulty}
        onChangeDifficulty={setDifficulty}
        sourceLabel={sourceLabel}
        insufficientReason={insufficientReason}
        onStart={startGame}
      />
    );
  }

  if (phase === 'result') {
    const grade = calculateDutchGrade(correct, wrong, Math.min(0.4, combo * 0.05));
    return (
      <GameResultScreen
        title="Sort It!"
        score={score}
        correct={correct}
        wrong={wrong}
        grade={grade}
        sourceSummary={sourceLabel}
        theme={theme}
        onReplay={startGame}
        onExit={onExit}
      />
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4 text-xs tabular-nums">
        <span className="font-mono font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
          <Timer className="w-4 h-4 text-lime-600 dark:text-lime-400" />
          {timeLeft}s
        </span>
        <span className="font-semibold text-lime-700 dark:text-lime-400">
          {currentRound?.topicTitle} ({roundIdx + 1}/{rounds.length})
        </span>
        <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-semibold">
          <Flame className="w-3.5 h-3.5" />
          Combo {combo}x
        </span>
        <span className="font-mono font-bold text-lime-600 dark:text-lime-400">{score} ptn</span>
      </div>

      <div className="relative h-48 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 overflow-hidden flex justify-center">
        {currentItem && (
          <div
            draggable
            onDragStart={() => setDragging(true)}
            onDragEnd={() => setDragging(false)}
            style={{ top: `${Math.min(72, dropProgress * 0.72)}%` }}
            className={`absolute px-5 py-3 rounded-xl bg-white dark:bg-[#111827] border-2 border-lime-500 shadow-md text-center cursor-grab active:cursor-grabbing select-none transition-transform ${
              dragging ? 'scale-105 opacity-80' : ''
            }`}
          >
            <p className="text-[10px] font-medium text-lime-700 dark:text-lime-400 flex items-center justify-center gap-1 mb-0.5">
              <BookOpen className="w-3 h-3" />
              <span>{currentItem.sourceTitle} · {currentItem.sourceSection}</span>
            </p>
            <p className="text-base font-bold text-slate-900 dark:text-slate-100">
              {currentItem.label}
            </p>
            <p className="text-[10px] text-slate-500 flex items-center justify-center gap-1 mt-0.5">
              <ArrowDown className="w-3 h-3" />
              Sleep of tik op een vak hieronder
            </p>
          </div>
        )}
      </div>

      {currentRound && (
        <div className="grid grid-cols-2 gap-4">
          {([0, 1] as const).map((bIdx) => (
            <button
              key={bIdx}
              type="button"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                sortIntoBucket(bIdx);
              }}
              onClick={() => sortIntoBucket(bIdx)}
              className="py-6 px-4 rounded-2xl border-2 border-dashed border-lime-400 dark:border-lime-700 bg-lime-50/70 dark:bg-lime-950/20 hover:bg-lime-100 dark:hover:bg-lime-950/40 text-center space-y-1 transition-colors"
            >
              <span className="block text-[11px] font-medium text-lime-700 dark:text-lime-400">
                Categorie {bIdx + 1}
              </span>
              <span className="block text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100">
                {currentRound.buckets[bIdx]}
              </span>
            </button>
          ))}
        </div>
      )}

      {feedback && (
        <p
          className={`text-xs font-semibold text-center py-2 px-3 rounded-xl ${
            feedback.ok
              ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300'
              : 'bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300'
          }`}
        >
          {feedback.text}
        </p>
      )}
    </div>
  );
};
