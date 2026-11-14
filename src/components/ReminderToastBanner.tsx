import React from "react";
import { BellRing, Clock, Play, X } from "lucide-react";
import type { ActiveDesktopReminderToast } from "../types";

interface ReminderToastBannerProps {
  toasts: ActiveDesktopReminderToast[];
  snoozeMinutes: number;
  actionLabel: string;
  onAction: (toast: ActiveDesktopReminderToast) => void;
  onSnooze: (toast: ActiveDesktopReminderToast) => void;
  onDismiss: (id: string) => void;
}

export const ReminderToastBanner: React.FC<ReminderToastBannerProps> = ({
  toasts,
  snoozeMinutes,
  actionLabel,
  onAction,
  onSnooze,
  onDismiss,
}) => {
  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-3 w-[calc(100vw-2rem)] max-w-sm pointer-events-none"
      role="region"
      aria-label="Oefenherinneringen"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className="pointer-events-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111827] shadow-lg p-4 space-y-3"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 min-w-0">
              <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 shrink-0">
                <BellRing className="w-4 h-4" />
              </div>
              <div className="min-w-0 space-y-1">
                <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  {toast.metaText}
                </p>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 leading-snug">
                  {toast.title}
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                  {toast.body}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 shrink-0"
              aria-label="Herinnering sluiten"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={() => onSnooze(toast)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Clock className="w-3.5 h-3.5" />
              <span>{snoozeMinutes} min uitstellen</span>
            </button>
            <button
              type="button"
              onClick={() => onAction(toast)}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Play className="w-3.5 h-3.5" />
              <span>{actionLabel}</span>
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};
