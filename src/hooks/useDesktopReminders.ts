import { useCallback, useEffect, useRef, useState } from "react";
import type {
  ActiveDesktopReminderToast,
  AppSection,
  DesktopReminderSettings,
  DesktopReminderState,
  ScheduleTask,
} from "../types";
import { apiGet, apiPost, apiPut } from "../lib/apiClient";
import {
  ensureReminderServiceWorker,
  getNotificationEnvironment,
  playReminderChime,
  requestDesktopNotificationPermission,
  triggerOsDesktopNotification,
  type DesktopNotificationPermissionState,
} from "../lib/desktopNotifications";

const DEFAULT_SETTINGS: DesktopReminderSettings = {
  enabled: true,
  dailyEnabled: true,
  dailyTime: "16:30",
  daysOfWeek: [1, 2, 3, 4, 5],
  leadMinutesBeforeTask: 10,
  soundEnabled: true,
  snoozeMinutes: 10,
};

function getTodayDateStr(now = new Date()): string {
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function parseHhMmToMinutes(hhmm: string): number {
  const [h, m] = (hhmm || "16:30").split(":").map(Number);
  return (Number.isFinite(h) ? h : 16) * 60 + (Number.isFinite(m) ? m : 30);
}

interface SnoozedReminderItem {
  id: string;
  dueAt: number;
  title: string;
  body: string;
  metaText: string;
  taskId?: string;
}

export function useDesktopReminders(params: {
  userId: string | null;
  tasks: ScheduleTask[];
  aiEnabled: boolean;
  onNavigateSection: (sec: AppSection) => void;
}) {
  const { userId, tasks, aiEnabled, onNavigateSection } = params;

  const [state, setState] = useState<DesktopReminderState>({
    settings: DEFAULT_SETTINGS,
    taskReminders: {},
    firedKeys: {},
  });
  const [loaded, setLoaded] = useState(false);
  const [permission, setPermission] = useState<DesktopNotificationPermissionState>(() =>
    getNotificationEnvironment().permission
  );
  const [inIframe] = useState<boolean>(() => getNotificationEnvironment().inIframe);
  const [iframeNotice, setIframeNotice] = useState(false);
  const [activeToasts, setActiveToasts] = useState<ActiveDesktopReminderToast[]>([]);
  const [snoozedQueue, setSnoozedQueue] = useState<SnoozedReminderItem[]>([]);

  const stateRef = useRef(state);
  stateRef.current = state;
  const tasksRef = useRef(tasks);
  tasksRef.current = tasks;
  const locallyFiredRef = useRef<Set<string>>(new Set());

  const targetPracticeSection: AppSection = aiEnabled ? "practice" : "games";

  // Refresh permission when user returns to tab
  useEffect(() => {
    const refreshPermission = () => {
      const env = getNotificationEnvironment();
      setPermission(env.permission);
      if (env.permission === "granted") {
        ensureReminderServiceWorker().catch(() => {});
      }
    };
    refreshPermission();
    window.addEventListener("focus", refreshPermission);
    document.addEventListener("visibilitychange", refreshPermission);
    return () => {
      window.removeEventListener("focus", refreshPermission);
      document.removeEventListener("visibilitychange", refreshPermission);
    };
  }, []);

  // Listen for Service Worker notification clicks
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === "STUDYFLOW_REMINDER_CLICK") {
        onNavigateSection(aiEnabled ? "practice" : "dashboard");
      }
    };
    navigator.serviceWorker.addEventListener("message", onMessage);
    return () => navigator.serviceWorker.removeEventListener("message", onMessage);
  }, [aiEnabled, onNavigateSection]);

  // Load user's server-saved reminder state
  useEffect(() => {
    if (!userId) {
      setLoaded(false);
      setActiveToasts([]);
      setSnoozedQueue([]);
      locallyFiredRef.current.clear();
      return;
    }

    let cancelled = false;
    apiGet<DesktopReminderState>("/api/reminders", { requireAuth: true })
      .then((res) => {
        if (cancelled) return;
        setState(res);
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const fireReminder = useCallback(
    async (opts: {
      key: string;
      title: string;
      body: string;
      metaText: string;
      taskId?: string;
      persistFiredKey?: boolean;
    }) => {
      const currentSettings = stateRef.current.settings;

      if (opts.persistFiredKey && userId) {
        locallyFiredRef.current.add(opts.key);
        setState((prev) => ({
          ...prev,
          firedKeys: { ...prev.firedKeys, [opts.key]: Date.now() },
        }));
        apiPost<DesktopReminderState>("/api/reminders/fired", {
          key: opts.key,
          timestampMs: Date.now(),
        })
          .then((updated) => setState(updated))
          .catch(() => {});
      }

      if (currentSettings.soundEnabled) {
        playReminderChime();
      }

      // Show in-app desktop reminder toast banner cleanly
      const toastId = `${opts.key}_${Date.now()}`;
      setActiveToasts((prev) => {
        const filtered = prev.filter((t) => t.taskId !== opts.taskId || !opts.taskId);
        return [
          ...filtered.slice(-2),
          {
            id: toastId,
            title: opts.title,
            body: opts.body,
            metaText: opts.metaText,
            taskId: opts.taskId,
            triggeredAt: Date.now(),
          },
        ];
      });

      // Attempt native OS desktop notification when permitted
      await triggerOsDesktopNotification({
        title: opts.title,
        body: `${opts.body} (${opts.metaText})`,
        tag: opts.key,
        section: targetPracticeSection,
        onFocusClick: () => onNavigateSection(targetPracticeSection),
      });
    },
    [onNavigateSection, targetPracticeSection, userId]
  );

  // Background scheduler loop (checks every 15s + on visibility focus)
  useEffect(() => {
    if (!userId || !loaded) return;

    const evaluateDueReminders = () => {
      const current = stateRef.current;
      if (!current.settings.enabled) return;

      const now = new Date();
      const nowMs = now.getTime();
      const todayStr = getTodayDateStr(now);
      const dayOfWeek = now.getDay();
      const nowMinutes = now.getHours() * 60 + now.getMinutes();

      // 1. Check snoozed items first
      setSnoozedQueue((prev) => {
        const due = prev.filter((item) => item.dueAt <= nowMs);
        if (due.length === 0) return prev;
        const remaining = prev.filter((item) => item.dueAt > nowMs);
        for (const item of due) {
          fireReminder({
            key: `snooze:${item.id}`,
            title: item.title,
            body: item.body,
            metaText: item.metaText,
            taskId: item.taskId,
            persistFiredKey: false,
          });
        }
        return remaining;
      });

      const alreadyFired = (k: string) =>
        Boolean(current.firedKeys[k]) || locallyFiredRef.current.has(k);

      // 2. Check specific scheduled task reminders for today
      const todayPendingTasks = tasksRef.current.filter(
        (t) => t.date === todayStr && !t.completed
      );

      for (const task of todayPendingTasks) {
        const rem = current.taskReminders[task.id];
        if (!rem || !rem.enabled) continue;

        const targetMinutes =
          parseHhMmToMinutes(rem.time) - (current.settings.leadMinutesBeforeTask || 0);
        // Fire within a 90-minute window after scheduled reminder time so late tab opens still catch it,
        // without triggering hours later from early morning.
        if (nowMinutes >= targetMinutes && nowMinutes <= targetMinutes + 90) {
          const key = `task:${task.id}:${todayStr}:${rem.time}`;
          if (!alreadyFired(key)) {
            fireReminder({
              key,
              title: `Tijd om te oefenen: ${task.title}`,
              body:
                task.notes?.trim() ||
                `Geplande leersessie voor ${task.subject || "Algemeen"}.`,
              metaText: `${task.subject || "Algemeen"} · ${task.durationMinutes} min · Gepland om ${rem.time}`,
              taskId: task.id,
              persistFiredKey: true,
            });
          }
        }
      }

      // 3. Check daily fixed study reminder
      if (
        current.settings.dailyEnabled &&
        current.settings.daysOfWeek.includes(dayOfWeek)
      ) {
        const dailyTargetMin = parseHhMmToMinutes(current.settings.dailyTime);
        if (nowMinutes >= dailyTargetMin && nowMinutes <= dailyTargetMin + 180) {
          const dailyKey = `daily:${todayStr}:${current.settings.dailyTime}`;
          if (!alreadyFired(dailyKey)) {
            const pendingCount = todayPendingTasks.length;
            const body =
              pendingCount > 0
                ? `Je hebt vandaag nog ${pendingCount} ${
                    pendingCount === 1 ? "leertaak" : "leertaken"
                  } openstaan, beginnend met "${todayPendingTasks[0].title}".`
                : "Neem een kort moment om je leerstof actief te herhalen en kennis op peil te houden.";
            fireReminder({
              key: dailyKey,
              title: "Dagelijkse oefenherinnering",
              body,
              metaText: `StudyFlow · Dagelijks om ${current.settings.dailyTime}`,
              persistFiredKey: true,
            });
          }
        }
      }
    };

    evaluateDueReminders();
    const timer = window.setInterval(evaluateDueReminders, 15000);
    window.addEventListener("focus", evaluateDueReminders);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", evaluateDueReminders);
    };
  }, [userId, loaded, fireReminder]);

  const requestPermission = useCallback(async () => {
    const result = await requestDesktopNotificationPermission();
    setPermission(result.permission);
    if (result.blockedByIframe) {
      setIframeNotice(true);
    } else {
      setIframeNotice(false);
    }
    return result;
  }, []);

  const updateSettings = useCallback(
    async (partial: Partial<DesktopReminderSettings>) => {
      setState((prev) => ({
        ...prev,
        settings: { ...prev.settings, ...partial },
      }));
      if (!userId) return;
      try {
        const updated = await apiPut<DesktopReminderState>("/api/reminders/settings", partial);
        setState(updated);
      } catch {
        // Keep optimistic UI update
      }
    },
    [userId]
  );

  const updateTaskReminder = useCallback(
    async (
      taskId: string,
      payload: { time?: string; enabled?: boolean; remove?: boolean }
    ) => {
      setState((prev) => {
        const nextMap = { ...prev.taskReminders };
        if (payload.remove) {
          delete nextMap[taskId];
        } else {
          const existing = nextMap[taskId];
          nextMap[taskId] = {
            time: payload.time || existing?.time || prev.settings.dailyTime,
            enabled:
              payload.enabled !== undefined ? payload.enabled : true,
          };
        }
        return { ...prev, taskReminders: nextMap };
      });
      if (!userId) return;
      try {
        const updated = await apiPut<DesktopReminderState>(
          `/api/reminders/tasks/${encodeURIComponent(taskId)}`,
          payload
        );
        setState(updated);
      } catch {
        // Keep optimistic UI update
      }
    },
    [userId]
  );

  const sendTestReminder = useCallback(async () => {
    const todayStr = getTodayDateStr();
    const pending = tasksRef.current.filter((t) => t.date === todayStr && !t.completed);
    const body =
      pending.length > 0
        ? `Vandaag gepland: "${pending[0].title}" (${pending[0].durationMinutes} min).`
        : "Zo ziet jouw StudyFlow-oefenherinnering op de desktop eruit.";
    await fireReminder({
      key: `test:${Date.now()}`,
      title: "Testmelding — Tijd om te oefenen",
      body,
      metaText: "StudyFlow Desktopherinnering",
      persistFiredKey: false,
    });
  }, [fireReminder]);

  const dismissToast = useCallback((id: string) => {
    setActiveToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const snoozeToast = useCallback((toast: ActiveDesktopReminderToast) => {
    const snoozeMin = stateRef.current.settings.snoozeMinutes || 10;
    setActiveToasts((prev) => prev.filter((t) => t.id !== toast.id));
    setSnoozedQueue((prev) => [
      ...prev,
      {
        id: `${toast.id}_snoozed`,
        dueAt: Date.now() + snoozeMin * 60 * 1000,
        title: toast.title,
        body: toast.body,
        metaText: `Uitgesteld (${snoozeMin} min) · ${toast.metaText}`,
        taskId: toast.taskId,
      },
    ]);
  }, []);

  return {
    settings: state.settings,
    taskReminders: state.taskReminders,
    permission,
    inIframe,
    iframeNotice,
    activeToasts,
    requestPermission,
    updateSettings,
    updateTaskReminder,
    sendTestReminder,
    dismissToast,
    snoozeToast,
  };
}
