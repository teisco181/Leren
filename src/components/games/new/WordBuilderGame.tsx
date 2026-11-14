import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, CheckCircle2, Lightbulb, Puzzle, RotateCcw } from 'lucide-react';
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

interface Tile {
  uid: number;
  ch: string;
}

const theme = GAME_THEMES.pink;

export const WordBuilderGame: React.FC<OriginalGameProps> = ({
  material,
  studySet,
  soundEnabled,
  onSaveProgress,
  onExit,
}) => {
  const source = material ?? studySet;
  const validConcepts = useMemo(
    () =>
      getStrictConcepts(source).filter(
        (c) => c.cleanWord.length >= 3 && c.cleanWord.length <= 13
      ),
    [source]
  );

  const insufficientReason = useMemo(() => {
    if (material) {
      const check = checkSoloGameSufficiency('word-builder', material);
      if (!check.ok) return check.reason;
    }
    if (validConcepts.length < 3) {
      return `Word Builder vereist minimaal 3 losse kernwoorden (3–13 letters) uit jouw gekozen bestanden (gevonden: ${validConcepts.length}).`;
    }
    return undefined;
  }, [material, validConcepts.length]);

  const sourceLabel = material
    ? material.fileStatuses.filter((f) => f.readable).map((f) => f.title).join(', ') || material.title
    : studySet?.sourceTitle || studySet?.title || 'Geselecteerde leerstof';

  const [phase, setPhase] = useState<'start' | 'play' | 'result'>('start');
  const [difficulty, setDifficulty] = useState<GameDifficulty>('normal');

  const [words, setWords] = useState<GroundedConcept[]>([]);
  const [idx, setIdx] = useState(0);
  const [pool, setPool] = useState<Tile[]>([]);
  const [slots, setSlots] = useState<Array<Tile | null>>([]);
  const [hinted, setHinted] = useState(false);
  const [status, setStatus] = useState<'building' | 'solved'>('building');
  const [score, setScore] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [wrong, setWrong] = useState(0);
  const [dragTileId, setDragTileId] = useState<number | null>(null);

  const roundCount = difficulty === 'easy' ? 5 : difficulty === 'hard' ? 8 : 6;

  const prepareWord = (item: GroundedConcept) => {
    const target = item.cleanWord;
    const baseTiles: Tile[] = target.split('').map((ch, i) => ({ uid: i + 1, ch }));
    const extraCount = difficulty === 'hard' ? 3 : difficulty === 'normal' ? 1 : 0;
    const alphabet = 'AEIOURSTLNMD';
    for (let k = 0; k < extraCount; k++) {
      baseTiles.push({
        uid: 100 + k,
        ch: alphabet[Math.floor(Math.random() * alphabet.length)],
      });
    }
    setPool(shuffleArray(baseTiles));
    setSlots(Array(target.length).fill(null));
    setHinted(false);
    setStatus('building');
  };

  const startGame = () => {
    if (insufficientReason) return;
    const picked = shuffleArray(validConcepts).slice(0, Math.min(roundCount, validConcepts.length));
    setWords(picked);
    setIdx(0);
    setScore(0);
    setCorrect(0);
    setWrong(0);
    setPhase('play');
    if (picked[0]) prepareWord(picked[0]);
  };

  useEffect(() => {
    if (phase === 'result') {
      onSaveProgress?.({
        difficulty,
        score,
        completed: true,
        progress: JSON.stringify({ idx, correct, wrong, score }),
      });
    }
  }, [phase]);

  const current = words[idx];
  const target = current?.cleanWord || '';

  const checkSolved = (nextSlots: Array<Tile | null>) => {
    if (nextSlots.some((s) => s === null)) return;
    const built = nextSlots.map((s) => s?.ch || '').join('');
    if (built === target) {
      setStatus('solved');
      setCorrect((c) => c + 1);
      setScore((s) => s + (hinted ? 90 : 140));
      playGameSound('correct', soundEnabled);
    } else {
      setWrong((w) => w + 1);
      playGameSound('wrong', soundEnabled);
    }
  };

  const placeTile = (tile: Tile, targetSlotIdx?: number) => {
    if (status === 'solved') return;
    const emptyIdx =
      targetSlotIdx !== undefined && slots[targetSlotIdx] === null
        ? targetSlotIdx
        : slots.findIndex((s) => s === null);
    if (emptyIdx === -1) return;

    playGameSound('click', soundEnabled);
    const nextSlots = [...slots];
    nextSlots[emptyIdx] = tile;
    setPool((p) => p.filter((t) => t.uid !== tile.uid));
    setSlots(nextSlots);
    checkSolved(nextSlots);
  };

  const returnTile = (slotIdx: number) => {
    if (status === 'solved') return;
    const tile = slots[slotIdx];
    if (!tile) return;
    playGameSound('click', soundEnabled);
    const nextSlots = [...slots];
    nextSlots[slotIdx] = null;
    setSlots(nextSlots);
    setPool((p) => [...p, tile]);
  };

  const useHint = () => {
    if (status === 'solved' || !current) return;
    const wrongOrEmptyIdx = slots.findIndex((s, i) => !s || s.ch !== target[i]);
    if (wrongOrEmptyIdx === -1) return;

    const neededChar = target[wrongOrEmptyIdx];
    const fromPool = pool.find((t) => t.ch === neededChar);
    if (!fromPool) {
      const returned: Tile[] = [];
      const cleared = slots.map((s, i) => {
        if (s && s.ch !== target[i]) {
          returned.push(s);
          return null;
        }
        return s;
      });
      const updatedPool = [...pool, ...returned];
      const match = updatedPool.find((t) => t.ch === neededChar);
      if (match) {
        cleared[wrongOrEmptyIdx] = match;
        setPool(updatedPool.filter((t) => t.uid !== match.uid));
        setSlots(cleared);
        setHinted(true);
        checkSolved(cleared);
      }
      return;
    }

    const nextSlots = [...slots];
    if (nextSlots[wrongOrEmptyIdx]) {
      setPool((p) => [...p, nextSlots[wrongOrEmptyIdx]!]);
    }
    nextSlots[wrongOrEmptyIdx] = fromPool;
    setPool((p) => p.filter((t) => t.uid !== fromPool.uid));
    setSlots(nextSlots);
    setHinted(true);
    playGameSound('click', soundEnabled);
    checkSolved(nextSlots);
  };

  const nextWord = () => {
    if (idx + 1 >= words.length) {
      playGameSound('win', soundEnabled);
      setPhase('result');
    } else {
      const nextIdx = idx + 1;
      setIdx(nextIdx);
      prepareWord(words[nextIdx]);
    }
  };

  if (phase === 'start') {
    return (
      <GameStartScreen
        title="Word Builder – Bouw het juiste woord"
        description="Sleep of klik de losse lettertegels naar de juiste plek om het gezochte begrip uit jouw geselecteerde documenten te bouwen."
        durationLabel="5–7 min · Woordpuzzel"
        theme={theme}
        icon={<Puzzle className="w-6 h-6" />}
        difficulty={difficulty}
        onChangeDifficulty={setDifficulty}
        sourceLabel={sourceLabel}
        insufficientReason={insufficientReason}
        onStart={startGame}
      />
    );
  }

  if (phase === 'result') {
    const grade = calculateDutchGrade(correct, wrong, hinted ? 0 : 0.3);
    return (
      <GameResultScreen
        title="Word Builder"
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
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 tabular-nums">
        <span>Woord {idx + 1} van {words.length}</span>
        <span className="font-mono font-bold text-pink-600 dark:text-pink-400">{score} ptn</span>
      </div>

      {current && (
        <div className="p-5 rounded-2xl border border-pink-200 dark:border-pink-900 bg-pink-50/60 dark:bg-pink-950/20 text-center space-y-1.5">
          <p className="text-[11px] font-medium text-pink-700 dark:text-pink-300 flex items-center justify-center gap-1">
            <BookOpen className="w-3.5 h-3.5" />
            <span>Bron: {current.sourceTitle} · {current.sourceSection} ({target.length} letters)</span>
          </p>
          <p className="text-base font-bold text-slate-900 dark:text-slate-100">
            {current.definition}
          </p>
        </div>
      )}

      <div className="flex flex-wrap justify-center gap-2 p-4 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/50">
        {slots.map((tile, sIdx) => (
          <button
            key={sIdx}
            type="button"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (dragTileId !== null) {
                const dragged = pool.find((t) => t.uid === dragTileId);
                if (dragged) placeTile(dragged, sIdx);
                setDragTileId(null);
              }
            }}
            onClick={() => returnTile(sIdx)}
            className={`w-10 h-11 rounded-xl font-mono text-lg font-bold flex items-center justify-center transition-all ${
              status === 'solved'
                ? 'bg-emerald-600 text-white border border-emerald-500 scale-105'
                : tile
                  ? 'bg-pink-600 text-white border border-pink-500 hover:bg-pink-700'
                  : 'bg-white dark:bg-[#111827] border border-slate-300 dark:border-slate-700 text-slate-300'
            }`}
          >
            {tile ? tile.ch : '_'}
          </button>
        ))}
      </div>

      {status === 'solved' ? (
        <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-300 dark:border-emerald-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm font-bold text-emerald-800 dark:text-emerald-300">
            <CheckCircle2 className="w-5 h-5" />
            <span>Top! Het juiste begrip is "{current.term}".</span>
          </div>
          <button
            type="button"
            onClick={nextWord}
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold shrink-0"
          >
            {idx + 1 >= words.length ? 'Bekijk eindcijfer' : 'Volgende woord'}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-center text-[11px] text-slate-500 dark:text-slate-400">
            Sleep een tegel naar een vakje of klik om te plaatsen · Klik op een geplaatste letter om terug te zetten
          </p>

          <div className="flex flex-wrap justify-center gap-2">
            {pool.map((tile) => (
              <button
                key={tile.uid}
                type="button"
                draggable
                onDragStart={() => setDragTileId(tile.uid)}
                onClick={() => placeTile(tile)}
                className="w-11 h-11 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-700 hover:border-pink-500 shadow-xs font-mono text-lg font-bold text-slate-900 dark:text-slate-100 cursor-grab active:cursor-grabbing"
              >
                {tile.ch}
              </button>
            ))}
          </div>

          <div className="flex justify-center gap-4">
            <button
              type="button"
              onClick={useHint}
              className="text-xs font-semibold text-pink-600 dark:text-pink-400 inline-flex items-center gap-1"
            >
              <Lightbulb className="w-3.5 h-3.5" />
              <span>Hint (1 letter plaatsen)</span>
            </button>
            <button
              type="button"
              onClick={() => prepareWord(current)}
              className="text-xs font-medium text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 inline-flex items-center gap-1"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Opnieuw schudden</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
