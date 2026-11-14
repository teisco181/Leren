import type { ScheduleTask, TaskReminderEntry } from "../types";

export type DesktopNotificationPermissionState =
  | "granted"
  | "denied"
  | "default"
  | "unsupported";

export interface NotificationEnvironmentInfo {
  supported: boolean;
  permission: DesktopNotificationPermissionState;
  inIframe: boolean;
  isSecureContext: boolean;
}

let swRegistrationPromise: Promise<ServiceWorkerRegistration | null> | null = null;

export function isRunningInIframe(): boolean {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

export function getNotificationEnvironment(): NotificationEnvironmentInfo {
  const hasNotificationApi = typeof window !== "undefined" && "Notification" in window;
  const inIframe = typeof window !== "undefined" ? isRunningInIframe() : false;
  const isSecureContext = typeof window !== "undefined" ? Boolean(window.isSecureContext) : false;

  if (!hasNotificationApi) {
    return {
      supported: false,
      permission: "unsupported",
      inIframe,
      isSecureContext,
    };
  }

  return {
    supported: true,
    permission: Notification.permission as DesktopNotificationPermissionState,
    inIframe,
    isSecureContext,
  };
}

export async function ensureReminderServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }
  if (!swRegistrationPromise) {
    swRegistrationPromise = navigator.serviceWorker
      .register("/reminder-sw.js")
      .then((reg) => reg)
      .catch(() => null);
  }
  return swRegistrationPromise;
}

export async function requestDesktopNotificationPermission(): Promise<{
  permission: DesktopNotificationPermissionState;
  blockedByIframe: boolean;
}> {
  const env = getNotificationEnvironment();
  if (!env.supported) {
    return { permission: "unsupported", blockedByIframe: env.inIframe };
  }

  try {
    const result = await Notification.requestPermission();
    if (result === "granted") {
      await ensureReminderServiceWorker();
    }
    const blockedByIframe = result !== "granted" && env.inIframe;
    return {
      permission: result as DesktopNotificationPermissionState,
      blockedByIframe,
    };
  } catch {
    return {
      permission: (Notification.permission as DesktopNotificationPermissionState) || "default",
      blockedByIframe: env.inIframe,
    };
  }
}

export function playReminderChime(): void {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const playTone = (freq: number, startOffset: number, duration: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now + startOffset);
      gain.gain.setValueAtTime(0.0001, now + startOffset);
      gain.gain.exponentialRampToValueAtTime(0.09, now + startOffset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + startOffset + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + startOffset);
      osc.stop(now + startOffset + duration);
    };

    playTone(587.33, 0, 0.22); // D5
    playTone(880.0, 0.14, 0.34); // A5
    window.setTimeout(() => {
      ctx.close().catch(() => {});
    }, 800);
  } catch {
    // Audio playback may be blocked prior to user interaction
  }
}

export async function triggerOsDesktopNotification(params: {
  title: string;
  body: string;
  tag: string;
  section?: string;
  onFocusClick?: () => void;
}): Promise<boolean> {
  const env = getNotificationEnvironment();
  if (!env.supported || env.permission !== "granted") {
    return false;
  }

  try {
    const reg = await ensureReminderServiceWorker();
    if (reg && typeof reg.showNotification === "function") {
      const swOptions: NotificationOptions & { renotify?: boolean } = {
        body: params.body,
        tag: params.tag,
        renotify: true,
        requireInteraction: false,
        data: {
          url: window.location.origin,
          section: params.section || "dashboard",
        },
      };
      await reg.showNotification(params.title, swOptions);
      return true;
    }
  } catch {
    // Fall back to direct Notification constructor below
  }

  try {
    const notif = new Notification(params.title, {
      body: params.body,
      tag: params.tag,
    });
    notif.onclick = () => {
      try {
        window.focus();
      } catch {
        // ignore focus error
      }
      notif.close();
      if (params.onFocusClick) params.onFocusClick();
    };
    return true;
  } catch {
    return false;
  }
}

function escapeIcsText(text: string): string {
  return (text || "")
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function formatIcsLocalDateTime(dateStr: string, timeStr: string, addMinutes = 0): string {
  const [yyyy, mm, dd] = dateStr.split("-").map(Number);
  const [hh, min] = timeStr.split(":").map(Number);
  const dt = new Date(yyyy, (mm || 1) - 1, dd || 1, hh || 16, min || 30, 0);
  dt.setMinutes(dt.getMinutes() + addMinutes);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}${pad(dt.getMonth() + 1)}${pad(dt.getDate())}T${pad(
    dt.getHours()
  )}${pad(dt.getMinutes())}00`;
}

/**
 * Generates and downloads a standard .ics calendar file with desktop VALARM notifications
 * for all uncompleted planned StudyFlow tasks so macOS/Windows Agenda apps notify even
 * when the browser tab is closed.
 */
export function downloadTasksIcsWithReminders(
  tasks: ScheduleTask[],
  taskReminders: Record<string, TaskReminderEntry>,
  defaultTime: string,
  leadMinutes: number
): number {
  const upcoming = tasks.filter((t) => !t.completed);
  if (upcoming.length === 0) return 0;

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//StudyFlow//Desktop Oefenherinneringen//NL",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];

  const triggerMinutes = Math.max(0, leadMinutes || 10);
  const nowStamp = new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z";

  for (const task of upcoming) {
    const rem = taskReminders[task.id];
    const startTime = rem?.time || defaultTime || "16:30";
    const dtStart = formatIcsLocalDateTime(task.date, startTime, 0);
    const dtEnd = formatIcsLocalDateTime(task.date, startTime, Math.max(15, task.durationMinutes));

    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${task.id}@studyflow.local`);
    lines.push(`DTSTAMP:${nowStamp}`);
    lines.push(`DTSTART:${dtStart}`);
    lines.push(`DTEND:${dtEnd}`);
    lines.push(`SUMMARY:${escapeIcsText(`Oefenen: ${task.title} (${task.subject || "Studie"})`)}`);
    lines.push(
      `DESCRIPTION:${escapeIcsText(
        task.notes
          ? `${task.notes} — Gepland in StudyFlow (${task.durationMinutes} min).`
          : `Geplande StudyFlow-oefensessie (${task.durationMinutes} min).`
      )}`
    );
    lines.push("BEGIN:VALARM");
    lines.push(`TRIGGER:-PT${triggerMinutes}M`);
    lines.push("ACTION:DISPLAY");
    lines.push(`DESCRIPTION:${escapeIcsText(`Tijd om te oefenen: ${task.title}`)}`);
    lines.push("END:VALARM");
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");

  const blob = new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "studyflow-oefenherinneringen.ics";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  return upcoming.length;
}
