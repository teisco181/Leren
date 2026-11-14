import React, { useMemo, useState } from "react";
import {
  AlertTriangle,
  Bell,
  BellOff,
  BellRing,
  CalendarPlus,
  CheckCircle2,
  Send,
  Volume2,
  VolumeX,
} from "lucide-react";
import type {
  DesktopReminderSettings,
  ScheduleTask,
  TaskReminderEntry,
} from "../types";
import {
  downloadTasksIcsWithReminders,
  type DesktopNotificationPermissionState,
} from "../lib/desktopNotifications";

interface DesktopRemindersPanelProps {
  settings: DesktopReminderSettings;
  taskReminders: Record<string, TaskReminderEntry>;
  tasks: ScheduleTask[];
  todayStr: string;
  permission: DesktopNotificationPermissionState;
  inIframe: boolean;
  iframeNotice: boolean;
  onRequestPermission: () => Promise<unknown>;
  onUpdateSettings: (partial: Partial<DesktopReminderSettings>) => Promise<void>;
  onUpdateTaskReminder: (
    taskId: string,
    payload: { time?: string; enabled?: boolean; remove?: boolean }
  ) => Promise<void>;
  onSendTestReminder: () => Promise<void>;
}

const WEEKDAY_BUTTONS: Array<{ dayIndex: number; label: string }> = [
  { dayIndex: 1, label: "Ma" },
  { dayIndex: 2, label: "Di" },
  { dayIndex: 3, label: "Wo" },
  { dayIndex: 4, label: "Do" },
  { dayIndex: 5, label: "Vr" },
  { dayIndex: 6, label: "Za" },
  { dayIndex: 0, label: "Zo" },
];

export const DesktopRemindersPanel: React.FC<DesktopRemindersPanelProps> = ({
  settings,
  taskReminders,
  tasks,
  todayStr,
  permission,
  inIframe,
  iframeNotice,
  onRequestPermission,
  onUpdateSettings,
  onUpdateTaskReminder,
  onSendTestReminder,
}) => {
  const [exportNotice, setExportNotice] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  const todayPendingTasks = useMemo(
    () => tasks.filter((t) => t.date === todayStr && !t.completed),
    [tasks, todayStr]
  );

  const upcomingCount = useMemo(
    () => tasks.filter((t) => !t.completed && t.date >= todayStr).length,
    [tasks, todayStr]
  );

  const toggleDay = (dayIndex: number) => {
    const exists = settings.daysOfWeek.includes(dayIndex);
    const nextDays = exists
      ? settings.daysOfWeek.filter((d) => d !== dayIndex)
      : [...settings.daysOfWeek, dayIndex];
    onUpdateSettings({ daysOfWeek: nextDays });
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      await onSendTestReminder();
    } finally {
      setTesting(false);
    }
  };

  const handleExportIcs = () => {
    const futureOrToday = tasks.filter((t) => !t.completed && t.date >= todayStr);
    const count = downloadTasksIcsWithReminders(
      futureOrToday,
      taskReminders,
      settings.dailyTime,
      settings.leadMinutesBeforeTask
    );
    if (count === 0) {
      setExportNotice("Plan eerst een leertaak om een agenda-bestand te downloaden.");
    } else {
      setExportNotice(
        `${count} ${
          count === 1 ? "taak" : "taken"
        } met desktopmelding gedownload (.ics voor Agenda/Outlook).`
      );
    }
    window.setTimeout(() => setExportNotice(null), 5000);
  };

  const renderPermissionSummary = () => {
    if (permission === "granted") {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          <span>Browsermeldingen actief op deze desktop</span>
        </span>
      );
    }
    if (permission === "denied") {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700 dark:text-red-400">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span>Geblokkeerd in browser — sta meldingen toe via het pictogram in de adresbalk</span>
        </span>
      );
    }
    if (permission === "unsupported") {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 dark:text-amber-400">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span>Alleen in-app meldingen beschikbaar in deze browserweergave</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-400">
        <Bell className="w-3.5 h-3.5 shrink-0" />
        <span>Geef toestemming voor systeembrede desktopmeldingen</span>
      </span>
    );
  };

  return (
    <section className="rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 overflow-hidden">
      {/* Header & Permission Actions */}
      <div className="p-5 sm:p-6 border-b border-slate-200 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <BellRing className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Oefenherinneringen op desktop
            </h2>
          </div>
          <div>{renderPermissionSummary()}</div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {permission !== "granted" && permission !== "unsupported" && (
            <button
              type="button"
              onClick={onRequestPermission}
              className="px-3.5 py-2 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
            >
              <BellRing className="w-3.5 h-3.5" />
              <span>Desktopmeldingen toestaan</span>
            </button>
          )}
          <button
            type="button"
            disabled={testing}
            onClick={handleTest}
            className="px-3.5 py-2 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{testing ? "Versturen..." : "Testmelding sturen"}</span>
          </button>
          <button
            type="button"
            disabled={upcomingCount === 0}
            onClick={handleExportIcs}
            title="Download agenda-bestand zodat Windows/macOS Agenda je ook herinnert als je browser dicht is"
            className="px-3.5 py-2 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
          >
            <CalendarPlus className="w-3.5 h-3.5" />
            <span>Agenda (.ics) downloaden</span>
          </button>
        </div>
      </div>

      {(iframeNotice || (inIframe && permission === "default")) && (
        <div className="px-5 sm:px-6 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/40 text-xs text-slate-600 dark:text-slate-300">
          Let op: binnen een ingebed voorbeeldvenster blokkeren sommige browsers systeempops. Open StudyFlow in een eigen browsertabblad voor Windows/macOS-meldingen, of gebruik hier de in-app desktopmelding en de agenda-export (.ics).
        </div>
      )}

      {exportNotice && (
        <div className="px-5 sm:px-6 py-3 border-b border-slate-200 dark:border-slate-800 bg-emerald-50/70 dark:bg-emerald-950/30 text-xs text-emerald-800 dark:text-emerald-300">
          {exportNotice}
        </div>
      )}

      {/* Main 2-Column Content */}
      <div className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-slate-200 dark:divide-slate-800">
        {/* Left: Schedule Settings */}
        <div className="lg:col-span-6 p-5 sm:p-6 space-y-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Herinneringen actief
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Ontvang een melding zodra een vaste oefentijd of leertaak begint.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={settings.enabled}
              onClick={() => onUpdateSettings({ enabled: !settings.enabled })}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                settings.enabled
                  ? "bg-indigo-600 text-white"
                  : "border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400"
              }`}
            >
              {settings.enabled ? "Aan" : "Uit"}
            </button>
          </div>

          <div
            className={`space-y-4 pt-4 border-t border-slate-200 dark:border-slate-800 ${
              settings.enabled ? "" : "opacity-55 pointer-events-none"
            }`}
          >
            {/* Daily reminder time & toggle */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="flex items-center gap-2.5 text-xs font-medium text-slate-800 dark:text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.dailyEnabled}
                  onChange={(e) =>
                    onUpdateSettings({ dailyEnabled: e.target.checked })
                  }
                  className="rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500"
                />
                <span>Dagelijkse vaste oefenherinnering om</span>
              </label>

              <input
                type="time"
                value={settings.dailyTime}
                disabled={!settings.dailyEnabled}
                onChange={(e) =>
                  onUpdateSettings({ dailyTime: e.target.value || "16:30" })
                }
                className="px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm tabular-nums text-slate-900 dark:text-slate-100 disabled:opacity-50"
              />
            </div>

            {/* Weekdays */}
            <div className="space-y-1.5">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Actieve dagen voor dagelijkse herinnering
              </p>
              <div className="flex flex-wrap gap-1.5">
                {WEEKDAY_BUTTONS.map(({ dayIndex, label }) => {
                  const active = settings.daysOfWeek.includes(dayIndex);
                  return (
                    <button
                      key={dayIndex}
                      type="button"
                      disabled={!settings.dailyEnabled}
                      onClick={() => toggleDay(dayIndex)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                        active
                          ? "bg-indigo-600 text-white"
                          : "border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Lead time & Sound */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">
                  Melding bij geplande taak
                </label>
                <select
                  value={settings.leadMinutesBeforeTask}
                  onChange={(e) =>
                    onUpdateSettings({
                      leadMinutesBeforeTask: Number(e.target.value),
                    })
                  }
                  className="w-full px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-slate-100"
                >
                  <option value={0}>Precies op het tijdstip</option>
                  <option value={5}>5 minuten van tevoren</option>
                  <option value={10}>10 minuten van tevoren</option>
                  <option value={15}>15 minuten van tevoren</option>
                  <option value={30}>30 minuten van tevoren</option>
                </select>
              </div>

              <div className="flex items-end">
                <button
                  type="button"
                  onClick={() =>
                    onUpdateSettings({ soundEnabled: !settings.soundEnabled })
                  }
                  className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center justify-center gap-2 whitespace-nowrap"
                >
                  {settings.soundEnabled ? (
                    <>
                      <Volume2 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                      <span>Meldingstoon aan</span>
                    </>
                  ) : (
                    <>
                      <VolumeX className="w-3.5 h-3.5 text-slate-400" />
                      <span>Meldingstoon uit</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Today's Task-Specific Reminders */}
        <div className="lg:col-span-6 p-5 sm:p-6 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Taakherinneringen vandaag
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Stel per openstaande taak een eigen tijdstip in.
              </p>
            </div>
            <span className="text-xs font-mono tabular-nums text-slate-500 dark:text-slate-400">
              {todayPendingTasks.length} open
            </span>
          </div>

          {todayPendingTasks.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500 dark:text-slate-400">
              Geen openstaande leertaken voor vandaag. Plan hieronder een taak of gebruik je dagelijkse vaste oefenherinnering.
            </div>
          ) : (
            <div className="divide-y divide-slate-200 dark:divide-slate-800 max-h-60 overflow-y-auto pr-1">
              {todayPendingTasks.map((task) => {
                const rem = taskReminders[task.id];
                const isActive = Boolean(rem?.enabled);
                return (
                  <div
                    key={task.id}
                    className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {task.title}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate tabular-nums">
                        {task.subject || "Algemeen"} · {task.durationMinutes} min
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <input
                        type="time"
                        value={rem?.time || settings.dailyTime}
                        onChange={(e) =>
                          onUpdateTaskReminder(task.id, {
                            time: e.target.value || settings.dailyTime,
                            enabled: true,
                          })
                        }
                        aria-label={`Herinneringstijd voor ${task.title}`}
                        className="px-2 py-1 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs tabular-nums text-slate-900 dark:text-slate-100"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateTaskReminder(task.id, {
                            time: rem?.time || settings.dailyTime,
                            enabled: !isActive,
                          })
                        }
                        className={`p-1.5 rounded-lg border transition-colors shrink-0 ${
                          isActive
                            ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400"
                            : "border-slate-200 dark:border-slate-700 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                        }`}
                        aria-label={
                          isActive
                            ? `Herinnering uitschakelen voor ${task.title}`
                            : `Herinnering inschakelen voor ${task.title}`
                        }
                      >
                        {isActive ? (
                          <BellRing className="w-3.5 h-3.5" />
                        ) : (
                          <BellOff className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </section>
  );
};
