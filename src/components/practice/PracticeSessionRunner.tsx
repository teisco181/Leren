import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Clock,
  HelpCircle,
  Loader2,
  Send,
  Sparkles,
  Target,
  XCircle,
} from 'lucide-react';
import type {
  PracticeAnswerFeedback,
  PracticeDifficulty,
  PracticeMode,
  PracticeSessionPublic,
} from '../../types';

interface PracticeSessionRunnerProps {
  session: PracticeSessionPublic;
  submittingAnswer: boolean;
  submittingExam: boolean;
  error: string | null;
  onSaveDraft: (
    draftAnswers: Record<string, { typedAnswer?: string; selectedIndices?: number[] }>,
    currentIndex: number
  ) => Promise<void>;
  onSubmitSingleAnswer: (params: {
    questionId: string;
    typedAnswer?: string;
    selectedIndices?: number[];
    nextIndex?: number;
  }) => Promise<void>;
  onSubmitExam: (
    draftAnswers: Record<string, { typedAnswer?: string; selectedIndices?: number[] }>
  ) => Promise<void>;
  onExitToDashboard: () => void;
  onPracticeWeakAfter: (topics: string[]) => void;
}

const MODE_LABELS: Record<PracticeMode, string> = {
  free: 'Vrij oefenen',
  weak: 'Zwakke punten',
  exam: 'Toetsvoorbereiding',
  repeat: 'Herhalen',
  topic: 'Onderwerp oefenen',
};

const DIFF_LABELS: Record<PracticeDifficulty, string> = {
  easy: 'Makkelijk',
  normal: 'Normaal',
  hard: 'Moeilijk',
};

function formatClock(totalSeconds: number): string {
  const s = Math.max(0, totalSeconds);
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function StatusRow({ status }: { status: PracticeAnswerFeedback['status'] }) {
  if (status === 'correct') {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
        <CheckCircle2 className="w-4 h-4 shrink-0" />
        <span>Goed beantwoord</span>
      </span>
    );
  }
  if (status === 'partial') {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-amber-700 dark:text-amber-400">
        <AlertTriangle className="w-4 h-4 shrink-0" />
        <span>Gedeeltelijk goed</span>
      </span>
    );
  }
  if (status === 'unverifiable') {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-600 dark:text-slate-300">
        <HelpCircle className="w-4 h-4 shrink-0" />
        <span>Niet betrouwbaar te beoordelen</span>
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-red-700 dark:text-red-400">
      <XCircle className="w-4 h-4 shrink-0" />
      <span>Niet juist</span>
    </span>
  );
}

export const PracticeSessionRunner: React.FC<PracticeSessionRunnerProps> = ({
  session,
  submittingAnswer,
  submittingExam,
  error,
  onSaveDraft,
  onSubmitSingleAnswer,
  onSubmitExam,
  onExitToDashboard,
  onPracticeWeakAfter,
}) => {
  const [currentIndex, setCurrentIndex] = useState<number>(() => {
    if (session.status === 'active') {
      const firstUnanswered = session.questions.findIndex((q) => !session.answers[q.id]);
      if (firstUnanswered >= 0) return firstUnanswered;
    }
    return Math.min(session.currentIndex || 0, Math.max(0, session.questions.length - 1));
  });

  const [drafts, setDrafts] = useState<
    Record<string, { typedAnswer?: string; selectedIndices?: number[] }>
  >(() => session.draftAnswers || {});

  const [revealedHints, setRevealedHints] = useState<Record<string, boolean>>({});
  const [reviewOpen, setReviewOpen] = useState<Record<string, boolean>>({});

  // Countdown timer when timeLimitMinutes > 0 and session active
  const [secondsLeft, setSecondsLeft] = useState<number | null>(() => {
    if (session.status !== 'active' || !session.settings.timeLimitMinutes) return null;
    const deadline = session.startedAt + session.settings.timeLimitMinutes * 60 * 1000;
    return Math.max(0, Math.floor((deadline - Date.now()) / 1000));
  });

  const autoSubmittedRef = useRef(false);
  const draftsRef = useRef(drafts);
  draftsRef.current = drafts;

  useEffect(() => {
    if (session.status !== 'active' || !session.settings.timeLimitMinutes) {
      setSecondsLeft(null);
      return;
    }
    const deadline = session.startedAt + session.settings.timeLimitMinutes * 60 * 1000;
    const tick = () => {
      const left = Math.max(0, Math.floor((deadline - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left <= 0 && !autoSubmittedRef.current) {
        autoSubmittedRef.current = true;
        onSubmitExam(draftsRef.current).catch(() => {});
      }
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [session.id, session.status, session.startedAt, session.settings.timeLimitMinutes, onSubmitExam]);

  // Keep index valid if session updates
  useEffect(() => {
    if (currentIndex >= session.questions.length && session.questions.length > 0) {
      setCurrentIndex(session.questions.length - 1);
    }
  }, [currentIndex, session.questions.length]);

  const currentQuestion = session.questions[currentIndex];
  const isEndCheckMode = session.mode === 'exam' || session.settings.checkTiming === 'end';
  const currentFeedback = currentQuestion ? session.answers[currentQuestion.id] : undefined;
  const currentDraft = currentQuestion ? drafts[currentQuestion.id] || {} : {};

  // Topic breakdown for completed view
  const topicBreakdown = useMemo(() => {
    const map = new Map<string, { topic: string; sum: number; count: number }>();
    for (const q of session.questions) {
      const fb = session.answers[q.id];
      if (!fb || fb.status === 'unverifiable') continue;
      const cur = map.get(q.topic) || { topic: q.topic, sum: 0, count: 0 };
      cur.sum += fb.score0to1;
      cur.count += 1;
      map.set(q.topic, cur);
    }
    return Array.from(map.values()).map((entry) => ({
      topic: entry.topic,
      pct: Math.round((entry.sum / Math.max(1, entry.count)) * 100),
      count: entry.count,
    }));
  }, [session.questions, session.answers]);

  // Completed Report View
  if (session.status === 'completed') {
    const strongTopics = topicBreakdown.filter((t) => t.pct >= 70);
    const weakTopics = topicBreakdown.filter((t) => t.pct < 70);
    const grade = session.examGrade !== undefined ? session.examGrade.toFixed(1).replace('.', ',') : '—';

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onExitToDashboard}
            className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Terug naar overzicht</span>
          </button>
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {session.selectionName} · {MODE_LABELS[session.mode]}
          </span>
        </div>

        {/* Summary Grade Header */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-6 grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
          <div className="md:col-span-4 flex items-center gap-4">
            <div className="w-20 h-20 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-900 flex flex-col items-center justify-center shrink-0">
              <span className="text-[11px] font-medium text-indigo-600 dark:text-indigo-400 uppercase">
                Cijfer
              </span>
              <span className="text-3xl font-bold text-indigo-700 dark:text-indigo-300 tabular-nums">
                {grade}
              </span>
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                {session.mode === 'exam' ? 'Toetsresultaat' : 'Oefensessie afgerond'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 tabular-nums">
                {session.correctCount} goed · {session.partialCount} gedeeltelijk ·{' '}
                {session.wrongCount} fout
              </p>
            </div>
          </div>

          <div className="md:col-span-8 space-y-2">
            {session.aiRecommendation && (
              <div className="flex items-start gap-2.5 text-sm text-slate-700 dark:text-slate-300">
                <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
                <span>{session.aiRecommendation}</span>
              </div>
            )}
            {weakTopics.length > 0 && (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => onPracticeWeakAfter(weakTopics.map((w) => w.topic))}
                  className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold inline-flex items-center gap-2 transition-colors"
                >
                  <Target className="w-3.5 h-3.5" />
                  <span>Oefen lastige onderwerpen direct</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Topic Breakdown: Strong vs Attention Needed */}
        {topicBreakdown.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-5 space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="w-4 h-4" />
                <span>Wat goed ging ({strongTopics.length})</span>
              </div>
              {strongTopics.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Geen onderwerpen boven 70% in deze sessie. Kijk hieronder de feedback rustig door.
                </p>
              ) : (
                <div className="space-y-2">
                  {strongTopics.map((t) => (
                    <div
                      key={t.topic}
                      className="flex items-center justify-between text-xs py-1.5 border-b border-slate-100 dark:border-slate-800 last:border-0"
                    >
                      <span className="font-medium text-slate-800 dark:text-slate-200">
                        {t.topic}
                      </span>
                      <span className="font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
                        {t.pct}% ({t.count} {t.count === 1 ? 'vraag' : 'vragen'})
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-5 space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-amber-700 dark:text-amber-400">
                <AlertTriangle className="w-4 h-4" />
                <span>Wat nog extra oefening vraagt ({weakTopics.length})</span>
              </div>
              {weakTopics.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Alle onderwerpen in deze sessie zijn ruim voldoende gescoord!
                </p>
              ) : (
                <div className="space-y-2">
                  {weakTopics.map((t) => (
                    <div
                      key={t.topic}
                      className="flex items-center justify-between text-xs py-1.5 border-b border-slate-100 dark:border-slate-800 last:border-0"
                    >
                      <span className="font-medium text-slate-800 dark:text-slate-200">
                        {t.topic}
                      </span>
                      <span className="font-semibold text-amber-600 dark:text-amber-400 tabular-nums">
                        {t.pct}% ({t.count} {t.count === 1 ? 'vraag' : 'vragen'})
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Full Question-by-Question Review */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Uitgebreide feedback per vraag
            </h3>
          </div>
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {session.questions.map((q, idx) => {
              const fb = session.answers[q.id];
              const isExpanded = reviewOpen[q.id] ?? true;

              return (
                <div key={q.id} className="p-5 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <span className="font-semibold text-slate-700 dark:text-slate-300 tabular-nums">
                          Vraag {idx + 1}
                        </span>
                        <span>·</span>
                        <span>{q.topic}</span>
                        <span>·</span>
                        <span>{DIFF_LABELS[q.difficulty]}</span>
                      </div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {q.prompt}
                      </p>
                    </div>
                    {fb && (
                      <button
                        type="button"
                        onClick={() =>
                          setReviewOpen((prev) => ({ ...prev, [q.id]: !isExpanded }))
                        }
                        className="shrink-0 text-left"
                      >
                        <StatusRow status={fb.status} />
                      </button>
                    )}
                  </div>

                  {fb && isExpanded && (
                    <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/40 p-4 space-y-2.5 text-xs">
                      {fb.typedAnswer !== undefined && (
                        <div>
                          <span className="font-semibold text-slate-700 dark:text-slate-300">
                            Jouw antwoord:{' '}
                          </span>
                          <span className="text-slate-600 dark:text-slate-400">
                            {fb.typedAnswer || '(Niet ingevuld)'}
                          </span>
                        </div>
                      )}
                      {fb.selectedIndices !== undefined && q.options && (
                        <div>
                          <span className="font-semibold text-slate-700 dark:text-slate-300">
                            Jouw keuze:{' '}
                          </span>
                          <span className="text-slate-600 dark:text-slate-400">
                            {fb.selectedIndices.length > 0
                              ? fb.selectedIndices.map((i) => q.options![i]).join(', ')
                              : '(Geen optie gekozen)'}
                          </span>
                        </div>
                      )}

                      <p className="text-slate-800 dark:text-slate-200 leading-relaxed">
                        {fb.feedback}
                      </p>

                      {fb.whatWasRight && (
                        <p className="text-emerald-700 dark:text-emerald-400">
                          <span className="font-semibold">Wat al klopte: </span>
                          {fb.whatWasRight}
                        </p>
                      )}

                      {fb.missingPoints.length > 0 && (
                        <div className="text-amber-700 dark:text-amber-400">
                          <span className="font-semibold">Wat nog ontbrak of aandacht vraagt: </span>
                          {fb.missingPoints.join(' · ')}
                        </div>
                      )}

                      <div className="pt-2 border-t border-slate-200/80 dark:border-slate-800 space-y-1">
                        <p className="text-slate-800 dark:text-slate-200">
                          <span className="font-semibold">
                            {q.type === 'open' ? 'Voorbeeldantwoord uit de stof: ' : 'Juiste antwoord: '}
                          </span>
                          {fb.referenceAnswer}
                        </p>
                        <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                          <span className="font-semibold text-slate-700 dark:text-slate-300">
                            Uitleg:{' '}
                          </span>
                          {fb.explanation}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 pt-1 inline-flex items-center gap-1.5">
                          <BookOpen className="w-3.5 h-3.5 shrink-0" />
                          <span>
                            Bron: {fb.sourceTitle} · {fb.sourceSection}
                          </span>
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // Active Practice / Exam Workspace
  if (!currentQuestion) {
    return (
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-6 text-center space-y-3">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Geen vragen beschikbaar in deze sessie.
        </p>
        <button
          type="button"
          onClick={onExitToDashboard}
          className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium"
        >
          Terug naar overzicht
        </button>
      </div>
    );
  }

  const updateOpenDraft = (text: string) => {
    setDrafts((prev) => ({
      ...prev,
      [currentQuestion.id]: { ...prev[currentQuestion.id], typedAnswer: text },
    }));
  };

  const toggleMcOption = (idx: number) => {
    setDrafts((prev) => {
      const existing = prev[currentQuestion.id]?.selectedIndices || [];
      if (currentQuestion.type === 'mc-single') {
        return {
          ...prev,
          [currentQuestion.id]: { ...prev[currentQuestion.id], selectedIndices: [idx] },
        };
      }
      const next = existing.includes(idx)
        ? existing.filter((i) => i !== idx)
        : [...existing, idx];
      return {
        ...prev,
        [currentQuestion.id]: { ...prev[currentQuestion.id], selectedIndices: next },
      };
    });
  };

  const handleSaveAndExit = async () => {
    await onSaveDraft(drafts, currentIndex);
    onExitToDashboard();
  };

  const handleGoToQuestion = (nextIdx: number) => {
    if (nextIdx < 0 || nextIdx >= session.questions.length) return;
    setCurrentIndex(nextIdx);
    onSaveDraft(drafts, nextIdx).catch(() => {});
  };

  const handleCheckCurrent = async () => {
    const d = drafts[currentQuestion.id] || {};
    await onSubmitSingleAnswer({
      questionId: currentQuestion.id,
      typedAnswer: d.typedAnswer || '',
      selectedIndices: d.selectedIndices || [],
      nextIndex: currentIndex,
    });
  };

  const handleNextOrFinish = () => {
    if (currentIndex + 1 < session.questions.length) {
      setCurrentIndex(currentIndex + 1);
    } else {
      // Check if any unanswered remain
      const nextUnanswered = session.questions.findIndex((q) => !session.answers[q.id]);
      if (nextUnanswered >= 0) {
        setCurrentIndex(nextUnanswered);
      }
    }
  };

  const hasCurrentInput =
    currentQuestion.type === 'open'
      ? Boolean((currentDraft.typedAnswer || '').trim())
      : (currentDraft.selectedIndices || []).length > 0;

  const answeredCount = Object.keys(session.answers).length;
  const draftFilledCount = session.questions.filter((q) => {
    if (session.answers[q.id]) return true;
    const d = drafts[q.id];
    if (!d) return false;
    return q.type === 'open'
      ? Boolean((d.typedAnswer || '').trim())
      : (d.selectedIndices || []).length > 0;
  }).length;

  const progressPct = Math.round(
    ((isEndCheckMode ? draftFilledCount : answeredCount) / Math.max(1, session.questions.length)) *
      100
  );

  return (
    <div className="space-y-5">
      {/* Top Session Bar */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                {MODE_LABELS[session.mode]}
              </span>
              <span>·</span>
              <span className="truncate">{session.selectionName}</span>
            </div>
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 mt-0.5 tabular-nums">
              Vraag {currentIndex + 1} van {session.questions.length}
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {secondsLeft !== null && (
              <div
                className={`px-3 py-1.5 rounded-lg border text-xs font-semibold tabular-nums inline-flex items-center gap-1.5 ${
                  secondsLeft < 60
                    ? 'border-red-300 dark:border-red-900 text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/30'
                    : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>{formatClock(secondsLeft)}</span>
              </div>
            )}

            <button
              type="button"
              onClick={handleSaveAndExit}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 whitespace-nowrap"
            >
              Opslaan & later hervatten
            </button>
          </div>
        </div>

        <div className="h-2 w-full rounded bg-slate-100 dark:bg-slate-800 overflow-hidden">
          <div
            className="h-full bg-indigo-600 transition-all duration-300"
            style={{ width: `${Math.max(4, progressPct)}%` }}
          />
        </div>

        {/* Question quick navigator in exam / end-check mode */}
        {isEndCheckMode && (
          <div className="flex flex-wrap items-center gap-1.5 pt-1">
            {session.questions.map((q, idx) => {
              const d = drafts[q.id];
              const filled =
                q.type === 'open'
                  ? Boolean((d?.typedAnswer || '').trim())
                  : (d?.selectedIndices || []).length > 0;
              const active = idx === currentIndex;
              return (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => handleGoToQuestion(idx)}
                  className={`w-8 h-8 rounded-lg text-xs font-semibold tabular-nums transition-colors ${
                    active
                      ? 'bg-indigo-600 text-white'
                      : filled
                        ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                        : 'border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  {idx + 1}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Honest warning when source had fewer verifiable facts */}
      {session.materialNotice && (
        <div className="rounded-xl border border-amber-200 dark:border-amber-900 bg-amber-50/70 dark:bg-amber-950/30 p-3.5 flex items-start gap-2.5 text-xs text-amber-900 dark:text-amber-200">
          <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <span>{session.materialNotice}</span>
        </div>
      )}

      {/* Active Question Card */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-slate-800 dark:text-slate-200">
              {currentQuestion.topic}
            </span>
            <span>·</span>
            <span>{DIFF_LABELS[currentQuestion.difficulty]}</span>
            <span>·</span>
            <span>
              {currentQuestion.type === 'open'
                ? 'Open vraag (eigen woorden)'
                : currentQuestion.type === 'mc-multi'
                  ? `Meerkeuze (${currentQuestion.multiSelectCount || 'meerdere'} juiste antwoorden)`
                  : 'Meerkeuzevraag'}
            </span>
          </div>

          {currentQuestion.targetedWeakAspect && (
            <span className="text-amber-700 dark:text-amber-400 font-medium">
              Gericht op aandachtspunt
            </span>
          )}
        </div>

        <h2 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-slate-100 leading-snug">
          {currentQuestion.prompt}
        </h2>

        {/* Optional Hint */}
        {session.settings.hintsEnabled && currentQuestion.hint && !currentFeedback && (
          <div>
            {revealedHints[currentQuestion.id] ? (
              <div className="rounded-lg border border-indigo-200 dark:border-indigo-900 bg-indigo-50/60 dark:bg-indigo-950/30 px-3.5 py-2.5 text-xs text-indigo-900 dark:text-indigo-200">
                <span className="font-semibold">Hint: </span>
                {currentQuestion.hint}
              </div>
            ) : (
              <button
                type="button"
                onClick={() =>
                  setRevealedHints((prev) => ({ ...prev, [currentQuestion.id]: true }))
                }
                className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                <HelpCircle className="w-3.5 h-3.5" />
                <span>Hint tonen</span>
              </button>
            )}
          </div>
        )}

        {/* Answer Input Area */}
        {currentQuestion.type === 'open' ? (
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400">
              Typ je antwoord in je eigen woorden op basis van de geselecteerde leerstof:
            </label>
            <textarea
              rows={4}
              disabled={Boolean(currentFeedback) || submittingAnswer || submittingExam}
              value={
                currentFeedback
                  ? currentFeedback.typedAnswer || ''
                  : currentDraft.typedAnswer || ''
              }
              onChange={(e) => updateOpenDraft(e.target.value)}
              onKeyDown={(e) => {
                if (
                  !isEndCheckMode &&
                  !currentFeedback &&
                  (e.ctrlKey || e.metaKey) &&
                  e.key === 'Enter' &&
                  hasCurrentInput
                ) {
                  e.preventDefault();
                  handleCheckCurrent();
                }
              }}
              placeholder="Schrijf hier je uitleg of antwoord..."
              className="w-full px-3.5 py-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-75"
            />
          </div>
        ) : (
          <div className="space-y-2.5">
            {(currentQuestion.options || []).map((opt, idx) => {
              const selectedList = currentFeedback
                ? currentFeedback.selectedIndices || []
                : currentDraft.selectedIndices || [];
              const isSelected = selectedList.includes(idx);
              const letter = String.fromCharCode(65 + idx);
              const isCorrectOption = currentFeedback?.correctOptionTexts?.includes(opt);

              let borderClass =
                'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700 bg-white dark:bg-slate-900/60';
              if (currentFeedback) {
                if (isCorrectOption) {
                  borderClass =
                    'border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-950 dark:text-emerald-200';
                } else if (isSelected) {
                  borderClass =
                    'border-red-400 bg-red-50/70 dark:bg-red-950/30 text-red-950 dark:text-red-200';
                }
              } else if (isSelected) {
                borderClass =
                  'border-indigo-600 bg-indigo-50/70 dark:bg-indigo-950/40 text-indigo-950 dark:text-indigo-100';
              }

              return (
                <button
                  key={idx}
                  type="button"
                  disabled={Boolean(currentFeedback) || submittingAnswer || submittingExam}
                  onClick={() => toggleMcOption(idx)}
                  className={`w-full text-left px-4 py-3 rounded-xl border transition-colors flex items-start gap-3 ${borderClass}`}
                >
                  <span
                    className={`w-6 h-6 rounded-md text-xs font-bold flex items-center justify-center shrink-0 mt-0.5 ${
                      isSelected
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {letter}
                  </span>
                  <span className="text-sm leading-relaxed flex-1">{opt}</span>
                </button>
              );
            })}
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 px-4 py-3 text-xs text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        {/* Immediate Feedback Panel */}
        {currentFeedback && (
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/50 p-5 space-y-3">
            <StatusRow status={currentFeedback.status} />
            <p className="text-sm text-slate-800 dark:text-slate-200 leading-relaxed">
              {currentFeedback.feedback}
            </p>

            {currentFeedback.whatWasRight && (
              <p className="text-xs text-emerald-700 dark:text-emerald-400">
                <span className="font-semibold">Wat klopte: </span>
                {currentFeedback.whatWasRight}
              </p>
            )}

            {currentFeedback.missingPoints.length > 0 && (
              <div className="text-xs text-amber-700 dark:text-amber-400">
                <span className="font-semibold">Wat nog ontbrak of anders moet: </span>
                {currentFeedback.missingPoints.join(' · ')}
              </div>
            )}

            <div className="pt-2.5 border-t border-slate-200 dark:border-slate-800 space-y-1.5 text-xs">
              <p className="text-slate-900 dark:text-slate-100">
                <span className="font-semibold">
                  {currentQuestion.type === 'open'
                    ? 'Voorbeeldantwoord uit je leerstof: '
                    : 'Juiste antwoord: '}
                </span>
                {currentFeedback.referenceAnswer}
              </p>
              <p className="text-slate-600 dark:text-slate-400 leading-relaxed">
                <span className="font-semibold text-slate-700 dark:text-slate-300">Uitleg: </span>
                {currentFeedback.explanation}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 pt-1 inline-flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5 shrink-0" />
                <span>
                  Bron: {currentFeedback.sourceTitle} · {currentFeedback.sourceSection}
                </span>
              </p>
            </div>
          </div>
        )}

        {/* Action Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
          {isEndCheckMode ? (
            <>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={currentIndex === 0}
                  onClick={() => handleGoToQuestion(currentIndex - 1)}
                  className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 disabled:opacity-40 inline-flex items-center gap-1.5"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Vorige</span>
                </button>
                <button
                  type="button"
                  disabled={currentIndex + 1 >= session.questions.length}
                  onClick={() => handleGoToQuestion(currentIndex + 1)}
                  className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 disabled:opacity-40 inline-flex items-center gap-1.5"
                >
                  <span>Volgende</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <button
                type="button"
                disabled={submittingExam}
                onClick={() => onSubmitExam(drafts)}
                className="px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold inline-flex items-center gap-2 transition-colors"
              >
                {submittingExam ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>AI kijkt alle antwoorden na...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>Alles inleveren & nakijken ({draftFilledCount}/{session.questions.length})</span>
                  </>
                )}
              </button>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2">
                {currentIndex > 0 && (
                  <button
                    type="button"
                    onClick={() => setCurrentIndex(currentIndex - 1)}
                    className="px-3.5 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Vorige</span>
                  </button>
                )}
              </div>

              {!currentFeedback ? (
                <button
                  type="button"
                  disabled={!hasCurrentInput || submittingAnswer}
                  onClick={handleCheckCurrent}
                  className="px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold inline-flex items-center gap-2 transition-colors"
                >
                  {submittingAnswer ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Nakijken aan de hand van de bron...</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Controleer antwoord</span>
                    </>
                  )}
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleNextOrFinish}
                  className="px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold inline-flex items-center gap-2 transition-colors"
                >
                  <span>
                    {currentIndex + 1 < session.questions.length
                      ? 'Volgende vraag'
                      : 'Bekijk eindresultaat'}
                  </span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
