import React from 'react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { ThemePreference } from '../types';

interface ThemeSelectorProps {
  value: ThemePreference;
  onChange: (theme: ThemePreference) => void;
  compact?: boolean;
}

const OPTIONS: Array<{
  id: ThemePreference;
  label: string;
  title: string;
  Icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'light', label: 'Licht', title: 'Lichte modus', Icon: Sun },
  { id: 'dark', label: 'Donker', title: 'Donkere modus', Icon: Moon },
  { id: 'system', label: 'Systeem', title: 'Volg apparaatinstelling', Icon: Monitor },
];

export const ThemeSelector: React.FC<ThemeSelectorProps> = ({
  value,
  onChange,
  compact = false,
}) => {
  return (
    <div
      role="group"
      aria-label="Thema-instelling"
      className="inline-flex items-center gap-0.5 p-1 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shrink-0"
    >
      {OPTIONS.map(({ id, label, title, Icon }) => {
        const active = value === id;
        return (
          <button
            key={id}
            type="button"
            title={title}
            aria-label={title}
            aria-pressed={active}
            onClick={() => onChange(id)}
            className={`px-2 py-1 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
              active
                ? 'bg-white dark:bg-[#161D2B] text-slate-900 dark:text-slate-100 shadow-xs'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Icon className="w-3.5 h-3.5 shrink-0" />
            <span className={compact ? 'hidden sm:inline' : ''}>{label}</span>
          </button>
        );
      })}
    </div>
  );
};
