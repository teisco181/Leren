import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ArrowUp, BookOpen, Flame, ShieldAlert, Sparkles } from 'lucide-react';
import { checkSoloGameSufficiency, getStrictQuestions } from '../../../lib/newGamesData';
import { playGameSound } from '../../../lib/gameAudio';
import {
  calculateDutchGrade,
  GAME_THEMES,
  GameDifficulty,
  GameResultScreen,
  GameStartScreen,
} from '../GameShell';
import type { OriginalGameProps } from './OriginalGamesStage';

interface Platform {
  id: number;
  x: number;
  y: number;
  w: number;
  tier: number;
  unlocked: boolean;
  moving?: boolean;
  dir?: number;
}

const theme = GAME_THEMES.orange;

const INITIAL_PLATFORMS: Platform[] = [
  { id: 0, x: 10, y: 12, w: 80, tier: 0, unlocked: true },
  { id: 1, x: 14, y: 28, w: 28, tier: 1, unlocked: true, moving: true, dir: 1 },
  { id: 2, x: 56, y: 28, w: 30, tier: 1, unlocked: false },
  { id: 3, x: 26, y: 46, w: 32, tier: 2, unlocked: false },
  { id: 4, x: 64, y: 46, w: 24, tier: 2, unlocked: true, moving: true, dir: -1 },
  { id: 5, x: 15, y: 64, w: 30, tier: 3, unlocked: false },
  { id: 6, x: 52, y: 64, w: 32, tier: 3, unlocked: true },
  { id: 7, x: 32, y: 82, w: 36, tier: 4, unlocked: false },
];

export const FloorIsLavaGame: React.FC<OriginalGameProps> = ({
  material,
  studySet,
  soundEnabled,
  onSaveProgress,
  onExit,
}) => {
  const source = material ?? studySet;
  const questions = useMemo(() => getStrictQuestions(source), [source]);

  const insufficientReason = useMemo(() => {
    if (material) {
      const check = checkSoloGameSufficiency('floor-is-lava', material);
      if (!check.ok) return check.reason;
    }
    if (questions.length < 2) {
      return `The Floor is Lava vereist minimaal 2 vragen uit jouw geselecteerde leerstof (gevonden: ${questions.length}).`;
    }
    return undefined;
  }, [material, questions.length]);

  const sourceLabel = material
    ? material.fileStatuses.filter((f) => f.readable).map((f) => f.title).join(', ') || material.title
    : studySet?.sourceTitle || studySet?.title || 'Geselecteerde leerstof';

  const [phase, setPhase] = useState<'start' | 'play' | 'result'>('start');
  const [difficulty, setDifficulty] = useState<GameDifficulty>('normal');

  const [platforms, setPlatforms] = useState<Platform[]>(INITIAL_PLATFORMS);
  const [player, setPlayer] = useState({ x: 50, y: 16, vx: 0, vy: 0, onGround: true });
  const [lavaHeight, setLavaHeight] = useState(4);
  const [qIdx, setQIdx] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [wrong, setWrong] = useState(0);
  const [score, setScore] = useState(0);
  const [statusMsg, setStatusMsg] = useState(
    'Beantwoord bronvragen om veilige platformen vrij te spelen en klim omhoog!'
  );
  const [reachedTop, setReachedTop] = useState(false);

  const keysRef = useRef<{ left: boolean; right: boolean; jump: boolean }>({
    left: false,
    right: false,
    jump: false,
  });
  const platformsRef = useRef(platforms);
  platformsRef.current = platforms;

  const lavaRisePerTick = difficulty === 'easy' ? 0.045 : difficulty === 'hard' ? 0.11 : 0.075;

  const startGame = () => {
    if (insufficientReason) return;
    setPlatforms(INITIAL_PLATFORMS.map((p) => ({ ...p })));
    setPlayer({ x: 50, y: 16, vx: 0, vy: 0, onGround: true });
    setLavaHeight(4);
    setQIdx(0);
    setCorrect(0);
    setWrong(0);
    setScore(0);
    setReachedTop(false);
    setStatusMsg('Spring met pijltjestoetsen / knoppen en speel platformen vrij met vragen uit jouw leerstof!');
    setPhase('play');
  };

  useEffect(() => {
    if (phase === 'result') {
      onSaveProgress?.({
        difficulty,
        score,
        completed: true,
        progress: JSON.stringify({ reachedTop, correct, wrong, score }),
      });
    }
  }, [phase]);

  useEffect(() => {
    if (phase !== 'play') return;
    const onDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keysRef.current.left = true;
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keysRef.current.right = true;
      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W' || e.key === ' ') {
        e.preventDefault();
        keysRef.current.jump = true;
      }
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') keysRef.current.left = false;
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') keysRef.current.right = false;
      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W' || e.key === ' ') {
        keysRef.current.jump = false;
      }
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
    };
  }, [phase]);

  useEffect(() => {
    if (phase !== 'play') return;

    const id = window.setInterval(() => {
      setPlatforms((prev) =>
        prev.map((p) => {
          if (!p.moving) return p;
          let nx = p.x + (p.dir || 1) * 0.45;
          let ndir = p.dir || 1;
          if (nx < 6) {
            nx = 6;
            ndir = 1;
          } else if (nx + p.w > 94) {
            nx = 94 - p.w;
            ndir = -1;
          }
          return { ...p, x: nx, dir: ndir };
        })
      );

      setLavaHeight((lh) => lh + lavaRisePerTick);

      setPlayer((pl) => {
        let vx = 0;
        if (keysRef.current.left) vx -= 1.65;
        if (keysRef.current.right) vx += 1.65;

        let vy = pl.vy - 0.34;
        let onGround = false;

        if (keysRef.current.jump && pl.onGround) {
          vy = 4.35;
          playGameSound('click', soundEnabled);
        }

        const nx = Math.max(4, Math.min(96, pl.x + vx));
        let ny = pl.y + vy;

        if (vy <= 0) {
          for (const plat of platformsRef.current) {
            if (!plat.unlocked) continue;
            const withinX = nx >= plat.x - 2 && nx <= plat.x + plat.w + 2;
            const crossedTop = pl.y >= plat.y + 2 && ny <= plat.y + 3.2;
            if (withinX && crossedTop) {
              ny = plat.y + 2.8;
              vy = 0;
              onGround = true;

              if (plat.id === 7) {
                setReachedTop(true);
                setScore((s) => s + 300);
                playGameSound('win', soundEnabled);
                setPhase('result');
              }
              break;
            }
          }
        }

        return { x: nx, y: Math.max(0, ny), vx, vy, onGround };
      });
    }, 33);

    return () => window.clearInterval(id);
  }, [phase, lavaRisePerTick, soundEnabled]);

  useEffect(() => {
    if (phase !== 'play') return;
    if (player.y <= lavaHeight + 1.5) {
      playGameSound('wrong', soundEnabled);
      setPhase('result');
    }
  }, [phase, player.y, lavaHeight, soundEnabled]);

  const currentQuestion = questions[qIdx % Math.max(questions.length, 1)];

  const handleAnswer = (optIdx: number) => {
    if (!currentQuestion || phase !== 'play') return;
    if (optIdx === currentQuestion.correctIndex) {
      playGameSound('correct', soundEnabled);
      setCorrect((c) => c + 1);
      setScore((s) => s + 120);
      setLavaHeight((lh) => Math.max(4, lh - 7));

      setPlatforms((prev) => {
        const nextLockedIdx = prev.findIndex((p) => !p.unlocked);
        if (nextLockedIdx === -1) return prev;
        return prev.map((p, idx) => (idx === nextLockedIdx ? { ...p, unlocked: true } : p));
      });
      setStatusMsg(`Goed! Platform vrijgespeeld. ${currentQuestion.explanation}`);
    } else {
      playGameSound('wrong', soundEnabled);
      setWrong((w) => w + 1);
      setLavaHeight((lh) => lh + 4);
      setStatusMsg(
        `Fout! De lava stijgt sneller. Juist antwoord: "${currentQuestion.options[currentQuestion.correctIndex]}". ${currentQuestion.explanation}`
      );
    }
    setQIdx((i) => i + 1);
  };

  if (phase === 'start') {
    return (
      <GameStartScreen
        title="The Floor is Lava – Denk snel!"
        description="De gloeiende lava stijgt! Spring over de platformen en beantwoord vragen uit jouw geselecteerde leerstof om de hogere veilige routes vrij te spelen."
        durationLabel="5–8 min · 2D Platformer"
        theme={theme}
        icon={<Flame className="w-6 h-6" />}
        difficulty={difficulty}
        onChangeDifficulty={setDifficulty}
        sourceLabel={sourceLabel}
        insufficientReason={insufficientReason}
        onStart={startGame}
      />
    );
  }

  if (phase === 'result') {
    const grade = calculateDutchGrade(correct, wrong, reachedTop ? 0.8 : player.y / 120);
    return (
      <GameResultScreen
        title="The Floor is Lava"
        score={score}
        correct={correct}
        wrong={wrong}
        grade={grade}
        evaluation={
          reachedTop
            ? 'Top bereikt! Je hebt alle veilige platformen gehaald en de lava voorgebleven!'
            : 'De lava haalde je in! Probeer sneller de veilige platformen vrij te spelen.'
        }
        extraStats={[{ label: 'Hoogte bereikt', value: `${Math.round(player.y)}%` }]}
        sourceSummary={sourceLabel}
        theme={theme}
        onReplay={startGame}
        onExit={onExit}
      />
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
      <div className="lg:col-span-7 space-y-3">
        <div className="flex items-center justify-between text-xs tabular-nums">
          <span className="font-semibold text-orange-600 dark:text-orange-400 flex items-center gap-1">
            <Flame className="w-4 h-4" />
            Lava hoogte: {Math.round(lavaHeight)}%
          </span>
          <span className="text-slate-600 dark:text-slate-400">
            Jouw hoogte: {Math.round(player.y)}%
          </span>
          <span className="font-mono font-bold text-orange-600 dark:text-orange-400">
            {score} ptn
          </span>
        </div>

        <div className="relative h-[340px] w-full rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden select-none">
          <div className="absolute top-2 inset-x-0 text-center text-[11px] font-bold text-emerald-300 z-10">
            FINISH PLATFORM ↑
          </div>

          {platforms.map((p) => (
            <div
              key={p.id}
              style={{
                left: `${p.x}%`,
                bottom: `${p.y}%`,
                width: `${p.w}%`,
              }}
              className={`absolute h-3.5 rounded-full transition-colors ${
                p.id === 7 && p.unlocked
                  ? 'bg-emerald-400 border border-emerald-200 shadow-md'
                  : p.unlocked
                    ? 'bg-slate-200 border border-white'
                    : 'bg-slate-700/40 border border-dashed border-orange-400/60'
              }`}
            />
          ))}

          <div
            style={{
              left: `${player.x}%`,
              bottom: `${player.y}%`,
              transform: 'translate(-50%, 0)',
            }}
            className="absolute w-6 h-7 rounded-lg bg-indigo-500 border-2 border-white shadow-md flex items-center justify-center text-[10px] font-bold text-white z-20"
          >
            ★
          </div>

          <div
            style={{ height: `${Math.min(100, lavaHeight)}%` }}
            className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-red-700 via-orange-600 to-amber-500/90 border-t-2 border-amber-300 z-30"
          />
        </div>

        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onPointerDown={() => (keysRef.current.left = true)}
            onPointerUp={() => (keysRef.current.left = false)}
            onPointerLeave={() => (keysRef.current.left = false)}
            className="py-3 rounded-xl bg-slate-100 dark:bg-slate-800 active:bg-orange-600 active:text-white font-bold text-sm flex items-center justify-center gap-1 select-none"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Links</span>
          </button>
          <button
            type="button"
            onPointerDown={() => (keysRef.current.jump = true)}
            onPointerUp={() => (keysRef.current.jump = false)}
            onPointerLeave={() => (keysRef.current.jump = false)}
            className="py-3 rounded-xl bg-orange-600 text-white active:bg-orange-700 font-bold text-sm flex items-center justify-center gap-1 select-none"
          >
            <ArrowUp className="w-4 h-4" />
            <span>Spring</span>
          </button>
          <button
            type="button"
            onPointerDown={() => (keysRef.current.right = true)}
            onPointerUp={() => (keysRef.current.right = false)}
            onPointerLeave={() => (keysRef.current.right = false)}
            className="py-3 rounded-xl bg-slate-100 dark:bg-slate-800 active:bg-orange-600 active:text-white font-bold text-sm flex items-center justify-center gap-1 select-none"
          >
            <span>Rechts</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="lg:col-span-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-5 space-y-4">
        <div className="flex items-center justify-between text-xs">
          <span className="font-bold text-orange-600 dark:text-orange-400 flex items-center gap-1.5">
            <Sparkles className="w-4 h-4" />
            Platform Vrijspelen
          </span>
          <span className="text-slate-500 dark:text-slate-400 tabular-nums">
            Goed: {correct} · Fout: {wrong}
          </span>
        </div>

        <p className="text-xs px-3 py-2 rounded-lg bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 flex items-start gap-2">
          <ShieldAlert className="w-4 h-4 text-orange-500 shrink-0 mt-0.5" />
          <span>{statusMsg}</span>
        </p>

        {currentQuestion && (
          <div className="space-y-3">
            <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1">
              <BookOpen className="w-3.5 h-3.5" />
              <span>Bron: {currentQuestion.sourceTitle} · {currentQuestion.sourceSection}</span>
            </p>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">
              {currentQuestion.question}
            </h3>
            <div className="space-y-2">
              {currentQuestion.options.map((opt, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleAnswer(idx)}
                  className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] hover:border-orange-500 text-left text-xs font-medium transition-colors"
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
