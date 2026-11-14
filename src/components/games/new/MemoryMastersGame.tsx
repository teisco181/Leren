import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, Brain, Timer } from 'lucide-react';
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

interface CardItem {
  key: string;
  pairId: string;
  label: string;
  kind: 'term' | 'def';
  sourceTitle: string;
  sourceSection: string;
}

const theme = GAME_THEMES.emerald;

export const MemoryMastersGame: React.FC<OriginalGameProps> = ({
  material,
  studySet,
  soundEnabled,
  onSaveProgress,
  onExit,
}) => {
  const source = material ?? studySet;
  const concepts = useMemo(() => getStrictConcepts(source), [source]);

  const insufficientReason = useMemo(() => {
    if (material) {
      const check = checkSoloGameSufficiency('memory-masters', material);
      if (!check.ok) return check.reason;
    }
    if (concepts.length < 4) {
      return `Memory Masters vereist minimaal 4 begrippen uit jouw gekozen leerstof (gevonden: ${concepts.length}).`;
    }
    return undefined;
  }, [material, concepts.length]);

  const sourceLabel = material
    ? material.fileStatuses.filter((f) => f.readable).map((f) => f.title).join(', ') || material.title
    : studySet?.sourceTitle || studySet?.title || 'Geselecteerde leerstof';

  const [phase, setPhase] = useState<'start' | 'play' | 'result'>('start');
  const [difficulty, setDifficulty] = useState<GameDifficulty>('normal');
  const [cards, setCards] = useState<CardItem[]>([]);
  const [flippedIndices, setFlippedIndices] = useState<number[]>([]);
  const [matchedIds, setMatchedIds] = useState<string[]>([]);
  const [attempts, setAttempts] = useState(0);
  const [mistakes, setMistakes] = useState(0);
  const [timeLeft, setTimeLeft] = useState(120);
  const [score, setScore] = useState(0);
  const [lastMatchInfo, setLastMatchInfo] = useState<string | null>(null);

  const pairTarget = difficulty === 'easy' ? 6 : difficulty === 'hard' ? 10 : 8;
  const maxSeconds = difficulty === 'easy' ? 150 : difficulty === 'hard' ? 135 : 120;

  const startGame = () => {
    if (insufficientReason) return;
    const selected = shuffleArray(concepts).slice(0, Math.min(pairTarget, concepts.length));
    const deck: CardItem[] = [];
    selected.forEach((c) => {
      deck.push({
        key: `${c.id}-t`,
        pairId: c.id,
        label: c.term,
        kind: 'term',
        sourceTitle: c.sourceTitle,
        sourceSection: c.sourceSection,
      });
      deck.push({
        key: `${c.id}-d`,
        pairId: c.id,
        label: c.definition,
        kind: 'def',
        sourceTitle: c.sourceTitle,
        sourceSection: c.sourceSection,
      });
    });
    setCards(shuffleArray(deck));
    setFlippedIndices([]);
    setMatchedIds([]);
    setAttempts(0);
    setMistakes(0);
    setScore(0);
    setTimeLeft(maxSeconds);
    setLastMatchInfo(null);
    setPhase('play');
  };

  useEffect(() => {
    if (phase !== 'play') return;
    const id = window.setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          setPhase('result');
          playGameSound('wrong', soundEnabled);
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
        progress: JSON.stringify({ matched: matchedIds.length, mistakes, score }),
      });
    }
  }, [phase]);

  const totalPairs = Math.floor(cards.length / 2);

  const handleCardClick = (idx: number) => {
    if (phase !== 'play' || flippedIndices.length === 2 || flippedIndices.includes(idx)) return;
    const card = cards[idx];
    if (!card || matchedIds.includes(card.pairId)) return;

    playGameSound('click', soundEnabled);
    const nextFlipped = [...flippedIndices, idx];
    setFlippedIndices(nextFlipped);

    if (nextFlipped.length === 2) {
      setAttempts((a) => a + 1);
      const first = cards[nextFlipped[0]];
      const second = cards[nextFlipped[1]];
      if (first.pairId === second.pairId && first.kind !== second.kind) {
        const nextMatched = [...matchedIds, first.pairId];
        setMatchedIds(nextMatched);
        setFlippedIndices([]);
        const nextScore = score + 150;
        setScore(nextScore);
        setLastMatchInfo(
          `Gekoppeld! (Bron: ${first.sourceTitle} · ${first.sourceSection})`
        );
        playGameSound(nextMatched.length === totalPairs ? 'win' : 'correct', soundEnabled);

        if (nextMatched.length === totalPairs) {
          const lowMistakeBonus = Math.max(0, (totalPairs - mistakes) * 35);
          const timeBonus = timeLeft * 4;
          const finalScore = nextScore + lowMistakeBonus + timeBonus;
          setScore(finalScore);
          onSaveProgress?.({
            difficulty,
            score: finalScore,
            completed: true,
            progress: JSON.stringify({ matched: nextMatched.length, mistakes, score: finalScore }),
          });
          window.setTimeout(() => setPhase('result'), 450);
        }
      } else {
        setMistakes((m) => m + 1);
        setLastMatchInfo('Geen match. Lees het begrip en de uitleg op de omgedraaide kaarten goed.');
        playGameSound('wrong', soundEnabled);
        window.setTimeout(() => setFlippedIndices([]), 800);
      }
    }
  };

  if (phase === 'start') {
    return (
      <GameStartScreen
        title="Memory Masters – Slim onthouden"
        description="Draai kaarten om en koppel elk begrip uit jouw geselecteerde bestanden aan de juiste uitleg. Verdien een bonus door weinig fouten te maken!"
        durationLabel="5–8 min · Geheugen"
        theme={theme}
        icon={<Brain className="w-6 h-6" />}
        difficulty={difficulty}
        onChangeDifficulty={setDifficulty}
        sourceLabel={sourceLabel}
        insufficientReason={insufficientReason}
        onStart={startGame}
      />
    );
  }

  if (phase === 'result') {
    const grade = calculateDutchGrade(matchedIds.length, mistakes, timeLeft / maxSeconds);
    return (
      <GameResultScreen
        title="Memory Masters"
        score={score}
        correct={matchedIds.length}
        wrong={mistakes}
        grade={grade}
        extraStats={[
          { label: 'Pogingen', value: `${attempts}` },
          { label: 'Tijd over', value: `${timeLeft}s` },
        ]}
        sourceSummary={sourceLabel}
        theme={theme}
        onReplay={startGame}
        onExit={onExit}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-4 text-xs tabular-nums">
        <span className="flex items-center gap-1.5 font-mono font-bold text-slate-900 dark:text-slate-100">
          <Timer className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
          {timeLeft}s
        </span>
        <span className="text-slate-600 dark:text-slate-400">
          Paren: {matchedIds.length} / {totalPairs} · Pogingen: {attempts} · Fouten: {mistakes}
        </span>
        <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
          {score} ptn
        </span>
      </div>

      {lastMatchInfo && (
        <p className="text-xs px-3 py-1.5 rounded-lg bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-200 flex items-center gap-1.5">
          <BookOpen className="w-3.5 h-3.5 shrink-0" />
          <span>{lastMatchInfo}</span>
        </p>
      )}

      <div
        className={`grid gap-3 ${
          totalPairs <= 6
            ? 'grid-cols-3 sm:grid-cols-4'
            : totalPairs <= 8
              ? 'grid-cols-2 sm:grid-cols-4'
              : 'grid-cols-2 sm:grid-cols-4 md:grid-cols-5'
        }`}
      >
        {cards.map((card, idx) => {
          const isMatched = matchedIds.includes(card.pairId);
          const isFlipped = flippedIndices.includes(idx) || isMatched;
          return (
            <button
              key={card.key}
              type="button"
              disabled={isMatched}
              onClick={() => handleCardClick(idx)}
              className="perspective-1000 h-28 sm:h-32 w-full text-left focus:outline-none"
            >
              <div
                className={`relative h-full w-full transition-transform duration-500 transform-style-3d ${
                  isFlipped ? 'rotate-y-180' : ''
                }`}
              >
                <div className="absolute inset-0 backface-hidden rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-600/10 dark:bg-emerald-950/40 hover:bg-emerald-600/20 flex items-center justify-center">
                  <Brain className="w-6 h-6 text-emerald-600 dark:text-emerald-400 opacity-75" />
                </div>

                <div
                  className={`absolute inset-0 backface-hidden rotate-y-180 rounded-xl border p-2.5 flex flex-col justify-between overflow-hidden ${
                    isMatched
                      ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-500 text-emerald-900 dark:text-emerald-200'
                      : 'bg-white dark:bg-[#111827] border-emerald-400 text-slate-900 dark:text-slate-100'
                  }`}
                >
                  <span className="text-[10px] font-semibold text-emerald-600 dark:text-emerald-400 truncate">
                    {card.kind === 'term' ? 'Begrip' : 'Uitleg'} · {card.sourceTitle}
                  </span>
                  <span className="text-xs font-medium leading-snug line-clamp-4">
                    {card.label}
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
