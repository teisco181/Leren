import React from 'react';

export const DashboardSkeleton: React.FC = () => (
  <div className="space-y-6 animate-pulse">
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-24 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5"
        >
          <div className="h-3 w-24 bg-slate-200 dark:bg-slate-800 rounded" />
          <div className="mt-4 h-6 w-16 bg-slate-200 dark:bg-slate-800 rounded" />
        </div>
      ))}
    </div>
    <div className="h-72 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-6 space-y-4">
      <div className="h-4 w-48 bg-slate-200 dark:bg-slate-800 rounded" />
      {[0, 1, 2, 3].map((row) => (
        <div key={row} className="h-11 bg-slate-100 dark:bg-slate-800/60 rounded-lg" />
      ))}
    </div>
  </div>
);

export const ListSkeleton: React.FC<{ rows?: number }> = ({ rows = 4 }) => (
  <div className="space-y-2.5 animate-pulse">
    {Array.from({ length: rows }).map((_, i) => (
      <div
        key={i}
        className="h-14 rounded-lg bg-slate-100 dark:bg-slate-800/60 border border-slate-200/70 dark:border-slate-800"
      />
    ))}
  </div>
);
