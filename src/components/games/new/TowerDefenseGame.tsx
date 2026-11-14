import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Castle, Flame, Heart, Play, Shield, Snowflake, Sparkles, Zap } from 'lucide-react';
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

type TowerKind = 'archer' | 'ice' | 'laser';

interface Tower {
  r: number;
  c: number;
  kind: TowerKind;
  level: number;
  cooldown: number;
}

interface Enemy {
  id: number;
  progress: number;
  hp: number;
  maxHp: number;
  speed: number;
  slowTimer: number;
}

interface ShotBeam {
  id: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
}

const COLS = 8;
const ROWS = 5;

const PATH_CELLS: Array<[number, number]> = [
  [1, 0], [1, 1], [1, 2],
  [2, 2], [3, 2],
  [3, 3], [3, 4], [3, 5],
  [2, 5], [1, 5],
  [1, 6], [1, 7],
];

const PATH_KEY_SET = new Set(PATH_CELLS.map(([r, c]) => `${r}-${c}`));

const TOWER_STATS: Record<
  TowerKind,
  { name: string; cost: number; range: number; damage: number; rate: number; color: string }
> = {
  archer: { name: 'Boog', cost: 80, range: 2.3, damage: 18, rate: 8, color: '#06b6d4' },
  ice: { name: 'IJs', cost: 110, range: 2.1, damage: 12, rate: 10, color: '#60a5fa' },
  laser: { name: 'Laser', cost: 140, range: 2.8, damage: 34, rate: 14, color: '#f43f5e' },
};

const theme = GAME_THEMES.cyan;

export const TowerDefenseGame: React.FC<OriginalGameProps> = ({
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
      const check = checkSoloGameSufficiency('tower-defense', material);
      if (!check.ok) return check.reason;
    }
    if (questions.length < 2) {
      return `Tower Defense vereist minimaal 2 vragen uit jouw geselecteerde leerstof (gevonden: ${questions.length}).`;
    }
    return undefined;
  }, [material, questions.length]);

  const sourceLabel = material
    ? material.fileStatuses.filter((f) => f.readable).map((f) => f.title).join(', ') || material.title
    : studySet?.sourceTitle || studySet?.title || 'Geselecteerde leerstof';

  const [phase, setPhase] = useState<'start' | 'play' | 'result'>('start');
  const [difficulty, setDifficulty] = useState<GameDifficulty>('normal');

  const [gold, setGold] = useState(120);
  const [baseHp, setBaseHp] = useState(10);
  const [wave, setWave] = useState(1);
  const [waveActive, setWaveActive] = useState(false);
  const [selectedTool, setSelectedTool] = useState<TowerKind>('archer');
  const [towers, setTowers] = useState<Tower[]>([]);
  const [enemies, setEnemies] = useState<Enemy[]>([]);
  const [beams, setBeams] = useState<ShotBeam[]>([]);

  const [qIdx, setQIdx] = useState(0);
  const [qFeedback, setQFeedback] = useState<string | null>(null);
  const [correct, setCorrect] = useState(0);
  const [wrong, setWrong] = useState(0);
  const [streak, setStreak] = useState(0);
  const [score, setScore] = useState(0);

  const enemySeq = useRef(1);
  const beamSeq = useRef(1);
  const spawnQueueRef = useRef<number>(0);
  const spawnCooldownRef = useRef<number>(0);

  const startGame = () => {
    if (insufficientReason) return;
    setGold(120);
    setBaseHp(10);
    setWave(1);
    setWaveActive(false);
    setTowers([]);
    setEnemies([]);
    setBeams([]);
    setQIdx(0);
    setQFeedback(null);
    setCorrect(0);
    setWrong(0);
    setStreak(0);
    setScore(0);
    spawnQueueRef.current = 0;
    setPhase('play');
  };

  const launchWave = (waveNum: number) => {
    const count = 4 + waveNum * 2;
    spawnQueueRef.current = count;
    spawnCooldownRef.current = 0;
    setWaveActive(true);
    playGameSound('click', soundEnabled);
  };

  useEffect(() => {
    if (phase !== 'play' || !waveActive) return;

    const hpMult = difficulty === 'easy' ? 0.8 : difficulty === 'hard' ? 1.3 : 1;
    const spdMult = difficulty === 'easy' ? 0.85 : difficulty === 'hard' ? 1.25 : 1;

    const id = window.setInterval(() => {
      let newlySpawned: Enemy | null = null;
      if (spawnQueueRef.current > 0) {
        if (spawnCooldownRef.current <= 0) {
          const maxHp = Math.round((45 + wave * 28) * hpMult);
          newlySpawned = {
            id: enemySeq.current++,
            progress: 0,
            hp: maxHp,
            maxHp,
            speed: (0.045 + wave * 0.008) * spdMult,
            slowTimer: 0,
          };
          spawnQueueRef.current -= 1;
          spawnCooldownRef.current = 18;
        } else {
          spawnCooldownRef.current -= 1;
        }
      }

      setEnemies((prevEnemies) => {
        const list = newlySpawned ? [...prevEnemies, newlySpawned] : [...prevEnemies];
        let leaks = 0;

        const moved: Enemy[] = [];
        for (const en of list) {
          const slowFactor = en.slowTimer > 0 ? 0.55 : 1;
          const nextProg = en.progress + en.speed * slowFactor;
          if (nextProg >= PATH_CELLS.length - 1) {
            leaks += 1;
          } else {
            moved.push({
              ...en,
              progress: nextProg,
              slowTimer: Math.max(0, en.slowTimer - 1),
            });
          }
        }

        if (leaks > 0) {
          playGameSound('wrong', soundEnabled);
          setBaseHp((hp) => {
            const nextHp = Math.max(0, hp - leaks);
            if (nextHp === 0) setPhase('result');
            return nextHp;
          });
        }

        const newBeams: ShotBeam[] = [];
        setTowers((prevTowers) =>
          prevTowers.map((t) => {
            if (t.cooldown > 0) return { ...t, cooldown: t.cooldown - 1 };
            const spec = TOWER_STATS[t.kind];
            let targetIdx = -1;
            let bestProg = -1;
            moved.forEach((en, idx) => {
              const pFloor = Math.floor(en.progress);
              const pNext = Math.min(PATH_CELLS.length - 1, pFloor + 1);
              const frac = en.progress - pFloor;
              const er = PATH_CELLS[pFloor][0] * (1 - frac) + PATH_CELLS[pNext][0] * frac;
              const ec = PATH_CELLS[pFloor][1] * (1 - frac) + PATH_CELLS[pNext][1] * frac;
              const dist = Math.hypot(er - t.r, ec - t.c);
              if (dist <= spec.range + (t.level - 1) * 0.3 && en.progress > bestProg && en.hp > 0) {
                bestProg = en.progress;
                targetIdx = idx;
              }
            });

            if (targetIdx !== -1) {
              const target = moved[targetIdx];
              const dmg = spec.damage * (1 + (t.level - 1) * 0.45);
              target.hp -= dmg;
              if (t.kind === 'ice') target.slowTimer = 20;

              const pFloor = Math.floor(target.progress);
              const pNext = Math.min(PATH_CELLS.length - 1, pFloor + 1);
              const frac = target.progress - pFloor;
              const er = PATH_CELLS[pFloor][0] * (1 - frac) + PATH_CELLS[pNext][0] * frac;
              const ec = PATH_CELLS[pFloor][1] * (1 - frac) + PATH_CELLS[pNext][1] * frac;

              newBeams.push({
                id: beamSeq.current++,
                x1: ((t.c + 0.5) / COLS) * 100,
                y1: ((t.r + 0.5) / ROWS) * 100,
                x2: ((ec + 0.5) / COLS) * 100,
                y2: ((er + 0.5) / ROWS) * 100,
                color: spec.color,
              });
              return { ...t, cooldown: spec.rate };
            }
            return t;
          })
        );

        if (newBeams.length > 0) setBeams(newBeams);
        else setBeams([]);

        const survivors = moved.filter((en) => {
          if (en.hp <= 0) {
            setGold((g) => g + 15);
            setScore((s) => s + 35);
            return false;
          }
          return true;
        });

        if (survivors.length === 0 && spawnQueueRef.current === 0) {
          setWaveActive(false);
          if (wave >= 3) {
            playGameSound('win', soundEnabled);
            setScore((s) => s + baseHp * 40);
            window.setTimeout(() => setPhase('result'), 500);
          } else {
            setWave((w) => w + 1);
            playGameSound('correct', soundEnabled);
          }
        }

        return survivors;
      });
    }, 90);

    return () => window.clearInterval(id);
  }, [phase, waveActive, wave, difficulty, baseHp, soundEnabled]);

  useEffect(() => {
    if (phase === 'result') {
      onSaveProgress?.({
        difficulty,
        score,
        completed: true,
        progress: JSON.stringify({ wave, baseHp, score }),
      });
    }
  }, [phase]);

  const handleTileClick = (r: number, c: number) => {
    if (PATH_KEY_SET.has(`${r}-${c}`)) return;
    const existing = towers.find((t) => t.r === r && t.c === c);
    if (existing) {
      const upgradeCost = 90 * existing.level;
      if (existing.level >= 3) {
        setQFeedback('Deze toren staat al op het hoogste niveau (Lv. 3).');
        return;
      }
      if (gold < upgradeCost) {
        setQFeedback(`Niet genoeg goud voor upgrade (${upgradeCost} nodig). Los een bronvraag rechts op!`);
        return;
      }
      setGold((g) => g - upgradeCost);
      setTowers((prev) =>
        prev.map((t) => (t.r === r && t.c === c ? { ...t, level: t.level + 1 } : t))
      );
      playGameSound('correct', soundEnabled);
      setQFeedback(`Toren verbeterd naar Level ${existing.level + 1}!`);
      return;
    }

    const cost = TOWER_STATS[selectedTool].cost;
    if (gold < cost) {
      setQFeedback(`Je hebt ${cost} goud nodig voor een ${TOWER_STATS[selectedTool].name}-toren. Beantwoord een bronvraag!`);
      return;
    }
    setGold((g) => g - cost);
    setTowers((prev) => [...prev, { r, c, kind: selectedTool, level: 1, cooldown: 0 }]);
    playGameSound('click', soundEnabled);
    setQFeedback(null);
  };

  const currentQuestion = questions[qIdx % Math.max(questions.length, 1)];

  const handleAnswerQuestion = (optIdx: number) => {
    if (!currentQuestion) return;
    if (optIdx === currentQuestion.correctIndex) {
      const nextStreak = streak + 1;
      setStreak(nextStreak);
      setCorrect((c) => c + 1);
      setGold((g) => g + 85);
      setScore((s) => s + 100);
      playGameSound('correct', soundEnabled);

      if (nextStreak % 3 === 0 && towers.some((t) => t.level < 3)) {
        setTowers((prev) => {
          const idx = prev.findIndex((t) => t.level < 3);
          if (idx === -1) return prev;
          return prev.map((t, i) => (i === idx ? { ...t, level: t.level + 1 } : t));
        });
        setQFeedback(`3 op rij! +85 goud EN toren geüpgraded! (${currentQuestion.explanation})`);
      } else {
        setQFeedback(`Goed! +85 goud. ${currentQuestion.explanation}`);
      }
    } else {
      setStreak(0);
      setWrong((w) => w + 1);
      playGameSound('wrong', soundEnabled);
      setQFeedback(
        `Helaas fout! Juiste antwoord: "${currentQuestion.options[currentQuestion.correctIndex]}". ${currentQuestion.explanation}`
      );
    }
    setQIdx((i) => i + 1);
  };

  if (phase === 'start') {
    return (
      <GameStartScreen
        title="Tower Defense: Knowledge Edition"
        description="Verdedig je basis tegen 3 golven vijanden! Beantwoord vragen uit jouw geselecteerde leerstof om goud te verdienen en verdedigingstorens te bouwen."
        durationLabel="6–9 min · Strategie"
        theme={theme}
        icon={<Castle className="w-6 h-6" />}
        difficulty={difficulty}
        onChangeDifficulty={setDifficulty}
        sourceLabel={sourceLabel}
        insufficientReason={insufficientReason}
        onStart={startGame}
      />
    );
  }

  if (phase === 'result') {
    const grade = calculateDutchGrade(correct, wrong, baseHp / 10);
    return (
      <GameResultScreen
        title="Tower Defense: Knowledge Edition"
        score={score}
        correct={correct}
        wrong={wrong}
        grade={grade}
        extraStats={[
          { label: 'Basis HP over', value: `${baseHp} / 10` },
          { label: 'Torens gebouwd', value: `${towers.length}` },
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
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs tabular-nums">
        <div className="flex items-center gap-4">
          <span className="font-bold text-red-600 dark:text-red-400 flex items-center gap-1">
            <Heart className="w-4 h-4" />
            Basis HP: {baseHp}/10
          </span>
          <span className="font-mono font-bold text-amber-600 dark:text-amber-400">
            Goud: {gold}
          </span>
          <span className="font-semibold text-cyan-600 dark:text-cyan-400">
            Golf {wave} / 3
          </span>
        </div>

        <button
          type="button"
          disabled={waveActive}
          onClick={() => launchWave(wave)}
          className="px-4 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-700 text-white font-semibold inline-flex items-center gap-1.5 disabled:opacity-50"
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          <span>{waveActive ? `Golf ${wave} bezig...` : `Start Golf ${wave}`}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <div className="lg:col-span-7 space-y-3">
          <div className="grid grid-cols-3 gap-2">
            {([
              { id: 'archer' as const, icon: Shield, label: 'Boog (80g)' },
              { id: 'ice' as const, icon: Snowflake, label: 'IJs (110g)' },
              { id: 'laser' as const, icon: Zap, label: 'Laser (140g)' },
            ]).map((tool) => {
              const Icon = tool.icon;
              return (
                <button
                  key={tool.id}
                  type="button"
                  onClick={() => setSelectedTool(tool.id)}
                  className={`py-2 px-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 ${
                    selectedTool === tool.id
                      ? 'bg-cyan-600 border-cyan-600 text-white'
                      : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{tool.label}</span>
                </button>
              );
            })}
          </div>

          <div className="relative rounded-2xl border border-slate-200 dark:border-slate-800 bg-emerald-950/15 dark:bg-slate-900 p-2 overflow-hidden">
            <div className="grid grid-cols-8 gap-1">
              {Array.from({ length: ROWS }).map((_, r) =>
                Array.from({ length: COLS }).map((__, c) => {
                  const isPath = PATH_KEY_SET.has(`${r}-${c}`);
                  const isStart = r === 1 && c === 0;
                  const isBase = r === 1 && c === 7;
                  const tower = towers.find((t) => t.r === r && t.c === c);

                  return (
                    <button
                      key={`${r}-${c}`}
                      type="button"
                      disabled={isPath}
                      onClick={() => handleTileClick(r, c)}
                      className={`aspect-square rounded-lg flex flex-col items-center justify-center text-[10px] font-bold transition-colors ${
                        isStart
                          ? 'bg-amber-500/25 border border-amber-500/40 text-amber-700 dark:text-amber-300'
                          : isBase
                            ? 'bg-cyan-500/25 border border-cyan-500/50 text-cyan-700 dark:text-cyan-300'
                            : isPath
                              ? 'bg-amber-200/50 dark:bg-amber-950/40 border border-amber-300/40 dark:border-amber-900/40'
                              : tower
                                ? 'bg-cyan-600 text-white border border-cyan-400'
                                : 'bg-white/80 dark:bg-[#111827] border border-slate-200 dark:border-slate-800 hover:border-cyan-400'
                      }`}
                    >
                      {isStart && 'START'}
                      {isBase && 'BASIS'}
                      {tower && (
                        <>
                          <span>{TOWER_STATS[tower.kind].name}</span>
                          <span className="text-[9px] opacity-90">Lv.{tower.level}</span>
                        </>
                      )}
                    </button>
                  );
                })
              )}
            </div>

            <svg
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              className="absolute inset-2 w-[calc(100%-1rem)] h-[calc(100%-1rem)] pointer-events-none"
            >
              {beams.map((b) => (
                <line
                  key={b.id}
                  x1={b.x1}
                  y1={b.y1}
                  x2={b.x2}
                  y2={b.y2}
                  stroke={b.color}
                  strokeWidth="0.9"
                  strokeLinecap="round"
                />
              ))}
              {enemies.map((en) => {
                const pFloor = Math.floor(en.progress);
                const pNext = Math.min(PATH_CELLS.length - 1, pFloor + 1);
                const frac = en.progress - pFloor;
                const er = PATH_CELLS[pFloor][0] * (1 - frac) + PATH_CELLS[pNext][0] * frac;
                const ec = PATH_CELLS[pFloor][1] * (1 - frac) + PATH_CELLS[pNext][1] * frac;
                const cx = ((ec + 0.5) / COLS) * 100;
                const cy = ((er + 0.5) / ROWS) * 100;
                const hpPct = Math.max(0, en.hp / en.maxHp);
                return (
                  <g key={en.id}>
                    <circle
                      cx={cx}
                      cy={cy}
                      r="3.2"
                      fill={en.slowTimer > 0 ? '#38bdf8' : '#ef4444'}
                      stroke="#ffffff"
                      strokeWidth="0.6"
                    />
                    <rect x={cx - 4} y={cy - 5.5} width="8" height="1.3" fill="#1e293b" rx="0.5" />
                    <rect
                      x={cx - 4}
                      y={cy - 5.5}
                      width={8 * hpPct}
                      height="1.3"
                      fill="#22c55e"
                      rx="0.5"
                    />
                  </g>
                );
              })}
            </svg>
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Tip: Klik op een leeg vak naast het pad om een toren te bouwen, of op een bestaande toren om te upgraden.
          </p>
        </div>

        <div className="lg:col-span-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-5 space-y-4">
          <div className="flex items-center justify-between text-xs">
            <span className="font-bold text-cyan-600 dark:text-cyan-400 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4" />
              Verdien Goud (+85g)
            </span>
            <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400 font-semibold">
              <Flame className="w-3.5 h-3.5" />
              Reeks {streak}x
            </span>
          </div>

          {qFeedback && (
            <p className="text-xs font-medium px-3 py-2 rounded-lg bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300">
              {qFeedback}
            </p>
          )}

          {currentQuestion && (
            <div className="space-y-3">
              <p className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1">
                <BookOpen className="w-3.5 h-3.5" />
                <span>Bron: {currentQuestion.sourceTitle} · {currentQuestion.sourceSection}</span>
              </p>
              <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
                {currentQuestion.question}
              </p>
              <div className="space-y-2">
                {currentQuestion.options.map((opt, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleAnswerQuestion(idx)}
                    className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] hover:border-cyan-500 text-left text-xs font-medium transition-colors"
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
