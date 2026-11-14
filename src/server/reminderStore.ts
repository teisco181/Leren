import fs from "fs";
import path from "path";
import type {
  DesktopReminderSettings,
  DesktopReminderState,
  TaskReminderEntry,
} from "../types";

interface ReminderUserFileData extends DesktopReminderState {
  uid: string;
  updatedAt: number;
}

export const DEFAULT_REMINDER_SETTINGS: DesktopReminderSettings = {
  enabled: true,
  dailyEnabled: true,
  dailyTime: "16:30",
  daysOfWeek: [1, 2, 3, 4, 5],
  leadMinutesBeforeTask: 10,
  soundEnabled: true,
  snoozeMinutes: 10,
};

const STORE_DIR = path.join(process.cwd(), ".data", "reminder-users");

function ensureStoreDir() {
  if (!fs.existsSync(STORE_DIR)) {
    fs.mkdirSync(STORE_DIR, { recursive: true });
  }
}

function getUserFilePath(uid: string): string {
  const safeUid = uid.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 128);
  if (!safeUid) {
    throw new Error("Ongeldige gebruikers-ID.");
  }
  return path.join(STORE_DIR, `${safeUid}.json`);
}

function isValidTime(val: unknown): val is string {
  return typeof val === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(val.trim());
}

export function sanitizeReminderSettings(
  raw?: Partial<DesktopReminderSettings>
): DesktopReminderSettings {
  const days = Array.isArray(raw?.daysOfWeek)
    ? Array.from(
        new Set(
          raw!.daysOfWeek
            .map((d) => Number(d))
            .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
        )
      )
    : DEFAULT_REMINDER_SETTINGS.daysOfWeek;

  const leadRaw = Number(raw?.leadMinutesBeforeTask);
  const leadMinutes = [0, 5, 10, 15, 30].includes(leadRaw)
    ? leadRaw
    : DEFAULT_REMINDER_SETTINGS.leadMinutesBeforeTask;

  const snoozeRaw = Number(raw?.snoozeMinutes);
  const snoozeMinutes =
    Number.isFinite(snoozeRaw) && snoozeRaw >= 5 && snoozeRaw <= 60
      ? Math.round(snoozeRaw)
      : DEFAULT_REMINDER_SETTINGS.snoozeMinutes;

  return {
    enabled:
      raw?.enabled !== undefined ? Boolean(raw.enabled) : DEFAULT_REMINDER_SETTINGS.enabled,
    dailyEnabled:
      raw?.dailyEnabled !== undefined
        ? Boolean(raw.dailyEnabled)
        : DEFAULT_REMINDER_SETTINGS.dailyEnabled,
    dailyTime: isValidTime(raw?.dailyTime)
      ? raw!.dailyTime.trim()
      : DEFAULT_REMINDER_SETTINGS.dailyTime,
    daysOfWeek: days,
    leadMinutesBeforeTask: leadMinutes,
    soundEnabled:
      raw?.soundEnabled !== undefined
        ? Boolean(raw.soundEnabled)
        : DEFAULT_REMINDER_SETTINGS.soundEnabled,
    snoozeMinutes,
  };
}

function pruneOldFiredKeys(firedKeys: Record<string, number>): Record<string, number> {
  const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
  const result: Record<string, number> = {};
  for (const [key, ts] of Object.entries(firedKeys)) {
    if (typeof ts === "number" && ts >= cutoff) {
      result[key] = ts;
    }
  }
  return result;
}

function loadUserReminders(uid: string): ReminderUserFileData {
  ensureStoreDir();
  const filePath = getUserFilePath(uid);
  if (!fs.existsSync(filePath)) {
    return {
      uid,
      updatedAt: Date.now(),
      settings: { ...DEFAULT_REMINDER_SETTINGS },
      taskReminders: {},
      firedKeys: {},
    };
  }

  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<ReminderUserFileData>;
    const taskReminders: Record<string, TaskReminderEntry> = {};
    if (parsed.taskReminders && typeof parsed.taskReminders === "object") {
      for (const [taskId, entry] of Object.entries(parsed.taskReminders)) {
        if (entry && isValidTime(entry.time)) {
          taskReminders[taskId] = {
            time: entry.time.trim(),
            enabled: Boolean(entry.enabled),
          };
        }
      }
    }
    return {
      uid,
      updatedAt: Number(parsed.updatedAt) || Date.now(),
      settings: sanitizeReminderSettings(parsed.settings),
      taskReminders,
      firedKeys:
        parsed.firedKeys && typeof parsed.firedKeys === "object"
          ? pruneOldFiredKeys(parsed.firedKeys)
          : {},
    };
  } catch {
    return {
      uid,
      updatedAt: Date.now(),
      settings: { ...DEFAULT_REMINDER_SETTINGS },
      taskReminders: {},
      firedKeys: {},
    };
  }
}

function saveUserReminders(uid: string, data: ReminderUserFileData): void {
  ensureStoreDir();
  const filePath = getUserFilePath(uid);
  data.updatedAt = Date.now();
  data.firedKeys = pruneOldFiredKeys(data.firedKeys);
  const tmpPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(tmpPath, filePath);
}

export function getReminderState(uid: string): DesktopReminderState {
  const data = loadUserReminders(uid);
  return {
    settings: data.settings,
    taskReminders: data.taskReminders,
    firedKeys: data.firedKeys,
  };
}

export function updateReminderSettings(
  uid: string,
  updates: Partial<DesktopReminderSettings>
): DesktopReminderState {
  const data = loadUserReminders(uid);
  data.settings = sanitizeReminderSettings({ ...data.settings, ...updates });
  saveUserReminders(uid, data);
  return {
    settings: data.settings,
    taskReminders: data.taskReminders,
    firedKeys: data.firedKeys,
  };
}

export function setTaskReminder(
  uid: string,
  taskId: string,
  entry: { time?: string; enabled?: boolean; remove?: boolean }
): DesktopReminderState {
  const cleanTaskId = taskId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 128);
  if (!cleanTaskId) {
    throw new Error("Ongeldige taak-ID.");
  }
  const data = loadUserReminders(uid);
  if (entry.remove) {
    delete data.taskReminders[cleanTaskId];
  } else {
    const existing = data.taskReminders[cleanTaskId];
    const nextTime = isValidTime(entry.time)
      ? entry.time.trim()
      : existing?.time || data.settings.dailyTime;
    data.taskReminders[cleanTaskId] = {
      time: nextTime,
      enabled: entry.enabled !== undefined ? Boolean(entry.enabled) : true,
    };
  }
  saveUserReminders(uid, data);
  return {
    settings: data.settings,
    taskReminders: data.taskReminders,
    firedKeys: data.firedKeys,
  };
}

export function markReminderFired(
  uid: string,
  key: string,
  timestampMs?: number
): DesktopReminderState {
  const cleanKey = (key || "").trim().slice(0, 180);
  if (!cleanKey) {
    return getReminderState(uid);
  }
  const data = loadUserReminders(uid);
  data.firedKeys[cleanKey] =
    typeof timestampMs === "number" && Number.isFinite(timestampMs)
      ? timestampMs
      : Date.now();
  saveUserReminders(uid, data);
  return {
    settings: data.settings,
    taskReminders: data.taskReminders,
    firedKeys: data.firedKeys,
  };
}
