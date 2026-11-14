import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileText,
  Folder as FolderIcon,
  Layers,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { AnalyzedMaterial, Folder, StudyItem } from '../types';
import { postAiJson } from '../lib/apiClient';
import { checkSoloGameSufficiency } from '../lib/newGamesData';

interface MaterialSelectorProps {
  folders: Folder[];
  items: StudyItem[];
  targetGameId?: string;
  targetGameTitle?: string;
  minConceptsRequired?: number;
  minQuestionsRequired?: number;
  initialMaterial?: AnalyzedMaterial | null;
  onAnalyzed: (material: AnalyzedMaterial | null) => void;
}

function collectDescendantFolderIds(rootId: string, folders: Folder[]): Set<string> {
  const result = new Set<string>([rootId]);
  let added = true;
  while (added) {
    added = false;
    for (const f of folders) {
      if (f.parentId && result.has(f.parentId) && !result.has(f.id)) {
        result.add(f.id);
        added = true;
      }
    }
  }
  return result;
}

function formatFileType(type: StudyItem['type']): string {
  switch (type) {
    case 'pdf':
      return 'PDF';
    case 'docx':
      return 'DOCX';
    case 'pptx':
      return 'PPTX';
    case 'txt':
      return 'TXT';
    default:
      return 'Notitie';
  }
}

export const MaterialSelector: React.FC<MaterialSelectorProps> = ({
  folders,
  items,
  targetGameId,
  targetGameTitle,
  minConceptsRequired,
  minQuestionsRequired,
  initialMaterial = null,
  onAnalyzed,
}) => {
  const [selectedFolderIds, setSelectedFolderIds] = useState<string[]>(
    () => initialMaterial?.selectedFolderIds || []
  );
  const [manualItemIds, setManualItemIds] = useState<string[]>(
    () => initialMaterial?.selectedItemIds || []
  );
  const [excludedItemIds, setExcludedItemIds] = useState<string[]>([]);
  const [previewFolderId, setPreviewFolderId] = useState<string | null>(null);
  const [previewItemId, setPreviewItemId] = useState<string | null>(null);

  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analyzed, setAnalyzed] = useState<AnalyzedMaterial | null>(initialMaterial);

  // All item IDs brought in by checked folders (recursively), minus excluded, plus manually added items
  const effectiveItemIds = useMemo(() => {
    const idSet = new Set<string>();
    for (const fid of selectedFolderIds) {
      const subtree = collectDescendantFolderIds(fid, folders);
      for (const it of items) {
        if (subtree.has(it.folderId) && !excludedItemIds.includes(it.id)) {
          idSet.add(it.id);
        }
      }
    }
    for (const id of manualItemIds) {
      if (!excludedItemIds.includes(id)) {
        idSet.add(id);
      }
    }
    return Array.from(idSet);
  }, [selectedFolderIds, manualItemIds, excludedItemIds, folders, items]);

  const selectedItems = useMemo(
    () => items.filter((it) => effectiveItemIds.includes(it.id)),
    [items, effectiveItemIds]
  );

  const invalidateAnalysis = () => {
    if (analyzed) {
      setAnalyzed(null);
      onAnalyzed(null);
    }
    setError(null);
  };

  const toggleFolder = (folderId: string) => {
    invalidateAnalysis();
    const subtree = collectDescendantFolderIds(folderId, folders);
    const folderItemIds = items.filter((it) => subtree.has(it.folderId)).map((it) => it.id);

    if (selectedFolderIds.includes(folderId)) {
      setSelectedFolderIds((prev) => prev.filter((id) => id !== folderId));
    } else {
      setSelectedFolderIds((prev) => [...prev, folderId]);
      // Re-enable any previously excluded items that belong to this newly selected folder
      setExcludedItemIds((prev) => prev.filter((id) => !folderItemIds.includes(id)));
    }
  };

  const addOrRemoveItem = (itemId: string) => {
    invalidateAnalysis();
    const isCurrentlySelected = effectiveItemIds.includes(itemId);
    if (isCurrentlySelected) {
      setManualItemIds((prev) => prev.filter((id) => id !== itemId));
      setExcludedItemIds((prev) => (prev.includes(itemId) ? prev : [...prev, itemId]));
    } else {
      setExcludedItemIds((prev) => prev.filter((id) => id !== itemId));
      setManualItemIds((prev) => (prev.includes(itemId) ? prev : [...prev, itemId]));
    }
  };

  const handleAnalyze = async () => {
    if (selectedItems.length === 0) {
      setError('Selecteer eerst minimaal één bestand of map met leerstof.');
      return;
    }

    setAnalyzing(true);
    setError(null);
    try {
      const folderNames = folders
        .filter((f) => selectedFolderIds.includes(f.id))
        .map((f) => f.name);
      const autoTitle =
        selectedItems.length === 1
          ? selectedItems[0].title
          : folderNames.length > 0
            ? folderNames.slice(0, 2).join(' + ')
            : `${selectedItems.length} geselecteerde bestanden`;

      const res = await postAiJson<AnalyzedMaterial>('/api/ai/analyze-material', {
        title: autoTitle,
        selectedFolderIds,
        selectedItemIds: selectedItems.map((it) => it.id),
        files: selectedItems.map((it) => ({
          id: it.id,
          title: it.title,
          type: it.type,
          subject: it.subject || '',
          content: it.content || '',
        })),
      });

      setAnalyzed(res);
      onAnalyzed(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kon leerstof niet analyseren.');
      onAnalyzed(null);
    } finally {
      setAnalyzing(false);
    }
  };

  const sufficiency = useMemo(() => {
    if (!analyzed) return null;
    if (targetGameId) {
      return checkSoloGameSufficiency(targetGameId, analyzed);
    }
    if (
      minConceptsRequired !== undefined &&
      analyzed.concepts.length < minConceptsRequired &&
      analyzed.questions.length < (minQuestionsRequired || 2)
    ) {
      return {
        ok: false,
        reason: `Onvoldoende leerstof voor ${targetGameTitle || 'dit spel'}: minimaal ${minConceptsRequired} begrippen of ${minQuestionsRequired || 2} vragen nodig.`,
      };
    }
    return { ok: analyzed.concepts.length > 0 || analyzed.questions.length > 0 };
  }, [analyzed, targetGameId, targetGameTitle, minConceptsRequired, minQuestionsRequired]);

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60 p-5 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Layers className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <span>
              Leerstof selecteren {targetGameTitle ? `voor ${targetGameTitle}` : '(verplicht)'}
            </span>
          </h3>
          <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
            Het spel gebruikt <strong>uitsluitend</strong> inhoud uit de bestanden en mappen die jij hieronder kiest — nooit algemene kennis of andere mappen.
          </p>
        </div>
        <span className="text-xs font-semibold tabular-nums text-indigo-600 dark:text-indigo-400">
          {selectedItems.length} {selectedItems.length === 1 ? 'bestand' : 'bestanden'} gekozen
        </span>
      </div>

      {items.length === 0 && folders.length === 0 ? (
        <div className="p-4 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 text-xs text-amber-800 dark:text-amber-200">
          Je hebt nog geen bestanden of mappen in StudyFlow. Ga eerst naar <strong>Mappen &amp; Bestanden</strong> om een PDF, DOCX, PPTX, TXT of notitie toe te voegen.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Folders with Preview Before Selecting */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Mappen ({folders.length})
            </p>
            {folders.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 italic">
                Geen mappen aangemaakt. Kies hiernaast losse bestanden.
              </p>
            ) : (
              <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                {folders.map((fld) => {
                  const checked = selectedFolderIds.includes(fld.id);
                  const subtree = collectDescendantFolderIds(fld.id, folders);
                  const contained = items.filter((it) => subtree.has(it.folderId));
                  const isPreviewOpen = previewFolderId === fld.id;

                  return (
                    <div
                      key={fld.id}
                      className={`rounded-xl border transition-colors ${
                        checked
                          ? 'border-indigo-500 bg-indigo-50/70 dark:bg-indigo-950/30'
                          : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827]'
                      }`}
                    >
                      <div className="p-2.5 flex items-center justify-between gap-2">
                        <label className="flex items-center gap-2.5 cursor-pointer min-w-0 flex-1">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleFolder(fld.id)}
                            className="w-4 h-4 rounded accent-indigo-600 shrink-0"
                          />
                          <FolderIcon
                            className="w-4 h-4 shrink-0"
                            style={{ color: fld.color || '#4F46E5' }}
                          />
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                              {fld.name}
                            </p>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400">
                              {contained.length} {contained.length === 1 ? 'bestand' : 'bestanden'}
                              {fld.subject ? ` · ${fld.subject}` : ''}
                            </p>
                          </div>
                        </label>

                        <button
                          type="button"
                          onClick={() => setPreviewFolderId(isPreviewOpen ? null : fld.id)}
                          className="px-2 py-1 rounded-lg text-[11px] font-medium text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100/60 dark:hover:bg-indigo-950/50 inline-flex items-center gap-1 shrink-0"
                        >
                          {isPreviewOpen ? (
                            <ChevronDown className="w-3.5 h-3.5" />
                          ) : (
                            <ChevronRight className="w-3.5 h-3.5" />
                          )}
                          <span>Mapinhoud bekijken</span>
                        </button>
                      </div>

                      {isPreviewOpen && (
                        <div className="px-3 pb-3 pt-2 border-t border-slate-200/70 dark:border-slate-800 space-y-1.5 bg-slate-50/80 dark:bg-slate-950/40 rounded-b-xl">
                          {contained.length === 0 ? (
                            <p className="text-[11px] text-slate-500">Deze map is nog leeg.</p>
                          ) : (
                            contained.map((ci) => {
                              const picked = effectiveItemIds.includes(ci.id);
                              return (
                                <div
                                  key={ci.id}
                                  className="flex items-center justify-between gap-2 text-[11px] py-1"
                                >
                                  <span className="truncate text-slate-700 dark:text-slate-300">
                                    • {ci.title} ({formatFileType(ci.type)}, {ci.content.length} tekens)
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => addOrRemoveItem(ci.id)}
                                    className={`px-2 py-0.5 rounded font-semibold shrink-0 ${
                                      picked
                                        ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300'
                                        : 'bg-slate-200 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-indigo-600 hover:text-white'
                                    }`}
                                  >
                                    {picked ? 'Geselecteerd' : 'Toevoegen'}
                                  </button>
                                </div>
                              );
                            })
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Individual Files */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              Afzonderlijke bestanden ({items.length})
            </p>
            <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
              {items.map((it) => {
                const picked = effectiveItemIds.includes(it.id);
                const isPreview = previewItemId === it.id;
                const folderName = folders.find((f) => f.id === it.folderId)?.name;

                return (
                  <div
                    key={it.id}
                    className={`rounded-xl border transition-colors ${
                      picked
                        ? 'border-indigo-500 bg-indigo-50/70 dark:bg-indigo-950/30'
                        : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827]'
                    }`}
                  >
                    <div className="p-2.5 flex items-center justify-between gap-2">
                      <label className="flex items-center gap-2.5 cursor-pointer min-w-0 flex-1">
                        <input
                          type="checkbox"
                          checked={picked}
                          onChange={() => addOrRemoveItem(it.id)}
                          className="w-4 h-4 rounded accent-indigo-600 shrink-0"
                        />
                        <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                            {it.title}
                          </p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                            {formatFileType(it.type)}
                            {it.subject ? ` · ${it.subject}` : ''}
                            {folderName ? ` · Map: ${folderName}` : ''}
                          </p>
                        </div>
                      </label>

                      <button
                        type="button"
                        onClick={() => setPreviewItemId(isPreview ? null : it.id)}
                        className="px-2 py-1 rounded-lg text-[11px] font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
                      >
                        {isPreview ? 'Verberg' : 'Voorbeeld'}
                      </button>
                    </div>

                    {isPreview && (
                      <div className="px-3 pb-3 pt-2 border-t border-slate-200/70 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed max-h-28 overflow-y-auto whitespace-pre-wrap">
                        {it.content.trim()
                          ? `${it.content.slice(0, 380)}${it.content.length > 380 ? '...' : ''}`
                          : '(Geen tekst aanwezig in dit bestand)'}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Selected Files Summary Chips */}
      {selectedItems.length > 0 && (
        <div className="space-y-2 pt-2 border-t border-slate-200 dark:border-slate-800">
          <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            Geselecteerde bronnen ({selectedItems.length}):
          </p>
          <div className="flex flex-wrap gap-2">
            {selectedItems.map((it) => (
              <span
                key={it.id}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white dark:bg-[#111827] border border-indigo-200 dark:border-indigo-800 text-xs font-medium text-slate-800 dark:text-slate-200"
              >
                <span className="truncate max-w-[180px]">{it.title}</span>
                <span className="text-[10px] text-slate-400">({formatFileType(it.type)})</span>
                <button
                  type="button"
                  onClick={() => addOrRemoveItem(it.id)}
                  className="text-slate-400 hover:text-red-500 ml-0.5"
                  aria-label={`Verwijder ${it.title}`}
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Analyze Action */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <button
          type="button"
          disabled={analyzing || selectedItems.length === 0}
          onClick={handleAnalyze}
          className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold inline-flex items-center gap-2 transition-colors"
        >
          {analyzing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Leerstof analyseren &amp; controleren...</span>
            </>
          ) : analyzed ? (
            <>
              <Sparkles className="w-4 h-4" />
              <span>Selectie opnieuw analyseren</span>
            </>
          ) : (
            <>
              <Plus className="w-4 h-4" />
              <span>Leerstof analyseren &amp; voorbereiden</span>
            </>
          )}
        </button>

        {analyzed && sufficiency?.ok && (
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="w-4 h-4" />
            Leerstof gecontroleerd &amp; klaar voor het spel!
          </span>
        )}
      </div>

      {error && (
        <div className="p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Analysis Warnings, File Status & Topics Overview */}
      {analyzed && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-4 space-y-3">
          {analyzed.warnings.length > 0 && (
            <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 space-y-1">
              <p className="text-xs font-bold text-amber-800 dark:text-amber-200 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>Let op bij de geselecteerde bestanden:</span>
              </p>
              <ul className="list-disc pl-5 text-xs text-amber-800 dark:text-amber-300 space-y-0.5">
                {analyzed.warnings.map((w, idx) => (
                  <li key={idx}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          {sufficiency && !sufficiency.ok && sufficiency.reason && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-800 text-xs text-red-700 dark:text-red-300 font-semibold">
              {sufficiency.reason}
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs tabular-nums">
            <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <p className="text-[11px] text-slate-500">Onderwerpen</p>
              <p className="font-bold text-slate-900 dark:text-slate-100">
                {analyzed.topics.length}
              </p>
            </div>
            <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <p className="text-[11px] text-slate-500">Begrippen</p>
              <p className="font-bold text-slate-900 dark:text-slate-100">
                {analyzed.concepts.length}
              </p>
            </div>
            <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <p className="text-[11px] text-slate-500">Vragen</p>
              <p className="font-bold text-slate-900 dark:text-slate-100">
                {analyzed.questions.length}
              </p>
            </div>
            <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
              <p className="text-[11px] text-slate-500">Puzzels / Sorteren</p>
              <p className="font-bold text-slate-900 dark:text-slate-100">
                {analyzed.puzzles.length} / {analyzed.sortRounds.length}
              </p>
            </div>
          </div>

          {analyzed.topics.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5 text-indigo-500" />
                <span>Onderwerpen die het spel gaat gebruiken (enkel uit jouw bronnen):</span>
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {analyzed.topics.map((t, i) => (
                  <div
                    key={i}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs flex items-center justify-between gap-2"
                  >
                    <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                      {t.name}
                    </span>
                    <span className="text-[10px] text-slate-500 shrink-0 truncate max-w-[140px]">
                      {t.sourceTitle} · {t.sourceSection}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
