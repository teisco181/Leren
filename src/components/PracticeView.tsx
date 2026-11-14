import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart3,
  BookOpen,
  BrainCircuit,
  Loader2,
  Play,
  SlidersHorizontal,
} from 'lucide-react';
import type {
  Folder,
  PracticeAnswerFeedback,
  PracticeDashboardState,
  PracticeMaterialSelection,
  PracticeMode,
  PracticeSessionPublic,
  PracticeUserSettings,
  StudyItem,
} from '../types';
import { apiDelete, apiGet, apiPost, apiPut } from '../lib/apiClient';
import { PracticeDashboard } from './practice/PracticeDashboard';
import { PracticeMaterialAndConfig } from './practice/PracticeMaterialAndConfig';
import { PracticeSessionRunner } from './practice/PracticeSessionRunner';

interface PracticeViewProps {
  userId: string;
  userName: string;
  folders: Folder[];
  items: StudyItem[];
  loading: boolean;
}

type PracticeSubTab = 'overview' | 'setup' | 'session';

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

const DEFAULT_SETTINGS: PracticeUserSettings = {
  questionTypeMode: 'both',
  allowMultiCorrectMc: false,
  questionCount: 6,
  difficultyMode: 'adaptive',
  timeLimitMinutes: 0,
  hintsEnabled: true,
  checkTiming: 'immediate',
};

export const PracticeView: React.FC<PracticeViewProps> = ({
  folders,
  items,
  loading: firestoreLoading,
}) => {
  const [subTab, setSubTab] = useState<PracticeSubTab>('overview');
  const [dashboard, setDashboard] = useState<PracticeDashboardState | null>(null);
  const [stateLoading, setStateLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Material selection state
  const [activeSelection, setActiveSelection] = useState<PracticeMaterialSelection | null>(null);
  const [selectedFolderIds, setSelectedFolderIds] = useState<string[]>([]);
  const [manualItemIds, setManualItemIds] = useState<string[]>([]);
  const [excludedItemIds, setExcludedItemIds] = useState<string[]>([]);
  const [selectionName, setSelectionName] = useState('');
  const [selectionSubject, setSelectionSubject] = useState('');
  const [selectionChangedNotice, setSelectionChangedNotice] = useState(false);

  // Practice settings & mode
  const [settings, setSettings] = useState<PracticeUserSettings>(DEFAULT_SETTINGS);
  const [mode, setMode] = useState<PracticeMode>('free');
  const [focusTopic, setFocusTopic] = useState('');

  // Async action states
  const [analyzingSelection, setAnalyzingSelection] = useState(false);
  const [startingSession, setStartingSession] = useState(false);
  const [submittingAnswer, setSubmittingAnswer] = useState(false);
  const [submittingExam, setSubmittingExam] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Active or reviewed session
  const [activeSession, setActiveSession] = useState<PracticeSessionPublic | null>(null);
  const hasAutoAppliedRef = useRef(false);

  const applySelectionToPicker = useCallback((sel: PracticeMaterialSelection, showNotice = false) => {
    setActiveSelection(sel);
    setSelectedFolderIds(sel.selectedFolderIds || []);
    setManualItemIds(sel.selectedItemIds || []);
    setExcludedItemIds([]);
    setSelectionName(sel.name || '');
    setSelectionSubject(sel.subject || '');
    if (showNotice) setSelectionChangedNotice(true);
  }, []);

  const fetchPracticeState = useCallback(async () => {
    setStateLoading(true);
    setLoadError(null);
    try {
      const data = await apiGet<PracticeDashboardState>('/api/practice/state', {
        requireAuth: true,
      });
      setDashboard(data);
      setSettings(data.settings);
      if (data.savedSelections.length > 0 && !hasAutoAppliedRef.current) {
        hasAutoAppliedRef.current = true;
        applySelectionToPicker(data.savedSelections[0], false);
      }
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : 'Kon persoonlijke oefengegevens niet laden.'
      );
    } finally {
      setStateLoading(false);
    }
  }, [applySelectionToPicker]);

  useEffect(() => {
    fetchPracticeState();
  }, [fetchPracticeState]);

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
      if (!excludedItemIds.includes(id)) idSet.add(id);
    }
    return Array.from(idSet);
  }, [selectedFolderIds, manualItemIds, excludedItemIds, folders, items]);

  const selectedItems = useMemo(
    () => items.filter((it) => effectiveItemIds.includes(it.id)),
    [items, effectiveItemIds]
  );

  const handleFoldersChange = (ids: string[]) => {
    setSelectedFolderIds(ids);
    if (activeSelection) {
      setActiveSelection(null);
      setSelectionChangedNotice(true);
    }
    setActionError(null);
  };

  const handleManualItemsChange = (ids: string[]) => {
    setManualItemIds(ids);
    if (activeSelection) {
      setActiveSelection(null);
      setSelectionChangedNotice(true);
    }
    setActionError(null);
  };

  const handleExcludedItemsChange = (ids: string[]) => {
    setExcludedItemIds(ids);
    if (activeSelection) {
      setActiveSelection(null);
      setSelectionChangedNotice(true);
    }
    setActionError(null);
  };

  const handleSelectSavedSelection = (sel: PracticeMaterialSelection) => {
    applySelectionToPicker(sel, activeSelection?.id !== sel.id);
    setActionError(null);
  };

  const handleAnalyzeAndSaveSelection = async () => {
    if (selectedItems.length === 0) {
      setActionError('Selecteer eerst minimaal één bestand of map.');
      return;
    }
    setAnalyzingSelection(true);
    setActionError(null);
    try {
      const res = await apiPost<{
        selection: PracticeMaterialSelection;
        savedSelections: PracticeMaterialSelection[];
      }>('/api/practice/selections', {
        name: selectionName.trim() || undefined,
        subject: selectionSubject.trim() || undefined,
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

      setActiveSelection(res.selection);
      setSelectionName(res.selection.name);
      setSelectionSubject(res.selection.subject);
      setDashboard((prev) =>
        prev ? { ...prev, savedSelections: res.savedSelections } : prev
      );
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Analyseren mislukt.');
    } finally {
      setAnalyzingSelection(false);
    }
  };

  const handleDeleteSavedSelection = async (id: string) => {
    const res = await apiDelete<{ savedSelections: PracticeMaterialSelection[] }>(
      `/api/practice/selections/${encodeURIComponent(id)}`
    );
    setDashboard((prev) => (prev ? { ...prev, savedSelections: res.savedSelections } : prev));
    if (activeSelection?.id === id) {
      setActiveSelection(null);
    }
  };

  const handleSettingsChange = (next: PracticeUserSettings) => {
    setSettings(next);
    apiPut<{ settings: PracticeUserSettings }>('/api/practice/settings', next).catch(() => {});
  };

  const launchSession = async (params: {
    modeToUse: PracticeMode;
    focusTopicToUse?: string;
    selectionToUse?: PracticeMaterialSelection | null;
  }) => {
    const targetSelection = params.selectionToUse ?? activeSelection;

    // Resolve files either from current picker or targetSelection's item IDs
    let filesToSend = selectedItems;
    if (filesToSend.length === 0 && targetSelection) {
      filesToSend = items.filter((it) => targetSelection.selectedItemIds.includes(it.id));
    }

    if (filesToSend.length === 0) {
      setActionError(
        'De gekozen bestanden voor deze selectie staan niet meer in je bibliotheek. Selecteer eerst leerstof.'
      );
      setSubTab('setup');
      return;
    }

    if (params.modeToUse === 'topic' && !(params.focusTopicToUse || '').trim()) {
      setActionError('Kies eerst welk onderwerp je wilt oefenen.');
      setSubTab('setup');
      return;
    }

    setStartingSession(true);
    setActionError(null);
    try {
      const effectiveSettings: PracticeUserSettings =
        params.modeToUse === 'exam' ? { ...settings, checkTiming: 'end' } : settings;

      const res = await apiPost<{
        session: PracticeSessionPublic;
        dashboard: PracticeDashboardState;
      }>('/api/practice/sessions', {
        selectionId: targetSelection?.id || '',
        selectionName:
          selectionName.trim() ||
          targetSelection?.name ||
          (filesToSend.length === 1
            ? filesToSend[0].title
            : `${filesToSend.length} geselecteerde bronnen`),
        subject:
          selectionSubject.trim() ||
          targetSelection?.subject ||
          filesToSend.find((f) => f.subject)?.subject ||
          'Algemeen',
        mode: params.modeToUse,
        focusTopic: params.focusTopicToUse?.trim() || undefined,
        settings: effectiveSettings,
        topics: targetSelection?.topics || [],
        files: filesToSend.map((it) => ({
          id: it.id,
          title: it.title,
          type: it.type,
          subject: it.subject || '',
          content: it.content || '',
        })),
      });

      setDashboard(res.dashboard);
      setActiveSession(res.session);
      setSubTab('session');
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Kon sessie niet starten.');
    } finally {
      setStartingSession(false);
    }
  };

  const handleStartQuickAction = (action: {
    mode: PracticeMode;
    focusTopic?: string;
    selectionId?: string;
  }) => {
    const sel =
      (action.selectionId &&
        dashboard?.savedSelections.find((s) => s.id === action.selectionId)) ||
      activeSelection ||
      dashboard?.savedSelections[0] ||
      null;
    if (sel) applySelectionToPicker(sel, false);
    setMode(action.mode);
    if (action.focusTopic) setFocusTopic(action.focusTopic);
    launchSession({
      modeToUse: action.mode,
      focusTopicToUse: action.focusTopic,
      selectionToUse: sel,
    });
  };

  const handleSaveDraft = async (
    draftAnswers: Record<string, { typedAnswer?: string; selectedIndices?: number[] }>,
    currentIndex: number
  ) => {
    if (!activeSession) return;
    const res = await apiPost<{ session: PracticeSessionPublic }>(
      `/api/practice/sessions/${encodeURIComponent(activeSession.id)}/draft`,
      { draftAnswers, currentIndex }
    );
    setActiveSession(res.session);
    setDashboard((prev) =>
      prev
        ? {
            ...prev,
            sessions: prev.sessions.map((s) => (s.id === res.session.id ? res.session : s)),
          }
        : prev
    );
  };

  const handleSubmitSingleAnswer = async (params: {
    questionId: string;
    typedAnswer?: string;
    selectedIndices?: number[];
    nextIndex?: number;
  }) => {
    if (!activeSession) return;
    setSubmittingAnswer(true);
    setActionError(null);
    try {
      const res = await apiPost<{
        feedback: PracticeAnswerFeedback;
        session: PracticeSessionPublic;
        dashboard: PracticeDashboardState;
      }>(
        `/api/practice/sessions/${encodeURIComponent(activeSession.id)}/answer`,
        params
      );
      setActiveSession(res.session);
      setDashboard(res.dashboard);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Nakijken mislukt.');
    } finally {
      setSubmittingAnswer(false);
    }
  };

  const handleSubmitExam = async (
    draftAnswers: Record<string, { typedAnswer?: string; selectedIndices?: number[] }>
  ) => {
    if (!activeSession) return;
    setSubmittingExam(true);
    setActionError(null);
    try {
      const res = await apiPost<{
        session: PracticeSessionPublic;
        dashboard: PracticeDashboardState;
      }>(`/api/practice/sessions/${encodeURIComponent(activeSession.id)}/submit-exam`, {
        answers: draftAnswers,
      });
      setActiveSession(res.session);
      setDashboard(res.dashboard);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Kon toets niet nakijken.');
    } finally {
      setSubmittingExam(false);
    }
  };

  const handleDeleteSession = async (sessionId: string) => {
    const res = await apiDelete<{ dashboard: PracticeDashboardState }>(
      `/api/practice/sessions/${encodeURIComponent(sessionId)}`
    );
    setDashboard(res.dashboard);
    if (activeSession?.id === sessionId) {
      setActiveSession(null);
      if (subTab === 'session') setSubTab('overview');
    }
  };

  if (firestoreLoading || stateLoading) {
    return (
      <div className="py-16 flex flex-col items-center justify-center gap-3 text-slate-500 dark:text-slate-400 text-sm">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-600 dark:text-indigo-400" />
        <span>Persoonlijke oefenomgeving laden...</span>
      </div>
    );
  }

  if (loadError || !dashboard) {
    return (
      <div className="rounded-xl border border-red-200 dark:border-red-900 bg-red-50/70 dark:bg-red-950/30 p-6 space-y-3">
        <p className="text-sm font-semibold text-red-800 dark:text-red-300">
          {loadError || 'Kon AI Oefenen niet laden.'}
        </p>
        <button
          type="button"
          onClick={fetchPracticeState}
          className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-xs font-medium hover:bg-indigo-700"
        >
          Opnieuw proberen
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header & Sub-navigation */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
              <BrainCircuit className="w-5 h-5" />
            </div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
              AI Oefenen — Oefenvragen
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            Persoonlijk leren met AI uitsluitend op basis van jouw geselecteerde schoolstof, met adaptieve vragen en directe inhoudelijke feedback.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => {
              setActionError(null);
              setSubTab('overview');
            }}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold inline-flex items-center gap-2 transition-colors whitespace-nowrap ${
              subTab === 'overview'
                ? 'bg-indigo-600 text-white'
                : 'border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <BarChart3 className="w-4 h-4" />
            <span>Kennisprofiel & overzicht</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActionError(null);
              setSubTab('setup');
            }}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold inline-flex items-center gap-2 transition-colors whitespace-nowrap ${
              subTab === 'setup'
                ? 'bg-indigo-600 text-white'
                : 'border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span>Leerstof & instellingen</span>
          </button>

          {activeSession && (
            <button
              type="button"
              onClick={() => {
                setActionError(null);
                setSubTab('session');
              }}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold inline-flex items-center gap-2 transition-colors whitespace-nowrap ${
                subTab === 'session'
                  ? 'bg-indigo-600 text-white'
                  : 'border border-indigo-300 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/40'
              }`}
            >
              {activeSession.status === 'active' ? (
                <Play className="w-4 h-4" />
              ) : (
                <BookOpen className="w-4 h-4" />
              )}
              <span>
                {activeSession.status === 'active' ? 'Huidige sessie' : 'Laatste resultaat'}
              </span>
            </button>
          )}
        </div>
      </div>

      {actionError && subTab === 'overview' && (
        <div className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/40 px-4 py-3 text-xs text-red-700 dark:text-red-300">
          {actionError}
        </div>
      )}

      {subTab === 'overview' && (
        <PracticeDashboard
          dashboard={dashboard}
          startingQuickAction={startingSession}
          onStartQuickAction={handleStartQuickAction}
          onOpenSession={(session) => {
            setActiveSession(session);
            setActionError(null);
            setSubTab('session');
          }}
          onDeleteSession={handleDeleteSession}
          onGoToSetup={() => {
            setActionError(null);
            setSubTab('setup');
          }}
        />
      )}

      {subTab === 'setup' && (
        <PracticeMaterialAndConfig
          folders={folders}
          items={items}
          savedSelections={dashboard.savedSelections}
          activeSelection={activeSelection}
          selectedFolderIds={selectedFolderIds}
          manualItemIds={manualItemIds}
          excludedItemIds={excludedItemIds}
          selectionName={selectionName}
          selectionSubject={selectionSubject}
          settings={settings}
          mode={mode}
          focusTopic={focusTopic}
          analyzingSelection={analyzingSelection}
          startingSession={startingSession}
          selectionChangedNotice={selectionChangedNotice}
          error={actionError}
          onChangeFolders={handleFoldersChange}
          onChangeManualItems={handleManualItemsChange}
          onChangeExcludedItems={handleExcludedItemsChange}
          onChangeSelectionMeta={(name, subj) => {
            setSelectionName(name);
            setSelectionSubject(subj);
          }}
          onSelectSavedSelection={handleSelectSavedSelection}
          onAnalyzeAndSaveSelection={handleAnalyzeAndSaveSelection}
          onDeleteSavedSelection={handleDeleteSavedSelection}
          onChangeSettings={handleSettingsChange}
          onChangeMode={setMode}
          onChangeFocusTopic={setFocusTopic}
          onStartSession={() =>
            launchSession({
              modeToUse: mode,
              focusTopicToUse: focusTopic,
              selectionToUse: activeSelection,
            })
          }
        />
      )}

      {subTab === 'session' && activeSession && (
        <PracticeSessionRunner
          key={activeSession.id}
          session={activeSession}
          submittingAnswer={submittingAnswer}
          submittingExam={submittingExam}
          error={actionError}
          onSaveDraft={handleSaveDraft}
          onSubmitSingleAnswer={handleSubmitSingleAnswer}
          onSubmitExam={handleSubmitExam}
          onExitToDashboard={() => {
            setActionError(null);
            setSubTab('overview');
          }}
          onPracticeWeakAfter={(weakTopics) => {
            const firstWeak = weakTopics[0];
            setMode(firstWeak ? 'topic' : 'weak');
            if (firstWeak) setFocusTopic(firstWeak);
            launchSession({
              modeToUse: firstWeak ? 'topic' : 'weak',
              focusTopicToUse: firstWeak,
              selectionToUse: activeSelection,
            });
          }}
        />
      )}
    </div>
  );
};
