import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bookmark,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Eye,
  FileText,
  Folder as FolderIcon,
  HelpCircle,
  Info,
  Layers,
  Loader2,
  Play,
  Plus,
  RefreshCw,
  Save,
  Sparkles,
  Target,
  Trash2,
} from 'lucide-react';
import type {
  Folder,
  PracticeCheckTiming,
  PracticeDifficultyMode,
  PracticeMaterialSelection,
  PracticeMode,
  PracticeQuestionTypeMode,
  PracticeUserSettings,
  StudyItem,
} from '../../types';
import { ConfirmModal } from '../ConfirmModal';

interface PracticeMaterialAndConfigProps {
  folders: Folder[];
  items: StudyItem[];
  savedSelections: PracticeMaterialSelection[];
  activeSelection: PracticeMaterialSelection | null;
  selectedFolderIds: string[];
  manualItemIds: string[];
  excludedItemIds: string[];
  selectionName: string;
  selectionSubject: string;
  settings: PracticeUserSettings;
  mode: PracticeMode;
  focusTopic: string;
  analyzingSelection: boolean;
  startingSession: boolean;
  selectionChangedNotice: boolean;
  error: string | null;
  onChangeFolders: (ids: string[]) => void;
  onChangeManualItems: (ids: string[]) => void;
  onChangeExcludedItems: (ids: string[]) => void;
  onChangeSelectionMeta: (name: string, subject: string) => void;
  onSelectSavedSelection: (sel: PracticeMaterialSelection) => void;
  onAnalyzeAndSaveSelection: () => Promise<void>;
  onDeleteSavedSelection: (id: string) => Promise<void>;
  onChangeSettings: (next: PracticeUserSettings) => void;
  onChangeMode: (mode: PracticeMode) => void;
  onChangeFocusTopic: (topic: string) => void;
  onStartSession: () => Promise<void>;
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

const PRACTICE_MODES: Array<{
  id: PracticeMode;
  title: string;
  description: string;
  Icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    id: 'free',
    title: 'Vrij oefenen',
    description: 'Adaptieve oefening zonder tijdsdruk. De AI stemt vragen af op jouw beheersing.',
    Icon: Sparkles,
  },
  {
    id: 'weak',
    title: 'Zwakke punten oefenen',
    description: 'Richt zich op onderwerpen en details waar je eerder moeite mee had.',
    Icon: Target,
  },
  {
    id: 'exam',
    title: 'Toetsvoorbereiding',
    description: 'Gemengde toets over je selectie met eindcijfer (1 t/m 10) en onderwerpanalyse.',
    Icon: FileText,
  },
  {
    id: 'repeat',
    title: 'Herhalen',
    description: 'Nieuwe vraagvarianten op oude fouten en stof die langer geleden geoefend is.',
    Icon: RefreshCw,
  },
  {
    id: 'topic',
    title: 'Onderwerp oefenen',
    description: 'Kies één specifiek onderwerp uit je leerstof om dat volledig onder de knie te krijgen.',
    Icon: Layers,
  },
];

export const PracticeMaterialAndConfig: React.FC<PracticeMaterialAndConfigProps> = ({
  folders,
  items,
  savedSelections,
  activeSelection,
  selectedFolderIds,
  manualItemIds,
  excludedItemIds,
  selectionName,
  selectionSubject,
  settings,
  mode,
  focusTopic,
  analyzingSelection,
  startingSession,
  selectionChangedNotice,
  error,
  onChangeFolders,
  onChangeManualItems,
  onChangeExcludedItems,
  onChangeSelectionMeta,
  onSelectSavedSelection,
  onAnalyzeAndSaveSelection,
  onDeleteSavedSelection,
  onChangeSettings,
  onChangeMode,
  onChangeFocusTopic,
  onStartSession,
}) => {
  const [previewFolderId, setPreviewFolderId] = useState<string | null>(null);
  const [previewItemId, setPreviewItemId] = useState<string | null>(null);
  const [deleteSelId, setDeleteSelId] = useState<string | null>(null);
  const [deletingSel, setDeletingSel] = useState(false);

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

  const toggleFolder = (folderId: string) => {
    const subtree = collectDescendantFolderIds(folderId, folders);
    const folderItemIds = items.filter((it) => subtree.has(it.folderId)).map((it) => it.id);
    if (selectedFolderIds.includes(folderId)) {
      onChangeFolders(selectedFolderIds.filter((id) => id !== folderId));
    } else {
      onChangeFolders([...selectedFolderIds, folderId]);
      onChangeExcludedItems(excludedItemIds.filter((id) => !folderItemIds.includes(id)));
    }
  };

  const toggleItem = (itemId: string) => {
    const isSelected = effectiveItemIds.includes(itemId);
    if (isSelected) {
      onChangeManualItems(manualItemIds.filter((id) => id !== itemId));
      onChangeExcludedItems(
        excludedItemIds.includes(itemId) ? excludedItemIds : [...excludedItemIds, itemId]
      );
    } else {
      onChangeExcludedItems(excludedItemIds.filter((id) => id !== itemId));
      onChangeManualItems(
        manualItemIds.includes(itemId) ? manualItemIds : [...manualItemIds, itemId]
      );
    }
  };

  const confirmDeleteSel = async () => {
    if (!deleteSelId) return;
    setDeletingSel(true);
    try {
      await onDeleteSavedSelection(deleteSelId);
      setDeleteSelId(null);
    } finally {
      setDeletingSel(false);
    }
  };

  const availableTopics = activeSelection?.topics || [];

  return (
    <div className="space-y-6">
      {/* Preserved knowledge profile notice when switching selections */}
      {selectionChangedNotice && (
        <div className="rounded-xl border border-sky-200 dark:border-sky-900 bg-sky-50/70 dark:bg-sky-950/30 p-3.5 flex items-start gap-2.5 text-xs text-sky-900 dark:text-sky-200">
          <Info className="w-4 h-4 text-sky-600 dark:text-sky-400 shrink-0 mt-0.5" />
          <span>
            Je bent gewisseld van leerstofselectie. Je eerder opgebouwde resultaten en kennisprofiel van andere vakken blijven gewoon bewaard; nieuwe onderwerpen bouwen hun eigen beheersingsprofiel op.
          </span>
        </div>
      )}

      {/* Saved Selections Library */}
      {savedSelections.length > 0 && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Bookmark className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Opgeslagen leerstofselecties
              </h3>
            </div>
            <span className="text-xs text-slate-500 dark:text-slate-400">
              Wissel snel tussen vakken of hoofdstukken
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {savedSelections.map((sel) => {
              const isActive = activeSelection?.id === sel.id;
              return (
                <div
                  key={sel.id}
                  className={`rounded-lg border p-3 flex flex-col justify-between gap-2.5 transition-colors ${
                    isActive
                      ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/30'
                      : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onSelectSavedSelection(sel)}
                    className="text-left space-y-1 w-full"
                  >
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {sel.name}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                      {sel.subject} · {sel.selectedItemIds.length}{' '}
                      {sel.selectedItemIds.length === 1 ? 'bestand' : 'bestanden'} ·{' '}
                      {sel.topics.length} {sel.topics.length === 1 ? 'onderwerp' : 'onderwerpen'}
                    </p>
                  </button>
                  <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-200/70 dark:border-slate-800">
                    <span className="text-[11px] font-medium text-indigo-600 dark:text-indigo-400">
                      {isActive ? 'Geselecteerd' : 'Klik om te laden'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setDeleteSelId(sel.id)}
                      className="p-1 rounded text-slate-400 hover:text-red-600 dark:hover:text-red-400"
                      aria-label={`Selectie ${sel.name} verwijderen`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Step 1: Select Files & Folders + Save Selection */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-5 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              1. Leerstof selecteren (strikte bronregel)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              De AI gebruikt uitsluitend de gekozen bestanden en mappen (PDF, DOCX, PPTX, TXT en notities) zonder externe kennis toe te voegen.
            </p>
          </div>
          <span className="text-xs font-medium text-slate-600 dark:text-slate-300 tabular-nums shrink-0">
            {selectedItems.length} {selectedItems.length === 1 ? 'bestand' : 'bestanden'} gekozen
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Folders column */}
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Mappen ({folders.length})
              </span>
              <span className="text-[11px] text-slate-400">Klik op Bekijk voor inhoud</span>
            </div>

            {folders.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 py-4 text-center">
                Geen mappen gevonden. Voeg bestanden toe onder Mappen & Bestanden.
              </p>
            ) : (
              <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
                {folders.map((folder) => {
                  const checked = selectedFolderIds.includes(folder.id);
                  const subtree = collectDescendantFolderIds(folder.id, folders);
                  const folderItems = items.filter((it) => subtree.has(it.folderId));
                  const isPreviewing = previewFolderId === folder.id;

                  return (
                    <div
                      key={folder.id}
                      className="rounded-lg border border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40"
                    >
                      <div className="flex items-center justify-between gap-2 px-3 py-2">
                        <label className="flex items-center gap-2.5 min-w-0 cursor-pointer flex-1">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleFolder(folder.id)}
                            className="rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500"
                          />
                          <FolderIcon className="w-4 h-4 text-indigo-500 shrink-0" />
                          <span className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate">
                            {folder.name}
                          </span>
                          <span className="text-[11px] text-slate-400 tabular-nums shrink-0">
                            ({folderItems.length})
                          </span>
                        </label>
                        <button
                          type="button"
                          onClick={() =>
                            setPreviewFolderId(isPreviewing ? null : folder.id)
                          }
                          className="text-[11px] font-medium text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 inline-flex items-center gap-1 shrink-0"
                        >
                          {isPreviewing ? (
                            <ChevronDown className="w-3.5 h-3.5" />
                          ) : (
                            <ChevronRight className="w-3.5 h-3.5" />
                          )}
                          <span>Bekijk</span>
                        </button>
                      </div>

                      {isPreviewing && (
                        <div className="px-3 pb-2.5 pt-1 border-t border-slate-200/70 dark:border-slate-800 space-y-1">
                          {folderItems.length === 0 ? (
                            <p className="text-[11px] text-slate-400">Deze map is leeg.</p>
                          ) : (
                            folderItems.map((fi) => (
                              <div
                                key={fi.id}
                                className="flex items-center justify-between gap-2 text-[11px] text-slate-600 dark:text-slate-300"
                              >
                                <span className="truncate">
                                  {fi.title} ({formatFileType(fi.type)})
                                </span>
                                <button
                                  type="button"
                                  onClick={() => toggleItem(fi.id)}
                                  className="text-indigo-600 dark:text-indigo-400 hover:underline shrink-0"
                                >
                                  {effectiveItemIds.includes(fi.id) ? 'Verwijder' : 'Voeg toe'}
                                </button>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Individual Files column */}
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Losse bestanden ({items.length})
              </span>
              <span className="text-[11px] text-slate-400">Toevoegen of bekijken</span>
            </div>

            {items.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 py-4 text-center">
                Nog geen bestanden geüpload. Upload bestanden of maak notities onder Mappen & Bestanden.
              </p>
            ) : (
              <div className="max-h-60 overflow-y-auto space-y-1.5 pr-1">
                {items.map((item) => {
                  const selected = effectiveItemIds.includes(item.id);
                  const isPreviewing = previewItemId === item.id;

                  return (
                    <div
                      key={item.id}
                      className="rounded-lg border border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/40"
                    >
                      <div className="flex items-center justify-between gap-2 px-3 py-2">
                        <label className="flex items-center gap-2.5 min-w-0 cursor-pointer flex-1">
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => toggleItem(item.id)}
                            className="rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500"
                          />
                          <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate">
                            {item.title}
                          </span>
                          <span className="text-[11px] text-slate-400 shrink-0">
                            {formatFileType(item.type)}
                          </span>
                        </label>
                        <button
                          type="button"
                          onClick={() => setPreviewItemId(isPreviewing ? null : item.id)}
                          className="p-1 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400"
                          aria-label={`Bekijk inhoud van ${item.title}`}
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {isPreviewing && (
                        <div className="px-3 pb-2.5 pt-1.5 border-t border-slate-200/70 dark:border-slate-800">
                          <p className="text-[11px] text-slate-600 dark:text-slate-400 whitespace-pre-wrap line-clamp-4">
                            {(item.content || '').trim() || '(Geen leesbare tekst in dit bestand)'}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Save / Name + Analyze bar */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end pt-2 border-t border-slate-200 dark:border-slate-800">
          <div className="md:col-span-5">
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
              Naam van leerstofselectie (optioneel)
            </label>
            <input
              type="text"
              value={selectionName}
              onChange={(e) => onChangeSelectionMeta(e.target.value, selectionSubject)}
              placeholder="Bijv. Biologie H3 Celdeling"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="md:col-span-3">
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
              Vak
            </label>
            <input
              type="text"
              value={selectionSubject}
              onChange={(e) => onChangeSelectionMeta(selectionName, e.target.value)}
              placeholder="Bijv. Biologie"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div className="md:col-span-4 flex justify-end">
            <button
              type="button"
              disabled={analyzingSelection || selectedItems.length === 0}
              onClick={onAnalyzeAndSaveSelection}
              className="w-full px-4 py-2 rounded-lg border border-indigo-600 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 disabled:opacity-50 text-sm font-medium inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
            >
              {analyzingSelection ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Alle stof grondig analyseren...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>Analyseer & sla selectie op</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Active selection overview & warnings */}
        {activeSelection && (
          <div className="rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/40 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>
                  Gecontroleerde onderwerpen uit "{activeSelection.name}" ({activeSelection.topics.length})
                </span>
              </div>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                {activeSelection.fileStatuses.filter((f) => f.readable).length} leesbare bronnen
              </span>
            </div>

            {activeSelection.warnings.length > 0 && (
              <div className="space-y-1">
                {activeSelection.warnings.map((w, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400"
                  >
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>{w}</span>
                  </div>
                ))}
              </div>
            )}

            {activeSelection.topics.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {activeSelection.topics.map((t, idx) => (
                  <div
                    key={`${t.name}-${idx}`}
                    className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] text-xs"
                  >
                    <p className="font-medium text-slate-900 dark:text-slate-100 truncate">
                      {t.name}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                      {t.sourceTitle} · {t.sourceSection}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Step 2: Practice Mode & Personal Preferences */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-5 space-y-5">
        <div>
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            2. Oefenvorm & instellingen kiezen
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Stel zelf samen hoe je wilt oefenen. De AI past vervolgvragen automatisch aan op je eerdere antwoorden.
          </p>
        </div>

        {/* 5 Practice Modes */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {PRACTICE_MODES.map(({ id, title, description, Icon }) => {
            const active = mode === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => onChangeMode(id)}
                className={`rounded-xl border p-3.5 text-left transition-colors flex flex-col gap-2 ${
                  active
                    ? 'border-indigo-600 bg-indigo-50/70 dark:bg-indigo-950/40'
                    : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Icon
                    className={`w-4 h-4 shrink-0 ${
                      active
                        ? 'text-indigo-600 dark:text-indigo-400'
                        : 'text-slate-500 dark:text-slate-400'
                    }`}
                  />
                  <span className="text-xs font-semibold text-slate-900 dark:text-slate-100">
                    {title}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  {description}
                </p>
              </button>
            );
          })}
        </div>

        {/* Topic Picker when mode === 'topic' */}
        {mode === 'topic' && (
          <div className="rounded-lg border border-indigo-200 dark:border-indigo-900 bg-indigo-50/50 dark:bg-indigo-950/30 p-3.5 space-y-2">
            <label className="block text-xs font-semibold text-slate-800 dark:text-slate-200">
              Kies welk onderwerp uit je leerstof je wilt oefenen
            </label>
            {availableTopics.length > 0 ? (
              <select
                value={focusTopic}
                onChange={(e) => onChangeFocusTopic(e.target.value)}
                className="w-full sm:w-96 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100"
              >
                <option value="">-- Selecteer een onderwerp --</option>
                {availableTopics.map((t) => (
                  <option key={t.name} value={t.name}>
                    {t.name} ({t.sourceTitle})
                  </option>
                ))}
              </select>
            ) : (
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={focusTopic}
                  onChange={(e) => onChangeFocusTopic(e.target.value)}
                  placeholder="Typ het onderwerp of klik eerst op 'Analyseer & sla selectie op'"
                  className="w-full sm:w-96 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100"
                />
              </div>
            )}
          </div>
        )}

        {/* Settings Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pt-2 border-t border-slate-200 dark:border-slate-800">
          {/* Question type */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Vraagtype
            </label>
            <select
              value={settings.questionTypeMode}
              onChange={(e) =>
                onChangeSettings({
                  ...settings,
                  questionTypeMode: e.target.value as PracticeQuestionTypeMode,
                })
              }
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100"
            >
              <option value="both">Combinatie (open + meerkeuze)</option>
              <option value="open">Alleen open vragen (eigen woorden)</option>
              <option value="mc">Alleen meerkeuzevragen (4 opties)</option>
            </select>
          </div>

          {/* Question count */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 tabular-nums">
              Aantal vragen: {settings.questionCount}
            </label>
            <input
              type="range"
              min={3}
              max={15}
              step={1}
              value={settings.questionCount}
              onChange={(e) =>
                onChangeSettings({
                  ...settings,
                  questionCount: Number(e.target.value),
                })
              }
              className="w-full accent-indigo-600 mt-2"
            />
          </div>

          {/* Difficulty */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Moeilijkheidsgraad
            </label>
            <select
              value={settings.difficultyMode}
              onChange={(e) =>
                onChangeSettings({
                  ...settings,
                  difficultyMode: e.target.value as PracticeDifficultyMode,
                })
              }
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100"
            >
              <option value="adaptive">Adaptief (past zich automatisch aan)</option>
              <option value="easy">Makkelijk</option>
              <option value="normal">Normaal</option>
              <option value="hard">Moeilijk</option>
            </select>
          </div>

          {/* Check timing */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Feedbackmoment
            </label>
            <select
              value={mode === 'exam' ? 'end' : settings.checkTiming}
              disabled={mode === 'exam'}
              onChange={(e) =>
                onChangeSettings({
                  ...settings,
                  checkTiming: e.target.value as PracticeCheckTiming,
                })
              }
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100 disabled:opacity-60"
            >
              <option value="immediate">Direct na elke vraag nakijken</option>
              <option value="end">Pas nakijken aan het einde (toetsstijl)</option>
            </select>
          </div>

          {/* Time limit */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Tijdslimiet (optioneel)
            </label>
            <select
              value={settings.timeLimitMinutes}
              onChange={(e) =>
                onChangeSettings({
                  ...settings,
                  timeLimitMinutes: Number(e.target.value),
                })
              }
              className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100"
            >
              <option value={0}>Geen tijdslimiet</option>
              <option value={5}>5 minuten</option>
              <option value={10}>10 minuten</option>
              <option value={15}>15 minuten</option>
              <option value={20}>20 minuten</option>
              <option value={30}>30 minuten</option>
            </select>
          </div>

          {/* Toggles: Hints + Multi-correct MC */}
          <div className="space-y-2.5 pt-1">
            <label className="flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={settings.hintsEnabled}
                onChange={(e) =>
                  onChangeSettings({ ...settings, hintsEnabled: e.target.checked })
                }
                className="rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500"
              />
              <HelpCircle className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span>Hints inschakelen tijdens het oefenen</span>
            </label>

            {settings.questionTypeMode !== 'open' && (
              <label className="flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.allowMultiCorrectMc}
                  onChange={(e) =>
                    onChangeSettings({
                      ...settings,
                      allowMultiCorrectMc: e.target.checked,
                    })
                  }
                  className="rounded border-slate-300 dark:border-slate-600 text-indigo-600 focus:ring-indigo-500"
                />
                <Plus className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>Meerkeuzevragen met meerdere juiste antwoorden toestaan</span>
              </label>
            )}
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 px-4 py-3 text-xs text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <Clock className="w-3.5 h-3.5 shrink-0" />
            <span>
              Voortgang en resultaten worden automatisch opgeslagen voor jouw account.
            </span>
          </div>
          <button
            type="button"
            disabled={startingSession || selectedItems.length === 0}
            onClick={onStartSession}
            className="px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-semibold inline-flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
          >
            {startingSession ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Volledige leerstof verwerken en vragen maken...</span>
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                <span>
                  {mode === 'exam' ? 'Start toetsvoorbereiding' : 'Start oefensessie'}
                </span>
              </>
            )}
          </button>
        </div>
      </div>

      <ConfirmModal
        open={Boolean(deleteSelId)}
        title="Opgeslagen leerstofselectie verwijderen?"
        description="De opgeslagen selectie wordt verwijderd uit je snelkeuzelijst. Je bestanden en opgebouwde kennisresultaten blijven gewoon behouden."
        confirmLabel="Verwijderen"
        busy={deletingSel}
        onConfirm={confirmDeleteSel}
        onCancel={() => setDeleteSelId(null)}
      />
    </div>
  );
};
