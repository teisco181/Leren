import React, { useMemo, useState } from 'react';
import {
  BookOpen,
  ChevronDown,
  ChevronUp,
  Plus,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { StudyItem, Summary } from '../types';
import { createSummary, deleteSummary } from '../lib/studyStore';
import { MarkdownView } from './MarkdownView';
import { ConfirmModal } from './ConfirmModal';
import { ListSkeleton } from './Skeletons';
import { postAiJson } from '../lib/apiClient';

interface SummariesViewProps {
  userId: string;
  summaries: Summary[];
  items: StudyItem[];
  loading: boolean;
}

export const SummariesView: React.FC<SummariesViewProps> = ({
  userId,
  summaries,
  items,
  loading,
}) => {
  const [selectedSubject, setSelectedSubject] = useState<string>('Alle');
  const [activeSummaryId, setActiveSummaryId] = useState<string | null>(null);
  const [revealedAnswers, setRevealedAnswers] = useState<Record<number, boolean>>({});

  // Create Manual / AI Modal
  const [modalMode, setModalMode] = useState<'manual' | 'ai' | null>(null);
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [manualContent, setManualContent] = useState('');
  const [selectedSourceId, setSelectedSourceId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<Summary | null>(null);
  const [deleting, setDeleting] = useState(false);

  const subjects = useMemo(() => {
    const set = new Set<string>();
    summaries.forEach((s) => set.add(s.subject || 'Algemeen'));
    return ['Alle', ...Array.from(set).sort((a, b) => a.localeCompare(b, 'nl'))];
  }, [summaries]);

  const filteredSummaries = useMemo(() => {
    if (selectedSubject === 'Alle') return summaries;
    return summaries.filter((s) => (s.subject || 'Algemeen') === selectedSubject);
  }, [summaries, selectedSubject]);

  const activeSummary = useMemo(
    () =>
      summaries.find((s) => s.id === activeSummaryId) || filteredSummaries[0] || null,
    [summaries, activeSummaryId, filteredSummaries]
  );

  const handleSaveManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !manualContent.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const id = await createSummary(userId, {
        title,
        subject: subject || 'Algemeen',
        sourceItemId: '',
        sourceTitle: 'Handmatig geschreven',
        content: manualContent,
        keyTerms: [],
        selfTest: [],
      });
      setActiveSummaryId(id);
      setModalMode(null);
      setTitle('');
      setManualContent('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kon samenvatting niet opslaan.');
    } finally {
      setBusy(false);
    }
  };

  const handleGenerateAi = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const source = items.find((i) => i.id === selectedSourceId);
    if (!source) {
      setError('Selecteer eerst een notitie of PDF uit je mappen.');
      return;
    }
    setBusy(true);
    try {
      const data = await postAiJson<{
        summaryTitle?: string;
        content?: string;
        keyTerms?: Array<{ term: string; definition: string }>;
        selfTest?: Array<{ question: string; answer: string }>;
      }>('/api/ai/summary', {
        title: source.title,
        subject: subject || source.subject || 'Algemeen',
        content: source.content,
        sourceType: source.type,
      });

      const id = await createSummary(userId, {
        title: data.summaryTitle || `Samenvatting: ${source.title}`,
        subject: subject || source.subject || 'Algemeen',
        sourceItemId: source.id,
        sourceTitle: source.title,
        content: data.content || '',
        keyTerms: Array.isArray(data.keyTerms) ? data.keyTerms : [],
        selfTest: Array.isArray(data.selfTest) ? data.selfTest : [],
      });
      setActiveSummaryId(id);
      setRevealedAnswers({});
      setModalMode(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fout bij genereren van samenvatting.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <ListSkeleton rows={5} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
            Samenvattingen per vak
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
            Schrijf zelf samenvattingen of genereer kernbegrippen en zelftests met AI.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={() => {
              setError(null);
              setSelectedSourceId(items[0]?.id || '');
              setSubject(items[0]?.subject || '');
              setModalMode('ai');
            }}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-2 whitespace-nowrap shrink-0"
          >
            <Sparkles className="w-4 h-4" />
            <span>Genereer AI Samenvatting</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setError(null);
              setModalMode('manual');
            }}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2 whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Zelf schrijven</span>
          </button>
        </div>
      </div>

      {/* Subject Filter Tabs */}
      {subjects.length > 1 && (
        <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800 w-fit max-w-full overflow-x-auto">
          {subjects.map((sub) => (
            <button
              key={sub}
              type="button"
              onClick={() => setSelectedSubject(sub)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                selectedSubject === sub
                  ? 'bg-white dark:bg-[#161D2B] text-slate-900 dark:text-slate-100 shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              {sub}
            </button>
          ))}
        </div>
      )}

      {filteredSummaries.length === 0 ? (
        <div className="rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-12 text-center space-y-3">
          <BookOpen className="w-8 h-8 text-slate-400 mx-auto" />
          <p className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Nog geen samenvattingen opgeslagen
          </p>
          <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto">
            Kies een notitie of PDF uit je mappen en laat StudyFlow een heldere samenvatting met
            zelftestvragen maken.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Summary List */}
          <div className="lg:col-span-4 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 divide-y divide-slate-200 dark:divide-slate-800 overflow-hidden">
            {filteredSummaries.map((sum) => {
              const isSelected = activeSummary?.id === sum.id;
              return (
                <div
                  key={sum.id}
                  className={`p-4 flex items-start justify-between gap-2 transition-colors ${
                    isSelected
                      ? 'bg-indigo-50/70 dark:bg-indigo-950/30'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      setActiveSummaryId(sum.id);
                      setRevealedAnswers({});
                    }}
                    className="text-left min-w-0 flex-1"
                  >
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {sum.title}
                    </p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 truncate">
                      {sum.subject} · {sum.keyTerms.length} begrippen
                    </p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(sum)}
                    className="p-1.5 rounded-md text-slate-400 hover:text-red-600 dark:hover:text-red-400 shrink-0"
                    aria-label="Samenvatting verwijderen"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
          </div>

          {/* Active Summary Reader */}
          {activeSummary && (
            <div className="lg:col-span-8 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-6 sm:p-8 space-y-8">
              <div className="border-b border-slate-200 dark:border-slate-800 pb-5">
                <p className="text-xs font-medium text-indigo-600 dark:text-indigo-400">
                  {activeSummary.subject} · Bron: {activeSummary.sourceTitle || 'Eigen notitie'}
                </p>
                <h2 className="mt-1.5 text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">
                  {activeSummary.title}
                </h2>
              </div>

              <MarkdownView content={activeSummary.content} />

              {activeSummary.keyTerms.length > 0 && (
                <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-800">
                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    Kernbegrippen
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {activeSummary.keyTerms.map((kt, idx) => (
                      <div
                        key={idx}
                        className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800"
                      >
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {kt.term}
                        </p>
                        <p className="mt-1 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                          {kt.definition}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeSummary.selfTest.length > 0 && (
                <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-800">
                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                    Korte zelftest (actieve herinnering)
                  </h3>
                  <div className="space-y-2.5">
                    {activeSummary.selfTest.map((qa, idx) => {
                      const open = Boolean(revealedAnswers[idx]);
                      return (
                        <div
                          key={idx}
                          className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/50 overflow-hidden"
                        >
                          <button
                            type="button"
                            onClick={() =>
                              setRevealedAnswers((prev) => ({ ...prev, [idx]: !open }))
                            }
                            className="w-full p-4 text-left flex items-center justify-between gap-3"
                          >
                            <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                              {idx + 1}. {qa.question}
                            </span>
                            {open ? (
                              <ChevronUp className="w-4 h-4 text-slate-400 shrink-0" />
                            ) : (
                              <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                            )}
                          </button>
                          {open && (
                            <div className="px-4 pb-4 pt-1 text-sm text-indigo-700 dark:text-indigo-300 border-t border-slate-200/70 dark:border-slate-800">
                              {qa.answer}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Modal: Manual or AI Summary */}
      {modalMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-6">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                {modalMode === 'ai'
                  ? 'Genereer AI Samenvatting'
                  : 'Nieuwe samenvatting schrijven'}
              </h3>
              <button
                type="button"
                onClick={() => setModalMode(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {error && (
              <div className="mt-4 p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300">
                {error}
              </div>
            )}

            {modalMode === 'ai' ? (
              <form onSubmit={handleGenerateAi} className="mt-5 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Kies bronbestand uit je mappen
                  </label>
                  <select
                    required
                    value={selectedSourceId}
                    onChange={(e) => {
                      setSelectedSourceId(e.target.value);
                      const found = items.find((i) => i.id === e.target.value);
                      if (found?.subject) setSubject(found.subject);
                    }}
                    className="w-full px-3.5 py-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm"
                  >
                    {items.length === 0 ? (
                      <option value="">Geen bestanden gevonden</option>
                    ) : (
                      items.map((item) => {
                        const kindLabel = item.type === 'pdf' ? 'PDF' : 'Notitie';
                        return (
                          <option key={item.id} value={item.id}>
                            {item.title} ({kindLabel} · {item.subject || 'Algemeen'})
                          </option>
                        );
                      })
                    )}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Vaknaam
                  </label>
                  <input
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Bijv. Aardrijkskunde"
                    className="w-full px-3.5 py-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm"
                  />
                </div>

                <div className="pt-2 flex justify-end gap-2.5">
                  <button
                    type="button"
                    onClick={() => setModalMode(null)}
                    disabled={busy}
                    className="px-4 py-2 rounded-lg text-sm font-medium border border-slate-200 dark:border-slate-700"
                  >
                    Annuleren
                  </button>
                  <button
                    type="submit"
                    disabled={busy || items.length === 0}
                    className="px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-60 flex items-center gap-2"
                  >
                    <Sparkles className="w-4 h-4" />
                    <span>{busy ? 'Samenvatten...' : 'Genereer Samenvatting'}</span>
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleSaveManual} className="mt-5 space-y-4">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Titel
                  </label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Bijv. Samenvatting Hoofdstuk 5"
                    className="w-full px-3.5 py-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Vak
                  </label>
                  <input
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Bijv. Geschiedenis"
                    className="w-full px-3.5 py-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Inhoud (Markdown ondersteund)
                  </label>
                  <textarea
                    rows={6}
                    required
                    value={manualContent}
                    onChange={(e) => setManualContent(e.target.value)}
                    placeholder="## Hoofdpunten&#10;- Begrip 1..."
                    className="w-full px-3.5 py-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm"
                  />
                </div>

                <div className="pt-2 flex justify-end gap-2.5">
                  <button
                    type="button"
                    onClick={() => setModalMode(null)}
                    className="px-4 py-2 rounded-lg text-sm font-medium border border-slate-200 dark:border-slate-700"
                  >
                    Annuleren
                  </button>
                  <button
                    type="submit"
                    disabled={busy}
                    className="px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-60"
                  >
                    {busy ? 'Opslaan...' : 'Opslaan'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Samenvatting verwijderen?"
        description={`Weet je zeker dat je "${deleteTarget?.title}" wilt verwijderen?`}
        busy={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return;
          setDeleting(true);
          try {
            await deleteSummary(userId, deleteTarget.id);
            if (activeSummaryId === deleteTarget.id) setActiveSummaryId(null);
            setDeleteTarget(null);
          } finally {
            setDeleting(false);
          }
        }}
      />
    </div>
  );
};
