import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, Bot, CheckCircle2, Swords, Timer, User, XCircle } from 'lucide-react';
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

const theme = GAME_THEMES.rose;

export const BrainBattleGame: React.FC<OriginalGameProps> = ({
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
      const check = checkSoloGameSufficiency('brain-battle', material);
      if (!check.ok) return check.reason;
    }
    if (questions.length < 2) {
      return `Brain Battle vereist minimaal 2 vragen uit jouw gekozen bestanden (gevonden: ${questions.length}).`;
    }
    return undefined;
  }, [material, questions.length]);

  const sourceLabel = material
    ? material.fileStatuses.filter((f) => f.readable).map((f) => f.title).join(', ') || material.title
    : studySet?.sourceTitle || studySet?.title || 'Geselecteerde leerstof';

  const [phase, setPhase] = useState<'start' | 'play' | 'result'>('start');
  const [difficulty, setDifficulty] = useState<GameDifficulty>('normal');

  const [idx, setIdx] = useState(0);
  const [timeLeft, setTimeLeft] = useState(120);
  const [playerScore, setPlayerScore] = useState(0);
  const [botScore, setBotScore] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [wrong, setWrong] = useState(0);
  const [roundOutcome, setRoundOutcome] = useState<string | null>(null);
  const [chosenOpt, setChosenOpt] = useState<number | null>(null);

  const totalQuestions = Math.min(questions.length, 10);
  const botDelayMs = difficulty === 'easy' ? 6200 : difficulty === 'hard' ? 2400 : 4100;
  const botName =
    difficulty === 'easy' ? 'Leerling Bot' : difficulty === 'hard' ? 'Prof. Turbo' : 'Rivaal Lisa';

  const startGame = () => {
    if (insufficientReason) return;
    setIdx(0);
    setTimeLeft(120);
    setPlayerScore(0);
    setBotScore(0);
    setCorrect(0);
    setWrong(0);
    setRoundOutcome(null);
    setChosenOpt(null);
    setPhase('play');
  };

  useEffect(() => {
    if (phase !== 'play') return;
    const id = window.setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          setPhase('result');
          return 0;
        }
        return t - 1;
      });
    }, 1000);
    return () => window.clearInterval(id);
  }, [phase]);

  useEffect(() => {
    if (phase === 'result') {
      onSaveProgress?.({
        difficulty,
        score: playerScore,
        completed: true,
        progress: JSON.stringify({ playerScore, botScore, correct, wrong }),
      });
    }
  }, [phase]);

  useEffect(() => {
    if (phase !== 'play' || roundOutcome !== null) return;
    const q = questions[idx];
    if (!q) return;

    const jitter = (Math.random() - 0.5) * 900;
    const id = window.setTimeout(() => {
      const botAccurate = Math.random() < (difficulty === 'easy' ? 0.65 : 0.85);
      if (botAccurate) {
        setBotScore((b) => b + 100);
        setRoundOutcome(`${botName} was sneller! Uitleg uit je bron: ${q.explanation}`);
        playGameSound('wrong', soundEnabled);
      } else {
        setRoundOutcome(`${botName} gokte fout! Juiste antwoord: "${q.options[q.correctIndex]}". ${q.explanation}`);
      }
      setChosenOpt(-1);
    }, Math.max(1200, botDelayMs + jitter));

    return () => window.clearTimeout(id);
  }, [phase, idx, roundOutcome, questions, difficulty, botDelayMs, botName, soundEnabled]);

  const current = questions[idx];

  const handlePlayerPick = (optIdx: number) => {
    if (roundOutcome !== null || !current) return;
    setChosenOpt(optIdx);
    if (optIdx === current.correctIndex) {
      setPlayerScore((p) => p + 120);
      setCorrect((c) => c + 1);
      setRoundOutcome(`Jij was het snelst met het goede antwoord (+120 ptn)! ${current.explanation}`);
      playGameSound('correct', soundEnabled);
    } else {
      setWrong((w) => w + 1);
      setBotScore((b) => b + 60);
      setRoundOutcome(`Helaas fout! Juiste antwoord: "${current.options[current.correctIndex]}". ${current.explanation}`);
      playGameSound('wrong', soundEnabled);
    }
  };

  const nextQuestion = () => {
    if (idx + 1 >= totalQuestions) {
      playGameSound('win', soundEnabled);
      setPhase('result');
    } else {
      setIdx((i) => i + 1);
      setRoundOutcome(null);
      setChosenOpt(null);
    }
  };

  if (phase === 'start') {
    return (
      <GameStartScreen
        title="Brain Battle – De kennisarena"
        description="Neem het in een korte wedstrijd van maximaal 2 minuten op tegen een virtuele tegenstander met uitsluitend vragen uit jouw gekozen bestanden."
        durationLabel="5 min · Kennisarena"
        theme={theme}
        icon={<Swords className="w-6 h-6" />}
        difficulty={difficulty}
        onChangeDifficulty={setDifficulty}
        sourceLabel={sourceLabel}
        insufficientReason={insufficientReason}
        onStart={startGame}
      />
    );
  }

  if (phase === 'result') {
    const won = playerScore >= botScore;
    const grade = calculateDutchGrade(correct, wrong, won ? 0.5 : 0);
    return (
      <GameResultScreen
        title="Brain Battle"
        score={playerScore}
        correct={correct}
        wrong={wrong}
        grade={grade}
        evaluation={
          won
            ? `Gewonnen van ${botName} (${playerScore} vs. ${botScore} ptn)!`
            : `${botName} was deze ronde net iets sneller (${botScore} vs. ${playerScore} ptn). Probeer nog eens!`
        }
        extraStats={[
          { label: 'Jouw score', value: `${playerScore}` },
          { label: botName, value: `${botScore}` },
        ]}
        sourceSummary={sourceLabel}
        theme={theme}
        onReplay={startGame}
        onExit={onExit}
      />
    );
  }

  const maxBar = Math.max(totalQuestions * 120, 600);

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="rounded-2xl border border-rose-200 dark:border-rose-900 bg-rose-50/50 dark:bg-rose-950/20 p-4 space-y-3">
        <div className="flex items-center justify-between text-xs tabular-nums">
          <span className="font-semibold text-slate-600 dark:text-slate-400">
            Ronde {idx + 1} / {totalQuestions}
          </span>
          <span className="font-mono font-bold text-rose-600 dark:text-rose-400 flex items-center gap-1">
            <Timer className="w-3.5 h-3.5" />
            {timeLeft}s
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs font-bold">
              <span className="flex items-center gap-1.5 text-slate-900 dark:text-slate-100">
                <User className="w-3.5 h-3.5 text-rose-600" />
                Jij
              </span>
              <span className="font-mono tabular-nums">{playerScore} ptn</span>
            </div>
            <div className="h-2.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-rose-600 transition-all"
                style={{ width: `${Math.min(100, (playerScore / maxBar) * 100)}%` }}
              />
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs font-bold">
              <span className="flex items-center gap-1.5 text-slate-900 dark:text-slate-100">
                <Bot className="w-3.5 h-3.5 text-slate-500" />
                {botName}
              </span>
              <span className="font-mono tabular-nums">{botScore} ptn</span>
            </div>
            <div className="h-2.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
              <div
                className="h-full bg-slate-500 transition-all"
                style={{ width: `${Math.min(100, (botScore / maxBar) * 100)}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {current && (
        <>
          <div className="space-y-1">
            <p className="text-[11px] font-medium text-rose-600 dark:text-rose-400 flex items-center gap-1">
              <BookOpen className="w-3.5 h-3.5" />
              <span>Bron: {current.sourceTitle} · {current.sourceSection}</span>
            </p>
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              {current.question}
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {current.options.map((opt, oIdx) => {
              const reveal = roundOutcome !== null;
              const isRight = oIdx === current.correctIndex;
              const isPicked = chosenOpt === oIdx;
              return (
                <button
                  key={oIdx}
                  type="button"
                  disabled={reveal}
                  onClick={() => handlePlayerPick(oIdx)}
                  className={`p-4 rounded-xl border text-left text-sm font-medium flex items-start justify-between gap-2 transition-colors ${
                    !reveal
                      ? 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-rose-500'
                      : isRight
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500 text-emerald-900 dark:text-emerald-200'
                        : isPicked
                          ? 'bg-red-50 dark:bg-red-950/40 border-red-500 text-red-900 dark:text-red-200'
                          : 'bg-slate-50/50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800 text-slate-400'
                  }`}
                >
                  <span>{opt}</span>
                  {reveal && isRight && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
                  {reveal && isPicked && !isRight && <XCircle className="w-4 h-4 text-red-600 shrink-0" />}
                </button>
              );
            })}
          </div>
        </>
      )}

      {roundOutcome && (
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
          <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">{roundOutcome}</p>
          <button
            type="button"
            onClick={nextQuestion}
            className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold shrink-0"
          >
            {idx + 1 >= totalQuestions ? 'Eindstand bekijken' : 'Volgende ronde'}
          </button>
        </div>
      )}
    </div>
  );
};
