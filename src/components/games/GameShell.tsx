import React from 'react';
import {
  Award,
  Clock,
  Play,
  RotateCcw,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  Gauge,
} from 'lucide-react';

export type GameDifficulty = 'easy' | 'normal' | 'hard';

export interface GameTheme {
  accentText: string;
  accentBg: string;
  accentHover: string;
  accentSoftBg: string;
  accentBorder: string;
}

export const GAME_THEMES: Record<string, GameTheme> = {
  amber: {
    accentText: 'text-amber-600 dark:text-amber-400',
    accentBg: 'bg-amber-600',
    accentHover: 'hover:bg-amber-700',
    accentSoftBg: 'bg-amber-50 dark:bg-amber-950/30',
    accentBorder: 'border-amber-200 dark:border-amber-800',
  },
  emerald: {
    accentText: 'text-emerald-600 dark:text-emerald-400',
    accentBg: 'bg-emerald-600',
    accentHover: 'hover:bg-emerald-700',
    accentSoftBg: 'bg-emerald-50 dark:bg-emerald-950/30',
    accentBorder: 'border-emerald-200 dark:border-emerald-800',
  },
  violet: {
    accentText: 'text-violet-600 dark:text-violet-400',
    accentBg: 'bg-violet-600',
    accentHover: 'hover:bg-violet-700',
    accentSoftBg: 'bg-violet-50 dark:bg-violet-950/30',
    accentBorder: 'border-violet-200 dark:border-violet-800',
  },
  cyan: {
    accentText: 'text-cyan-600 dark:text-cyan-400',
    accentBg: 'bg-cyan-600',
    accentHover: 'hover:bg-cyan-700',
    accentSoftBg: 'bg-cyan-50 dark:bg-cyan-950/30',
    accentBorder: 'border-cyan-200 dark:border-cyan-800',
  },
  pink: {
    accentText: 'text-pink-600 dark:text-pink-400',
    accentBg: 'bg-pink-600',
    accentHover: 'hover:bg-pink-700',
    accentSoftBg: 'bg-pink-50 dark:bg-pink-950/30',
    accentBorder: 'border-pink-200 dark:border-pink-800',
  },
  rose: {
    accentText: 'text-rose-600 dark:text-rose-400',
    accentBg: 'bg-rose-600',
    accentHover: 'hover:bg-rose-700',
    accentSoftBg: 'bg-rose-50 dark:bg-rose-950/30',
    accentBorder: 'border-rose-200 dark:border-rose-800',
  },
  sky: {
    accentText: 'text-sky-600 dark:text-sky-400',
    accentBg: 'bg-sky-600',
    accentHover: 'hover:bg-sky-700',
    accentSoftBg: 'bg-sky-50 dark:bg-sky-950/30',
    accentBorder: 'border-sky-200 dark:border-sky-800',
  },
  lime: {
    accentText: 'text-lime-600 dark:text-lime-400',
    accentBg: 'bg-lime-600',
    accentHover: 'hover:bg-lime-700',
    accentSoftBg: 'bg-lime-50 dark:bg-lime-950/30',
    accentBorder: 'border-lime-200 dark:border-lime-800',
  },
  orange: {
    accentText: 'text-orange-600 dark:text-orange-400',
    accentBg: 'bg-orange-600',
    accentHover: 'hover:bg-orange-700',
    accentSoftBg: 'bg-orange-50 dark:bg-orange-950/30',
    accentBorder: 'border-orange-200 dark:border-orange-800',
  },
  indigo: {
    accentText: 'text-indigo-600 dark:text-indigo-400',
    accentBg: 'bg-indigo-600',
    accentHover: 'hover:bg-indigo-700',
    accentSoftBg: 'bg-indigo-50 dark:bg-indigo-950/30',
    accentBorder: 'border-indigo-200 dark:border-indigo-800',
  },
};

export function calculateDutchGrade(
  correct: number,
  wrong: number,
  bonusRatio = 0
): number {
  const total = correct + wrong;
  if (total === 0) {
    return Number(Math.min(10, Math.max(1, 5.5 + bonusRatio * 4.5)).toFixed(1));
  }
  const accuracy = correct / total;
  const raw = 1 + accuracy * 8.5 + Math.min(0.5, Math.max(0, bonusRatio * 0.5));
  return Number(Math.min(10, Math.max(1, raw)).toFixed(1));
}

export function getGradeEvaluation(grade: number): string {
  if (grade >= 9) return 'Uitmuntend! Je beheerst deze leerstof tot in de puntjes.';
  if (grade >= 7.5) return 'Erg sterk gespeeld! Je kent de begrippen en verbanden goed.';
  if (grade >= 6) return 'Voldoende! Je bent goed op weg, blijf de lastige begrippen herhalen.';
  if (grade >= 4.5) return 'Bijna daar! Speel nog een ronde om de definities scherper te krijgen.';
  return 'Goede start! Bekijk de uitleg bij foute antwoorden en probeer het nog een keer.';
}

interface GameStartScreenProps {
  title: string;
  description: string;
  durationLabel: string;
  theme: GameTheme;
  icon: React.ReactNode;
  difficulty: GameDifficulty;
  onChangeDifficulty: (d: GameDifficulty) => void;
  showDifficulty?: boolean;
  onStart: () => void;
  sourceLabel?: string;
  insufficientReason?: string;
}

export const GameStartScreen: React.FC<GameStartScreenProps> = ({
  title,
  description,
  durationLabel,
  theme,
  icon,
  difficulty,
  onChangeDifficulty,
  showDifficulty = true,
  onStart,
  sourceLabel,
  insufficientReason,
}) => {
  return (
    <div className="max-w-2xl mx-auto py-4 space-y-6">
      <div className={`rounded-2xl border ${theme.accentBorder} ${theme.accentSoftBg} p-6 sm:p-8 space-y-5`}>
        <div className="flex items-start gap-4">
          <div className={`w-12 h-12 rounded-xl ${theme.accentBg} text-white flex items-center justify-center shrink-0 shadow-sm`}>
            {icon}
          </div>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
              <span className="inline-flex items-center gap-1 font-medium">
                <Clock className="w-3.5 h-3.5" />
                {durationLabel}
              </span>
              {sourceLabel && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="font-medium">Leerstof: {sourceLabel}</span>
                </>
              )}
            </div>
            <h3 className="text-xl font-bold text-slate-900 dark:text-slate-50">{title}</h3>
            <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
              {description}
            </p>
          </div>
        </div>

        {showDifficulty && (
          <div className="space-y-2 pt-2 border-t border-slate-200/70 dark:border-slate-700/60">
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <Gauge className="w-3.5 h-3.5" />
              <span>Moeilijkheidsgraad</span>
            </p>
            <div className="grid grid-cols-3 gap-2">
              {[
                { id: 'easy' as const, label: 'Makkelijk' },
                { id: 'normal' as const, label: 'Normaal' },
                { id: 'hard' as const, label: 'Moeilijk' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => onChangeDifficulty(opt.id)}
                  className={`py-2 px-3 rounded-xl text-xs font-semibold border transition-colors ${
                    difficulty === opt.id
                      ? `${theme.accentBg} text-white border-transparent`
                      : 'bg-white dark:bg-[#111827] border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-slate-400'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {insufficientReason && (
          <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/50 border border-red-300 dark:border-red-800 text-xs font-medium text-red-700 dark:text-red-300">
            {insufficientReason}
          </div>
        )}

        <div className="pt-1">
          <button
            type="button"
            disabled={Boolean(insufficientReason)}
            onClick={onStart}
            className={`w-full sm:w-auto px-6 py-3 rounded-xl ${theme.accentBg} ${theme.accentHover} disabled:opacity-45 disabled:cursor-not-allowed text-white text-sm font-bold inline-flex items-center justify-center gap-2 shadow-sm transition-colors`}
          >
            <Play className="w-4 h-4 fill-current" />
            <span>Start spel</span>
          </button>
        </div>
      </div>
    </div>
  );
};

interface GameResultScreenProps {
  title: string;
  score: number;
  correct: number;
  wrong: number;
  grade?: number;
  evaluation?: string;
  extraStats?: Array<{ label: string; value: string }>;
  sourceSummary?: string;
  theme: GameTheme;
  onReplay: () => void;
  onExit: () => void;
}

export const GameResultScreen: React.FC<GameResultScreenProps> = ({
  title,
  score,
  correct,
  wrong,
  grade,
  evaluation,
  extraStats,
  sourceSummary,
  theme,
  onReplay,
  onExit,
}) => {
  const finalGrade = grade ?? calculateDutchGrade(correct, wrong);
  const evalText = evaluation ?? getGradeEvaluation(finalGrade);
  const gradeFormatted = finalGrade.toFixed(1).replace('.', ',');
  const passed = finalGrade >= 5.5;

  return (
    <div className="max-w-xl mx-auto py-4">
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-6 sm:p-8 text-center space-y-6">
        <div className="space-y-2">
          <Award className={`w-10 h-10 mx-auto ${passed ? 'text-emerald-500' : 'text-amber-500'}`} />
          <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
            Resultaat · {title}
          </p>
          <div className="flex items-baseline justify-center gap-2">
            <span
              className={`text-5xl font-bold font-mono tabular-nums ${
                passed ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
              }`}
            >
              {gradeFormatted}
            </span>
            <span className="text-sm font-medium text-slate-500 dark:text-slate-400">/ 10</span>
          </div>
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300 max-w-md mx-auto">
            {evalText}
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3 text-center">
          <div className="rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-3">
            <p className="text-[11px] text-slate-500 dark:text-slate-400">Score</p>
            <p className="text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
              {score}
            </p>
          </div>
          <div className="rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-3">
            <p className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center justify-center gap-1">
              <CheckCircle2 className="w-3 h-3" />
              Goed
            </p>
            <p className="text-lg font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
              {correct}
            </p>
          </div>
          <div className="rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-3">
            <p className="text-[11px] text-red-600 dark:text-red-400 flex items-center justify-center gap-1">
              <XCircle className="w-3 h-3" />
              Fout
            </p>
            <p className="text-lg font-bold font-mono tabular-nums text-red-600 dark:text-red-400">
              {wrong}
            </p>
          </div>
        </div>

        {extraStats && extraStats.length > 0 && (
          <div className="flex flex-wrap justify-center gap-x-6 gap-y-1 text-xs text-slate-600 dark:text-slate-400 tabular-nums">
            {extraStats.map((st) => (
              <span key={st.label}>
                {st.label}: <strong className="text-slate-900 dark:text-slate-100">{st.value}</strong>
              </span>
            ))}
          </div>
        )}

        {sourceSummary && (
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Gebaseerd op geselecteerde leerstof: <strong>{sourceSummary}</strong>
          </p>
        )}

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <button
            type="button"
            onClick={onReplay}
            className={`w-full sm:w-auto px-5 py-2.5 rounded-xl ${theme.accentBg} ${theme.accentHover} text-white text-sm font-semibold inline-flex items-center justify-center gap-2`}
          >
            <RotateCcw className="w-4 h-4" />
            <span>Opnieuw spelen</span>
          </button>
          <button
            type="button"
            onClick={onExit}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-200 text-sm font-semibold inline-flex items-center justify-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Terug naar spellenoverzicht</span>
          </button>
        </div>
      </div>
    </div>
  );
};
