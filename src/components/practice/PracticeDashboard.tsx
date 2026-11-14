import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  BookOpen,
  CheckCircle2,
  Clock,
  Play,
  Sparkles,
  Target,
  Trash2,
  TrendingUp,
  XCircle,
} from 'lucide-react';
import type {
  PracticeDashboardState,
  PracticeMode,
  PracticeSessionPublic,
  TopicMasteryRecord,
} from '../../types';
import { ConfirmModal } from '../ConfirmModal';

interface PracticeDashboardProps {
  dashboard: PracticeDashboardState;
  startingQuickAction: boolean;
  onStartQuickAction: (action: {
    mode: PracticeMode;
    focusTopic?: string;
    selectionId?: string;
  }) => void;
  onOpenSession: (session: PracticeSessionPublic) => void;
  onDeleteSession: (sessionId: string) => Promise<void>;
  onGoToSetup: () => void;
}

const MODE_LABELS: Record<PracticeMode, string> = {
  free: 'Vrij oefenen',
  weak: 'Zwakke punten',
  exam: 'Toetsvoorbereiding',
  repeat: 'Herhalen',
  topic: 'Onderwerp',
};

function formatDaysAgo(ts: number): string {
  const diffMs = Date.now() - ts;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return mins <= 1 ? 'zojuist' : `${mins} min geleden`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} uur geleden`;
  const days = Math.floor(hours / 24);
  return days === 1 ? '1 dag geleden' : `${days} dagen geleden`;
}

function getMasteryStatus(rec: TopicMasteryRecord): {
  label: string;
  tone: 'good' | 'medium' | 'weak';
} {
  if (rec.masteryPct >= 75 && rec.totalAttempts >= 3 && rec.consecutiveWrong === 0) {
    return { label: 'Goed beheerst', tone: 'good' };
  }
  if (rec.masteryPct < 50 || rec.consecutiveWrong >= 2) {
    return { label: 'Meer aandacht nodig', tone: 'weak' };
  }
  return { label: 'Extra oefenen', tone: 'medium' };
}

export const PracticeDashboard: React.FC<PracticeDashboardProps> = ({
  dashboard,
  startingQuickAction,
  onStartQuickAction,
  onOpenSession,
  onDeleteSession,
  onGoToSetup,
}) => {
  const [deleteSessionId, setDeleteSessionId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const stats = useMemo(() => {
    const records = dashboard.topicMastery;
    let totalAttempts = 0;
    let totalScoreWeighted = 0;
    let masteredTopics = 0;
    let attentionTopics = 0;

    for (const r of records) {
      totalAttempts += r.totalAttempts;
      totalScoreWeighted += r.correctCount + r.partialCount * 0.5;
      const st = getMasteryStatus(r);
      if (st.tone === 'good') masteredTopics++;
      if (st.tone === 'weak') attentionTopics++;
    }

    const overallCorrectPct =
      totalAttempts > 0 ? Math.round((totalScoreWeighted / totalAttempts) * 100) : 0;

    return {
      totalAttempts,
      overallCorrectPct,
      masteredTopics,
      attentionTopics,
      totalTopics: records.length,
    };
  }, [dashboard.topicMastery]);

  // Subject breakdown for bar chart
  const subjectProgress = useMemo(() => {
    const map = new Map<
      string,
      { subject: string; sumPct: number; count: number; attempts: number }
    >();
    for (const r of dashboard.topicMastery) {
      const subj = r.subject || 'Algemeen';
      const cur = map.get(subj) || { subject: subj, sumPct: 0, count: 0, attempts: 0 };
      cur.sumPct += r.masteryPct;
      cur.count += 1;
      cur.attempts += r.totalAttempts;
      map.set(subj, cur);
    }
    return Array.from(map.values())
      .map((s) => ({
        subject: s.subject,
        avgPct: Math.round(s.sumPct / Math.max(1, s.count)),
        topicCount: s.count,
        attempts: s.attempts,
      }))
      .sort((a, b) => b.attempts - a.attempts);
  }, [dashboard.topicMastery]);

  const activeSessions = useMemo(
    () => dashboard.sessions.filter((s) => s.status === 'active'),
    [dashboard.sessions]
  );

  // SVG timeline geometry
  const timeline = dashboard.historyTimeline;
  const chartSvg = useMemo(() => {
    if (timeline.length === 0) return null;
    const width = 460;
    const height = 150;
    const padX = 28;
    const padY = 18;
    const innerW = width - padX * 2;
    const innerH = height - padY * 2;

    const points = timeline.map((pt, idx) => {
      const x =
        timeline.length === 1
          ? width / 2
          : padX + (idx / (timeline.length - 1)) * innerW;
      const y = padY + (1 - Math.max(0, Math.min(100, pt.avgScorePct)) / 100) * innerH;
      return { x, y, ...pt };
    });

    const linePath = points
      .map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
      .join(' ');
    const areaPath =
      points.length > 1
        ? `${linePath} L ${points[points.length - 1].x.toFixed(1)} ${(height - padY).toFixed(1)} L ${points[0].x.toFixed(1)} ${(height - padY).toFixed(1)} Z`
        : '';

    return { width, height, padX, padY, points, linePath, areaPath };
  }, [timeline]);

  const confirmDelete = async () => {
    if (!deleteSessionId) return;
    setDeleting(true);
    try {
      await onDeleteSession(deleteSessionId);
      setDeleteSessionId(null);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Active Session Resume Banner */}
      {activeSessions.length > 0 && (
        <div className="rounded-xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50/70 dark:bg-indigo-950/30 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm font-semibold text-indigo-950 dark:text-indigo-200">
              <Clock className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
              <span>Actieve oefensessie klaar om verder te gaan</span>
            </div>
            <p className="text-xs text-indigo-800 dark:text-indigo-300 tabular-nums">
              {activeSessions[0].selectionName} · {MODE_LABELS[activeSessions[0].mode]} ·{' '}
              {Object.keys(activeSessions[0].answers).length}/{activeSessions[0].questions.length}{' '}
              vragen nagekeken
            </p>
          </div>
          <button
            type="button"
            onClick={() => onOpenSession(activeSessions[0])}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap shrink-0"
          >
            <Play className="w-4 h-4" />
            <span>Sessie hervatten</span>
          </button>
        </div>
      )}

      {/* 4 KPI Summary Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-4">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Totaal gemaakte vragen
          </p>
          <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">
            {stats.totalAttempts}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            Over {stats.totalTopics} {stats.totalTopics === 1 ? 'onderwerp' : 'onderwerpen'}
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-4">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Score op geoefende vragen
          </p>
          <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-slate-100 tabular-nums">
            {stats.totalAttempts > 0 ? `${stats.overallCorrectPct}%` : '—'}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Inclusief gedeeltelijk goed
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-4">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Goed beheerste onderwerpen
          </p>
          <p className="mt-2 text-2xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
            {stats.masteredTopics}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Minimaal 75% en 3+ vragen
          </p>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-4">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            Vraagt extra aandacht
          </p>
          <p className="mt-2 text-2xl font-bold text-amber-600 dark:text-amber-400 tabular-nums">
            {stats.attentionTopics}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Onderwerpen onder 50%
          </p>
        </div>
      </div>

      {/* AI Coach Next-Step Suggestion */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Persoonlijk AI-vervolgadvies
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              {dashboard.aiSuggestion}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {dashboard.aiNextAction && dashboard.savedSelections.length > 0 ? (
            <button
              type="button"
              disabled={startingQuickAction}
              onClick={() => onStartQuickAction(dashboard.aiNextAction!)}
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-sm font-medium inline-flex items-center gap-2 transition-colors whitespace-nowrap"
            >
              <span>{startingQuickAction ? 'Vragen maken...' : dashboard.aiNextAction.label}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={onGoToSetup}
              className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium inline-flex items-center gap-2 transition-colors whitespace-nowrap"
            >
              <span>Leerstof kiezen & starten</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Charts Row: Subject Progress + Mastery Timeline */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Progress per subject */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Voortgang per vak
              </h3>
            </div>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Geschatte beheersing
            </span>
          </div>

          {subjectProgress.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
              Nog geen vakgegevens. Maak je eerste oefensessie om je voortgang per vak te zien.
            </div>
          ) : (
            <div className="space-y-3.5">
              {subjectProgress.map((sp) => (
                <div key={sp.subject} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs gap-2">
                    <span className="font-medium text-slate-800 dark:text-slate-200 truncate">
                      {sp.subject}
                    </span>
                    <span className="text-slate-500 dark:text-slate-400 tabular-nums shrink-0">
                      {sp.avgPct}% · {sp.attempts} {sp.attempts === 1 ? 'vraag' : 'vragen'}
                    </span>
                  </div>
                  <div className="h-2.5 w-full rounded-md bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div
                      className={`h-full rounded-md transition-all duration-300 ${
                        sp.avgPct >= 75
                          ? 'bg-emerald-600 dark:bg-emerald-500'
                          : sp.avgPct >= 50
                            ? 'bg-indigo-600 dark:bg-indigo-500'
                            : 'bg-amber-500'
                      }`}
                      style={{ width: `${Math.max(4, sp.avgPct)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Mastery development timeline */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-5 space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Ontwikkeling van je prestaties
              </h3>
            </div>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Gem. score per dag
            </span>
          </div>

          {!chartSvg ? (
            <div className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
              Na het beantwoorden van vragen verschijnt hier je leerlijn over de tijd.
            </div>
          ) : (
            <div className="space-y-2">
              <svg
                viewBox={`0 0 ${chartSvg.width} ${chartSvg.height}`}
                className="w-full h-40 overflow-visible"
                role="img"
                aria-label="Grafiek van prestatieontwikkeling"
              >
                {[0, 50, 100].map((val) => {
                  const y =
                    chartSvg.padY + (1 - val / 100) * (chartSvg.height - chartSvg.padY * 2);
                  return (
                    <g key={val}>
                      <line
                        x1={chartSvg.padX}
                        y1={y}
                        x2={chartSvg.width - chartSvg.padX}
                        y2={y}
                        className="stroke-slate-200 dark:stroke-slate-800"
                        strokeDasharray="3 3"
                      />
                      <text
                        x={4}
                        y={y + 4}
                        className="fill-slate-400 dark:fill-slate-500 text-[10px]"
                      >
                        {val}%
                      </text>
                    </g>
                  );
                })}
                {chartSvg.areaPath && (
                  <path
                    d={chartSvg.areaPath}
                    className="fill-indigo-500/10 dark:fill-indigo-400/10"
                  />
                )}
                {chartSvg.points.length > 1 && (
                  <path
                    d={chartSvg.linePath}
                    fill="none"
                    strokeWidth={2.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="stroke-indigo-600 dark:stroke-indigo-400"
                  />
                )}
                {chartSvg.points.map((pt) => (
                  <g key={pt.date}>
                    <circle
                      cx={pt.x}
                      cy={pt.y}
                      r={4.5}
                      className="fill-indigo-600 dark:fill-indigo-400 stroke-white dark:stroke-[#111827]"
                      strokeWidth={2}
                    />
                    <text
                      x={pt.x}
                      y={chartSvg.height - 2}
                      textAnchor="middle"
                      className="fill-slate-500 dark:fill-slate-400 text-[10px]"
                    >
                      {pt.date}
                    </text>
                  </g>
                ))}
              </svg>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Laatste {timeline.length} oefendagen weergegeven.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Personal Topic Mastery Table */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              Kennisniveau per onderwerp
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Percentages zijn een gewogen schatting op basis van meerdere antwoorden en moeilijkheidsgraad (1 goed antwoord geeft nog geen 100%).
            </p>
          </div>
          {dashboard.topicMastery.length > 0 && dashboard.savedSelections.length > 0 && (
            <button
              type="button"
              disabled={startingQuickAction}
              onClick={() =>
                onStartQuickAction({
                  mode: 'weak',
                  selectionId: dashboard.savedSelections[0]?.id,
                })
              }
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Target className="w-3.5 h-3.5 text-amber-500" />
              <span>Zwakke punten oefenen</span>
            </button>
          )}
        </div>

        {dashboard.topicMastery.length === 0 ? (
          <div className="p-8 text-center space-y-2">
            <BookOpen className="w-8 h-8 text-slate-400 mx-auto" />
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
              Nog geen onderwerpen geoefend
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
              Selecteer bestanden of mappen onder Leerstof & Instellingen en beantwoord enkele vragen om hier je persoonlijke beheersing per onderwerp op te bouwen.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/50 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  <th className="py-3 px-4">Onderwerp</th>
                  <th className="py-3 px-4">Beheersing</th>
                  <th className="py-3 px-4">Vragen</th>
                  <th className="py-3 px-4">Laatst geoefend</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actie</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-sm">
                {dashboard.topicMastery.map((rec) => {
                  const st = getMasteryStatus(rec);
                  return (
                    <tr
                      key={rec.key}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors"
                    >
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-900 dark:text-slate-100">
                          {rec.topic}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400">
                          {rec.subject} · {rec.sourceTitle}
                        </div>
                        {rec.weakAspects.length > 0 && (
                          <div className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                            Aandachtspunt: {rec.weakAspects.slice(0, 2).join(' · ')}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 tabular-nums">
                        <div className="flex items-center gap-2.5">
                          <span className="font-semibold text-slate-900 dark:text-slate-100 w-10">
                            {rec.masteryPct}%
                          </span>
                          <div className="w-20 h-2 rounded bg-slate-100 dark:bg-slate-800 overflow-hidden hidden sm:block">
                            <div
                              className={`h-full rounded ${
                                st.tone === 'good'
                                  ? 'bg-emerald-600'
                                  : st.tone === 'weak'
                                    ? 'bg-red-500'
                                    : 'bg-amber-500'
                              }`}
                              style={{ width: `${Math.max(5, rec.masteryPct)}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-600 dark:text-slate-400 tabular-nums whitespace-nowrap">
                        {rec.totalAttempts} ({rec.correctCount}G / {rec.partialCount}D / {rec.wrongCount}F)
                      </td>
                      <td className="py-3 px-4 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
                        {formatDaysAgo(rec.lastPracticedAt)}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                            st.tone === 'good'
                              ? 'text-emerald-700 dark:text-emerald-400'
                              : st.tone === 'weak'
                                ? 'text-red-700 dark:text-red-400'
                                : 'text-amber-700 dark:text-amber-400'
                          }`}
                        >
                          {st.tone === 'good' && <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />}
                          {st.tone === 'medium' && <AlertTriangle className="w-3.5 h-3.5 shrink-0" />}
                          {st.tone === 'weak' && <XCircle className="w-3.5 h-3.5 shrink-0" />}
                          <span>{st.label}</span>
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        {dashboard.savedSelections.length > 0 && (
                          <button
                            type="button"
                            disabled={startingQuickAction}
                            onClick={() =>
                              onStartQuickAction({
                                mode: 'topic',
                                focusTopic: rec.topic,
                                selectionId: dashboard.savedSelections[0]?.id,
                              })
                            }
                            className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline disabled:opacity-50"
                          >
                            Oefenen
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Recent Sessions */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Recente oefensessies
          </h3>
          <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            {dashboard.sessions.length} opgeslagen
          </span>
        </div>

        {dashboard.sessions.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500 dark:text-slate-400">
            Nog geen oefensessies gestart. Jouw sessies en toetsresultaten worden hier automatisch opgeslagen zodat je later kunt hervatten of teruglezen.
          </div>
        ) : (
          <div className="divide-y divide-slate-200 dark:divide-slate-800">
            {dashboard.sessions.slice(0, 10).map((s) => {
              const answeredCount = Object.keys(s.answers).length;
              return (
                <div
                  key={s.id}
                  className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/70 dark:hover:bg-slate-800/30 transition-colors"
                >
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-slate-900 dark:text-slate-100">
                      <span className="truncate">{s.selectionName}</span>
                      <span className="text-slate-300 dark:text-slate-700" aria-hidden="true">
                        ·
                      </span>
                      <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400">
                        {MODE_LABELS[s.mode]}
                        {s.focusTopic ? `: ${s.focusTopic}` : ''}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                      {s.subject} · {answeredCount}/{s.questions.length} nagekeken ·{' '}
                      {formatDaysAgo(s.updatedAt)}
                      {s.status === 'completed' && s.examGrade !== undefined
                        ? ` · Cijfer ${s.examGrade.toFixed(1).replace('.', ',')}`
                        : ''}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => onOpenSession(s)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                        s.status === 'active'
                          ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
                          : 'border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      {s.status === 'active' ? 'Hervatten' : 'Bekijk feedback'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteSessionId(s.id)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                      aria-label="Sessie verwijderen"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <ConfirmModal
        open={Boolean(deleteSessionId)}
        title="Oefensessie verwijderen?"
        description="Deze sessie wordt uit je recente lijst verwijderd. Je opgebouwde kennisprofiel per onderwerp blijft wel bewaard."
        confirmLabel="Verwijderen"
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setDeleteSessionId(null)}
      />
    </div>
  );
};
