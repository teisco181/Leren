import React, { useMemo, useState } from 'react';
import {
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Circle,
  Clock,
  Plus,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { ScheduleTask } from '../types';
import {
  createManyScheduleTasks,
  createScheduleTask,
  deleteScheduleTask,
  updateScheduleTask,
} from '../lib/studyStore';
import { ConfirmModal } from './ConfirmModal';
import { DashboardSkeleton } from './Skeletons';
import { postAiJson } from '../lib/apiClient';

interface DashboardViewProps {
  userId: string;
  userName: string;
  tasks: ScheduleTask[];
  loading: boolean;
  onNavigateSection: (section: 'files' | 'summaries' | 'games' | 'notebook') => void;
}

const NL_DAYS = ['Ma', 'Di', 'Wo', 'Do', 'Vr', 'Za', 'Zo'];

function toDateStr(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function getMondayOfWeek(offsetWeeks: number): Date {
  const now = new Date();
  const day = now.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMonday + offsetWeeks * 7);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  userId,
  userName,
  tasks,
  loading,
  onNavigateSection,
}) => {
  const todayStr = useMemo(() => toDateStr(new Date()), []);
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedDate, setSelectedDate] = useState(todayStr);

  // Add Task Modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [taskTitle, setTaskTitle] = useState('');
  const [taskSubject, setTaskSubject] = useState('');
  const [taskDate, setTaskDate] = useState(todayStr);
  const [taskMinutes, setTaskMinutes] = useState(30);
  const [taskNotes, setTaskNotes] = useState('');
  const [savingTask, setSavingTask] = useState(false);

  // AI Generator Modal
  const [showAiModal, setShowAiModal] = useState(false);
  const [aiExamDate, setAiExamDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return toDateStr(d);
  });
  const [aiSubjects, setAiSubjects] = useState('');
  const [aiMaterial, setAiMaterial] = useState('');
  const [aiDailyMinutes, setAiDailyMinutes] = useState(45);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<ScheduleTask | null>(null);
  const [deleting, setDeleting] = useState(false);

  const weekDays = useMemo(() => {
    const monday = getMondayOfWeek(weekOffset);
    return Array.from({ length: 7 }).map((_, idx) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + idx);
      return {
        label: NL_DAYS[idx],
        dayNum: d.getDate(),
        monthShort: d.toLocaleDateString('nl-NL', { month: 'short' }),
        dateStr: toDateStr(d),
      };
    });
  }, [weekOffset]);

  const tasksForSelectedDay = useMemo(
    () => tasks.filter((t) => t.date === selectedDate),
    [tasks, selectedDate]
  );

  const todayStats = useMemo(() => {
    const todayTasks = tasks.filter((t) => t.date === todayStr);
    const completedToday = todayTasks.filter((t) => t.completed).length;
    const weekDateSet = new Set(weekDays.map((w) => w.dateStr));
    const weekTasks = tasks.filter((t) => weekDateSet.has(t.date));
    const weekCompletedMinutes = weekTasks
      .filter((t) => t.completed)
      .reduce((acc, t) => acc + t.durationMinutes, 0);
    const weekTotalMinutes = weekTasks.reduce((acc, t) => acc + t.durationMinutes, 0);
    return {
      todayTotal: todayTasks.length,
      completedToday,
      weekCompletedCount: weekTasks.filter((t) => t.completed).length,
      weekTotalCount: weekTasks.length,
      weekCompletedMinutes,
      weekTotalMinutes,
    };
  }, [tasks, todayStr, weekDays]);

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskTitle.trim()) return;
    setSavingTask(true);
    try {
      await createScheduleTask(userId, {
        title: taskTitle,
        subject: taskSubject || 'Algemeen',
        date: taskDate,
        durationMinutes: taskMinutes,
        notes: taskNotes,
      });
      setSelectedDate(taskDate);
      setTaskTitle('');
      setTaskNotes('');
      setShowAddModal(false);
    } finally {
      setSavingTask(false);
    }
  };

  const handleGenerateAiPlan = async (e: React.FormEvent) => {
    e.preventDefault();
    setAiError(null);
    if (!aiMaterial.trim()) {
      setAiError('Beschrijf kort welke hoofdstukken of onderwerpen je moet leren.');
      return;
    }
    setAiBusy(true);
    try {
      const data = await postAiJson<{
        tasks?: Array<{
          title: string;
          subject: string;
          date: string;
          durationMinutes: number;
          notes: string;
        }>;
      }>('/api/ai/schedule', {
        examDate: aiExamDate,
        subjects: aiSubjects || 'Studie',
        material: aiMaterial,
        dailyMinutes: aiDailyMinutes,
        todayDate: todayStr,
      });
      if (!Array.isArray(data.tasks) || data.tasks.length === 0) {
        throw new Error('De AI gaf geen taken terug. Probeer je leerstof iets uitgebreider te omschrijven.');
      }
      await createManyScheduleTasks(userId, data.tasks);
      setSelectedDate(data.tasks[0].date || todayStr);
      setShowAiModal(false);
      setAiMaterial('');
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Er ging iets mis.');
    } finally {
      setAiBusy(false);
    }
  };

  if (loading) {
    return <DashboardSkeleton />;
  }

  return (
    <div className="space-y-8">
      {/* Welcome & Primary CTA */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
            {new Date().toLocaleDateString('nl-NL', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            })}
          </p>
          <h1 className="mt-1 text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
            Welkom terug, {userName}
          </h1>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={() => {
              setAiError(null);
              setShowAiModal(true);
            }}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white transition-colors flex items-center gap-2 whitespace-nowrap shrink-0"
          >
            <Sparkles className="w-4 h-4" />
            <span>AI Schema Generator</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setTaskDate(selectedDate);
              setShowAddModal(true);
            }}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center gap-2 whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Taak plannen</span>
          </button>
        </div>
      </div>

      {/* KPI Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Vandaag afgerond</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
            {todayStats.completedToday} / {todayStats.todayTotal}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">taken voor vandaag</p>
        </div>

        <div className="rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Weekvoortgang</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
            {todayStats.weekCompletedCount} / {todayStats.weekTotalCount}
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">geplande sessies voltooid</p>
        </div>

        <div className="rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Oefentijd deze week</p>
          <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
            {todayStats.weekCompletedMinutes} <span className="text-sm font-normal text-slate-500">/ {todayStats.weekTotalMinutes} min</span>
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">actieve studietijd</p>
        </div>
      </div>

      {/* Interactive Daily Practice Schedule */}
      <section className="rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="p-5 sm:p-6 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <Calendar className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Oefenschema per dag
            </h2>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setWeekOffset((w) => w - 1)}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800"
              aria-label="Vorige week"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                setWeekOffset(0);
                setSelectedDate(todayStr);
              }}
              className="px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
            >
              Vandaag
            </button>
            <button
              type="button"
              onClick={() => setWeekOffset((w) => w + 1)}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800"
              aria-label="Volgende week"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* 7-Day Selector Strip */}
        <div className="grid grid-cols-7 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/40">
          {weekDays.map((day) => {
            const dayCount = tasks.filter((t) => t.date === day.dateStr).length;
            const doneCount = tasks.filter((t) => t.date === day.dateStr && t.completed).length;
            const isSelected = selectedDate === day.dateStr;
            const isToday = day.dateStr === todayStr;

            return (
              <button
                key={day.dateStr}
                type="button"
                onClick={() => setSelectedDate(day.dateStr)}
                className={`py-3 px-1.5 sm:px-3 text-center border-r last:border-r-0 border-slate-200 dark:border-slate-800 transition-colors ${
                  isSelected
                    ? 'bg-white dark:bg-[#161D2B] text-indigo-600 dark:text-indigo-400'
                    : 'hover:bg-white/60 dark:hover:bg-slate-800/40 text-slate-600 dark:text-slate-400'
                }`}
              >
                <div className="text-[11px] font-medium">
                  {day.label} {isToday ? '(nu)' : ''}
                </div>
                <div className="mt-0.5 text-sm sm:text-base font-bold tabular-nums text-slate-900 dark:text-slate-100">
                  {day.dayNum} <span className="hidden sm:inline text-xs font-normal text-slate-500">{day.monthShort}</span>
                </div>
                <div className="mt-1 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                  {dayCount > 0 ? `${doneCount}/${dayCount}` : '—'}
                </div>
              </button>
            );
          })}
        </div>

        {/* Day Task List */}
        <div className="p-5 sm:p-6">
          {tasksForSelectedDay.length === 0 ? (
            <div className="py-10 text-center space-y-3">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Geen leertaken gepland voor{' '}
                {new Date(`${selectedDate}T00:00:00`).toLocaleDateString('nl-NL', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                })}
                .
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                Voeg handmatig een leersessie toe of laat de AI Schema Generator automatisch een
                gespreid leerplan maken tot je toets.
              </p>
              <div className="pt-2 flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setTaskDate(selectedDate);
                    setShowAddModal(true);
                  }}
                  className="px-4 py-2 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-700 text-white whitespace-nowrap"
                >
                  Eerste taak toevoegen
                </button>
              </div>
            </div>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-800">
              {tasksForSelectedDay.map((task) => (
                <div
                  key={task.id}
                  className="py-3.5 first:pt-0 last:pb-0 flex items-start justify-between gap-4 group"
                >
                  <div className="flex items-start gap-3.5 min-w-0">
                    <button
                      type="button"
                      onClick={() =>
                        updateScheduleTask(userId, task.id, { completed: !task.completed })
                      }
                      className="mt-0.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors shrink-0"
                      aria-label={task.completed ? 'Markeer als onvoltooid' : 'Markeer als voltooid'}
                    >
                      {task.completed ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                      ) : (
                        <Circle className="w-5 h-5" />
                      )}
                    </button>

                    <div className="min-w-0">
                      <p
                        className={`text-sm font-medium ${
                          task.completed
                            ? 'line-through text-slate-400 dark:text-slate-500'
                            : 'text-slate-900 dark:text-slate-100'
                        }`}
                      >
                        {task.title}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                        <span>{task.subject || 'Algemeen'}</span>
                        <span aria-hidden="true">·</span>
                        <span className="inline-flex items-center gap-1 tabular-nums">
                          <Clock className="w-3 h-3" />
                          {task.durationMinutes} min
                        </span>
                        {task.isAiGenerated && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-indigo-600 dark:text-indigo-400">AI-plan</span>
                          </>
                        )}
                      </div>
                      {task.notes && (
                        <p className="mt-1.5 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                          {task.notes}
                        </p>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setDeleteTarget(task)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0"
                    aria-label="Taak verwijderen"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Quick Study Shortcuts */}
      <section className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <button
          type="button"
          onClick={() => onNavigateSection('files')}
          className="text-left p-5 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 hover:border-indigo-400 dark:hover:border-indigo-500 transition-colors"
        >
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Mappen &amp; Bestanden
          </h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Open je vakmappen, maak notities of upload PDF-bestanden.
          </p>
        </button>

        <button
          type="button"
          onClick={() => onNavigateSection('summaries')}
          className="text-left p-5 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 hover:border-indigo-400 dark:hover:border-indigo-500 transition-colors"
        >
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            AI Samenvattingen
          </h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Zet leerstof om in kernbegrippen en zelftestvragen per vak.
          </p>
        </button>

        <button
          type="button"
          onClick={() => onNavigateSection('games')}
          className="text-left p-5 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 hover:border-indigo-400 dark:hover:border-indigo-500 transition-colors"
        >
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Spelletjes &amp; Multiplayer
          </h3>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Oefen met flashcards, memory of start een live quizkamer.
          </p>
        </button>
      </section>

      {/* Add Task Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-6">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Nieuwe leertaak plannen
              </h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateTask} className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Wat ga je oefenen?
                </label>
                <input
                  type="text"
                  required
                  value={taskTitle}
                  onChange={(e) => setTaskTitle(e.target.value)}
                  placeholder="Bijv. Hoofdstuk 4 begrippen overhoren"
                  className="w-full px-3.5 py-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Vak
                  </label>
                  <input
                    type="text"
                    value={taskSubject}
                    onChange={(e) => setTaskSubject(e.target.value)}
                    placeholder="Biologie"
                    className="w-full px-3.5 py-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Duur (minuten)
                  </label>
                  <input
                    type="number"
                    min={5}
                    max={300}
                    value={taskMinutes}
                    onChange={(e) => setTaskMinutes(Number(e.target.value))}
                    className="w-full px-3.5 py-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Datum
                </label>
                <input
                  type="date"
                  required
                  value={taskDate}
                  onChange={(e) => setTaskDate(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Notitie of leerstrategie (optioneel)
                </label>
                <textarea
                  rows={2}
                  value={taskNotes}
                  onChange={(e) => setTaskNotes(e.target.value)}
                  placeholder="Bijv. Actieve herinnering met flashcards"
                  className="w-full px-3.5 py-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-lg text-sm font-medium border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  Annuleren
                </button>
                <button
                  type="submit"
                  disabled={savingTask}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-60"
                >
                  {savingTask ? 'Opslaan...' : 'Toevoegen'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* AI Schedule Generator Modal */}
      {showAiModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  AI Oefenschema Generator
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAiModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
              StudyFlow verdeelt je leerstof met gespreide herhaling en actieve herinnering over de
              dagen tot je toets.
            </p>

            {aiError && (
              <div className="mt-4 p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300">
                {aiError}
              </div>
            )}

            <form onSubmit={handleGenerateAiPlan} className="mt-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Toetsdatum
                  </label>
                  <input
                    type="date"
                    required
                    min={todayStr}
                    value={aiExamDate}
                    onChange={(e) => setAiExamDate(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Minuten per dag
                  </label>
                  <input
                    type="number"
                    min={15}
                    max={240}
                    value={aiDailyMinutes}
                    onChange={(e) => setAiDailyMinutes(Number(e.target.value))}
                    className="w-full px-3.5 py-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Vak(ken)
                </label>
                <input
                  type="text"
                  value={aiSubjects}
                  onChange={(e) => setAiSubjects(e.target.value)}
                  placeholder="Bijv. Geschiedenis & Economie"
                  className="w-full px-3.5 py-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Leerstof (hoofdstukken, onderwerpen of aantekeningen)
                </label>
                <textarea
                  rows={4}
                  required
                  value={aiMaterial}
                  onChange={(e) => setAiMaterial(e.target.value)}
                  placeholder="Bijv. Hoofdstuk 1 t/m 3 over de Koude Oorlog, de Berlijnse Muur en de Cubacrisis + 40 begrippen."
                  className="w-full px-3.5 py-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setShowAiModal(false)}
                  disabled={aiBusy}
                  className="px-4 py-2 rounded-lg text-sm font-medium border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  Annuleren
                </button>
                <button
                  type="submit"
                  disabled={aiBusy}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-60 flex items-center gap-2"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>{aiBusy ? 'Plan genereren...' : 'Genereer & Plaats in Schema'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Taak verwijderen?"
        description={`Weet je zeker dat je "${deleteTarget?.title}" wilt verwijderen uit je oefenschema?`}
        busy={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return;
          setDeleting(true);
          try {
            await deleteScheduleTask(userId, deleteTarget.id);
            setDeleteTarget(null);
          } finally {
            setDeleting(false);
          }
        }}
      />
    </div>
  );
};
