import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUpDown,
  Bold,
  Check,
  ChevronRight,
  Code,
  Edit3,
  Eye,
  FileText,
  Folder as FolderIcon,
  FolderPlus,
  Heading2,
  Italic,
  List,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { Folder, StudyItem } from '../types';
import {
  createFolder,
  createStudyItem,
  deleteFolder,
  deleteStudyItem,
  updateFolder,
  updateStudyItem,
} from '../lib/studyStore';
import { extractPdfContent } from '../lib/pdfUtils';
import { cachePdfLocally, getCachedPdfLocally } from '../lib/localPdfCache';
import { ConfirmModal } from './ConfirmModal';
import { MarkdownView } from './MarkdownView';
import { ListSkeleton } from './Skeletons';

interface FilesViewProps {
  userId: string;
  folders: Folder[];
  items: StudyItem[];
  loading: boolean;
}

const FOLDER_COLORS = [
  '#4F46E5',
  '#0284C7',
  '#059669',
  '#D97706',
  '#DC2626',
  '#7C3AED',
];

type SortField = 'name' | 'date' | 'type';

export const FilesView: React.FC<FilesViewProps> = ({
  userId,
  folders,
  items,
  loading,
}) => {
  const [currentFolderId, setCurrentFolderId] = useState<string>('');
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortField>('date');

  // Folder Modal (Create / Rename)
  const [folderModalMode, setFolderModalMode] = useState<'create' | 'rename' | null>(null);
  const [editingFolder, setEditingFolder] = useState<Folder | null>(null);
  const [folderName, setFolderName] = useState('');
  const [folderSubject, setFolderSubject] = useState('');
  const [folderColor, setFolderColor] = useState(FOLDER_COLORS[0]);
  const [folderBusy, setFolderBusy] = useState(false);

  // Item Editor state
  const [editTitle, setEditTitle] = useState('');
  const [editSubject, setEditSubject] = useState('');
  const [editContent, setEditContent] = useState('');
  const [notePreviewMode, setNotePreviewMode] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [pdfTab, setPdfTab] = useState<'viewer' | 'text'>('viewer');
  const [localPdfUrl, setLocalPdfUrl] = useState<string | null>(null);

  // Upload status & errors
  const [actionError, setActionError] = useState<string | null>(null);
  const [uploadingPdf, setUploadingPdf] = useState(false);

  // Delete confirmation
  const [confirmDelete, setConfirmDelete] = useState<
    { kind: 'folder'; id: string; name: string } | { kind: 'item'; id: string; name: string } | null
  >(null);
  const [deleting, setDeleting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const saveTimerRef = useRef<number | null>(null);

  const selectedItem = useMemo(
    () => items.find((i) => i.id === selectedItemId) || null,
    [items, selectedItemId]
  );

  // Sync editor state when selecting an item
  useEffect(() => {
    if (!selectedItem) return;
    setEditTitle(selectedItem.title);
    setEditSubject(selectedItem.subject);
    setEditContent(selectedItem.content);
    setSaveStatus('idle');
    setNotePreviewMode(false);
    setPdfTab('viewer');

    if (selectedItem.type === 'pdf') {
      if (selectedItem.fileDataUrl) {
        setLocalPdfUrl(selectedItem.fileDataUrl);
      } else {
        getCachedPdfLocally(selectedItem.id).then((cached) => {
          setLocalPdfUrl(cached);
        });
      }
    } else {
      setLocalPdfUrl(null);
    }
  }, [selectedItem?.id]);

  // Auto-save note changes (debounced 750ms)
  useEffect(() => {
    if (!selectedItem || selectedItem.type !== 'note') return;
    if (
      editTitle === selectedItem.title &&
      editSubject === selectedItem.subject &&
      editContent === selectedItem.content
    ) {
      return;
    }

    setSaveStatus('saving');
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(async () => {
      try {
        await updateStudyItem(userId, selectedItem.id, {
          title: editTitle || 'Naamloze notitie',
          subject: editSubject,
          content: editContent,
        });
        setSaveStatus('saved');
      } catch (err) {
        setActionError(err instanceof Error ? err.message : 'Kon notitie niet opslaan.');
        setSaveStatus('idle');
      }
    }, 750);

    return () => {
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
  }, [editTitle, editSubject, editContent, selectedItem, userId]);

  // Breadcrumbs for currentFolderId
  const breadcrumbs = useMemo(() => {
    const chain: Folder[] = [];
    let cursor = currentFolderId;
    const guard = new Set<string>();
    while (cursor && !guard.has(cursor)) {
      guard.add(cursor);
      const found = folders.find((f) => f.id === cursor);
      if (!found) break;
      chain.unshift(found);
      cursor = found.parentId;
    }
    return chain;
  }, [folders, currentFolderId]);

  const currentFolder = useMemo(
    () => folders.find((f) => f.id === currentFolderId) || null,
    [folders, currentFolderId]
  );

  const visibleFolders = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = folders.filter((f) => {
      if (q) return f.name.toLowerCase().includes(q) || f.subject.toLowerCase().includes(q);
      return (f.parentId || '') === currentFolderId;
    });
    return [...filtered].sort((a, b) => a.name.localeCompare(b.name, 'nl'));
  }, [folders, currentFolderId, searchQuery]);

  const visibleItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = items.filter((item) => {
      if (q) {
        return (
          item.title.toLowerCase().includes(q) ||
          item.subject.toLowerCase().includes(q) ||
          item.content.toLowerCase().includes(q)
        );
      }
      return (item.folderId || '') === currentFolderId;
    });

    return [...filtered].sort((a, b) => {
      if (sortBy === 'name') return a.title.localeCompare(b.title, 'nl');
      if (sortBy === 'type') return a.type.localeCompare(b.type);
      const aSec = (a.updatedAt as { seconds?: number })?.seconds || 0;
      const bSec = (b.updatedAt as { seconds?: number })?.seconds || 0;
      return bSec - aSec;
    });
  }, [items, currentFolderId, searchQuery, sortBy]);

  const handleSaveFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!folderName.trim()) return;
    setFolderBusy(true);
    setActionError(null);
    try {
      if (folderModalMode === 'create') {
        await createFolder(userId, {
          name: folderName,
          parentId: currentFolderId,
          subject: folderSubject || currentFolder?.subject || '',
          color: folderColor,
        });
      } else if (folderModalMode === 'rename' && editingFolder) {
        await updateFolder(userId, editingFolder.id, {
          name: folderName,
          subject: folderSubject,
          color: folderColor,
        });
      }
      setFolderModalMode(null);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Kon map niet opslaan.');
    } finally {
      setFolderBusy(false);
    }
  };

  const handleNewNote = async () => {
    setActionError(null);
    try {
      const id = await createStudyItem(userId, {
        folderId: currentFolderId,
        title: 'Nieuwe studienotitie',
        type: 'note',
        subject: currentFolder?.subject || 'Algemeen',
        content: '# Nieuwe studienotitie\n\nBegin hier met aantekeningen...\n',
      });
      setSelectedItemId(id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Kon notitie niet aanmaken.');
    }
  };

  const handlePdfUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    setUploadingPdf(true);
    setActionError(null);
    try {
      const extracted = await extractPdfContent(file);
      const id = await createStudyItem(userId, {
        folderId: currentFolderId,
        title: file.name.replace(/\.pdf$/i, ''),
        type: 'pdf',
        subject: currentFolder?.subject || 'Algemeen',
        content: extracted.text,
        fileDataUrl: extracted.dataUrl,
        fileName: file.name,
        fileSize: file.size,
        mimeType: 'application/pdf',
      });
      if (extracted.dataUrl) {
        await cachePdfLocally(id, extracted.dataUrl);
      }
      setSelectedItemId(id);
    } catch (err) {
      setActionError(
        err instanceof Error ? err.message : 'Kon PDF-bestand niet verwerken.'
      );
    } finally {
      setUploadingPdf(false);
    }
  };

  const insertMarkdownSnippet = (before: string, after = '') => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = editContent.slice(start, end);
    const updated =
      editContent.slice(0, start) + before + (selected || 'tekst') + after + editContent.slice(end);
    setEditContent(updated);
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(start + before.length, start + before.length + (selected || 'tekst').length);
    }, 0);
  };

  const typeLabel = (t: StudyItem['type']) => (t === 'pdf' ? 'PDF' : 'Notitie');

  if (loading) {
    return <ListSkeleton rows={6} />;
  }

  return (
    <div className="space-y-6">
      {/* Header & Action Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
            Mappen &amp; Bestanden
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
            Beheer je vakmappen, notities en PDF-bestanden overzichtelijk op één plek.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => {
              setFolderModalMode('create');
              setEditingFolder(null);
              setFolderName('');
              setFolderSubject(currentFolder?.subject || '');
              setFolderColor(FOLDER_COLORS[0]);
            }}
            className="px-3.5 py-2 rounded-lg text-sm font-medium bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2 whitespace-nowrap shrink-0"
          >
            <FolderPlus className="w-4 h-4" />
            <span>Nieuwe map</span>
          </button>

          <button
            type="button"
            onClick={handleNewNote}
            className="px-3.5 py-2 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-2 whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Nieuwe notitie</span>
          </button>

          <button
            type="button"
            disabled={uploadingPdf}
            onClick={() => fileInputRef.current?.click()}
            className="px-3.5 py-2 rounded-lg text-sm font-medium bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2 whitespace-nowrap shrink-0 disabled:opacity-60"
          >
            <Upload className="w-4 h-4" />
            <span>{uploadingPdf ? 'PDF lezen...' : 'PDF uploaden'}</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,.pdf"
            onChange={handlePdfUpload}
            className="hidden"
          />
        </div>
      </div>

      {actionError && (
        <div className="p-3.5 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300 flex items-center justify-between gap-3">
          <span>{actionError}</span>
          <button type="button" onClick={() => setActionError(null)}>
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Search, Breadcrumbs & Sort Toolbar */}
      <div className="rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <nav className="flex items-center gap-1.5 text-sm overflow-x-auto">
          <button
            type="button"
            onClick={() => {
              setCurrentFolderId('');
              setSelectedItemId(null);
            }}
            className={`px-2 py-1 rounded-md font-medium whitespace-nowrap ${
              currentFolderId === ''
                ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
            }`}
          >
            Alle vakken
          </button>
          {breadcrumbs.map((crumb) => (
            <React.Fragment key={crumb.id}>
              <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
              <button
                type="button"
                onClick={() => {
                  setCurrentFolderId(crumb.id);
                  setSelectedItemId(null);
                }}
                className={`px-2 py-1 rounded-md font-medium whitespace-nowrap ${
                  crumb.id === currentFolderId
                    ? 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/40'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                {crumb.name}
              </button>
            </React.Fragment>
          ))}
        </nav>

        <div className="flex items-center gap-2.5">
          <div className="relative flex-1 sm:w-56">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Zoek bestanden..."
              className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
            />
          </div>

          <div className="flex items-center gap-1 text-xs border border-slate-200 dark:border-slate-800 rounded-lg px-2 py-1.5 bg-slate-50 dark:bg-slate-900">
            <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortField)}
              className="bg-transparent text-xs font-medium text-slate-700 dark:text-slate-300 focus:outline-none"
            >
              <option value="date">Datum</option>
              <option value="name">Naam</option>
              <option value="type">Type</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Split: File Explorer + Active Viewer/Editor */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left List */}
        <div
          className={`${
            selectedItem ? 'lg:col-span-5' : 'lg:col-span-12'
          } space-y-4`}
        >
          {/* Subfolders Grid */}
          {visibleFolders.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
              {visibleFolders.map((folder) => (
                <div
                  key={folder.id}
                  className="rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-3.5 flex items-center justify-between gap-2 hover:border-indigo-400 dark:hover:border-indigo-500 transition-colors"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setCurrentFolderId(folder.id);
                      setSearchQuery('');
                      setSelectedItemId(null);
                    }}
                    className="flex items-center gap-3 min-w-0 flex-1 text-left"
                  >
                    <div
                      className="w-9 h-9 rounded-lg flex items-center justify-center text-white shrink-0"
                      style={{ backgroundColor: folder.color || '#4F46E5' }}
                    >
                      <FolderIcon className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                        {folder.name}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                        {folder.subject || 'Map'}
                      </p>
                    </div>
                  </button>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setFolderModalMode('rename');
                        setEditingFolder(folder);
                        setFolderName(folder.name);
                        setFolderSubject(folder.subject);
                        setFolderColor(folder.color || FOLDER_COLORS[0]);
                      }}
                      className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                      title="Map bewerken"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setConfirmDelete({ kind: 'folder', id: folder.id, name: folder.name })
                      }
                      className="p-1.5 rounded-md text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-slate-100 dark:hover:bg-slate-800"
                      title="Map verwijderen"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Items Table / List */}
          <div className="rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 overflow-hidden">
            {visibleItems.length === 0 ? (
              <div className="p-10 text-center space-y-2">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  {searchQuery
                    ? 'Geen bestanden gevonden voor je zoekopdracht.'
                    : 'Deze map bevat nog geen bestanden.'}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Maak een notitie aan of upload een PDF-bestand.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                {visibleItems.map((item) => {
                  const isActive = selectedItem?.id === item.id;
                  return (
                    <div
                      key={item.id}
                      className={`px-4 py-3 flex items-center justify-between gap-3 transition-colors ${
                        isActive
                          ? 'bg-indigo-50/70 dark:bg-indigo-950/30'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedItemId(item.id)}
                        className="flex items-center gap-3 min-w-0 flex-1 text-left"
                      >
                        <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 shrink-0">
                          {item.type === 'pdf' ? (
                            <Upload className="w-4 h-4 text-red-600 dark:text-red-400" />
                          ) : (
                            <FileText className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                            {item.title}
                          </p>
                          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                            {typeLabel(item.type)} · {item.subject || 'Algemeen'}
                          </p>
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          setConfirmDelete({ kind: 'item', id: item.id, name: item.title })
                        }
                        className="p-1.5 rounded-md text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
                        aria-label="Bestand verwijderen"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Viewer / Rich-Text Note Editor */}
        {selectedItem && (
          <div className="lg:col-span-7 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 overflow-hidden">
            {/* Editor Top Bar */}
            <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {selectedItem.type === 'note' ? (
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="w-full text-base font-bold bg-transparent text-slate-900 dark:text-slate-100 focus:outline-none"
                  />
                ) : (
                  <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 truncate">
                    {selectedItem.title}
                  </h3>
                )}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {/* Move Folder Dropdown */}
                <select
                  value={selectedItem.folderId}
                  onChange={(e) =>
                    updateStudyItem(userId, selectedItem.id, { folderId: e.target.value })
                  }
                  title="Verplaats naar map"
                  className="px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 max-w-[140px]"
                >
                  <option value="">Hoofdmap</option>
                  {folders.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={() => setSelectedItemId(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                  aria-label="Sluiten"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* NOTE EDITOR */}
            {selectedItem.type === 'note' && (
              <div className="p-4 sm:p-5 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200 dark:border-slate-800">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => insertMarkdownSnippet('## ', '')}
                      className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
                      title="Koptekst"
                    >
                      <Heading2 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => insertMarkdownSnippet('**', '**')}
                      className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
                      title="Vet"
                    >
                      <Bold className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => insertMarkdownSnippet('*', '*')}
                      className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
                      title="Cursief"
                    >
                      <Italic className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => insertMarkdownSnippet('- ', '')}
                      className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
                      title="Opsomming"
                    >
                      <List className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => insertMarkdownSnippet('`', '`')}
                      className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
                      title="Code"
                    >
                      <Code className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex items-center gap-3">
                    <input
                      type="text"
                      value={editSubject}
                      onChange={(e) => setEditSubject(e.target.value)}
                      placeholder="Vak"
                      className="w-28 px-2.5 py-1 rounded-md bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs"
                    />
                    <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                      {saveStatus === 'saving' && 'Opslaan...'}
                      {saveStatus === 'saved' && (
                        <>
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                          Opgeslagen
                        </>
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() => setNotePreviewMode((v) => !v)}
                      className="px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700 text-xs font-medium flex items-center gap-1.5 hover:bg-slate-50 dark:hover:bg-slate-800"
                    >
                      {notePreviewMode ? (
                        <>
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Bewerken</span>
                        </>
                      ) : (
                        <>
                          <Eye className="w-3.5 h-3.5" />
                          <span>Voorbeeld</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {notePreviewMode ? (
                  <div className="min-h-[380px] p-2">
                    <MarkdownView content={editContent} />
                  </div>
                ) : (
                  <textarea
                    ref={textareaRef}
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    rows={16}
                    placeholder="Schrijf hier je samenvatting of aantekeningen..."
                    className="w-full min-h-[380px] p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                  />
                )}
              </div>
            )}

            {/* PDF VIEWER */}
            {selectedItem.type === 'pdf' && (
              <div className="p-4 sm:p-5 space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-900">
                    <button
                      type="button"
                      onClick={() => setPdfTab('viewer')}
                      className={`px-3 py-1 rounded-md text-xs font-medium ${
                        pdfTab === 'viewer'
                          ? 'bg-white dark:bg-[#161D2B] text-slate-900 dark:text-slate-100 shadow-xs'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      PDF-weergave
                    </button>
                    <button
                      type="button"
                      onClick={() => setPdfTab('text')}
                      className={`px-3 py-1 rounded-md text-xs font-medium ${
                        pdfTab === 'text'
                          ? 'bg-white dark:bg-[#161D2B] text-slate-900 dark:text-slate-100 shadow-xs'
                          : 'text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      Geëxtraheerde AI-tekst
                    </button>
                  </div>
                  <span className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                    {Math.round((selectedItem.fileSize || 0) / 1024)} KB
                  </span>
                </div>

                {pdfTab === 'viewer' ? (
                  localPdfUrl ? (
                    <iframe
                      title={selectedItem.title}
                      src={localPdfUrl}
                      className="w-full h-[480px] rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-900"
                    />
                  ) : (
                    <div className="p-8 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center text-sm text-slate-600 dark:text-slate-400">
                      Dit PDF-bestand is groter dan 650 KB en wordt op dit apparaat alleen als
                      geëxtraheerde tekst getoond. Gebruik het tabblad &ldquo;Geëxtraheerde AI-tekst&rdquo;.
                    </div>
                  )
                ) : (
                  <pre className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs leading-relaxed whitespace-pre-wrap max-h-[480px] overflow-y-auto text-slate-700 dark:text-slate-300">
                    {selectedItem.content}
                  </pre>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Folder Create/Rename Modal */}
      {folderModalMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-6">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                {folderModalMode === 'create' ? 'Nieuwe map aanmaken' : 'Map bewerken'}
              </h3>
              <button
                type="button"
                onClick={() => setFolderModalMode(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveFolder} className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Mapnaam
                </label>
                <input
                  type="text"
                  required
                  value={folderName}
                  onChange={(e) => setFolderName(e.target.value)}
                  placeholder="Bijv. Biologie of Hoofdstuk 2"
                  className="w-full px-3.5 py-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Vaknaam
                </label>
                <input
                  type="text"
                  value={folderSubject}
                  onChange={(e) => setFolderSubject(e.target.value)}
                  placeholder="Biologie"
                  className="w-full px-3.5 py-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Mapkleur
                </label>
                <div className="flex items-center gap-2.5">
                  {FOLDER_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setFolderColor(c)}
                      className={`w-7 h-7 rounded-full transition-transform ${
                        folderColor === c ? 'scale-115 ring-2 ring-offset-2 ring-indigo-500' : ''
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setFolderModalMode(null)}
                  className="px-4 py-2 rounded-lg text-sm font-medium border border-slate-200 dark:border-slate-700"
                >
                  Annuleren
                </button>
                <button
                  type="submit"
                  disabled={folderBusy}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-60"
                >
                  {folderBusy ? 'Opslaan...' : 'Opslaan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        open={Boolean(confirmDelete)}
        title={confirmDelete?.kind === 'folder' ? 'Map verwijderen?' : 'Bestand verwijderen?'}
        description={`Weet je zeker dat je "${confirmDelete?.name}" definitief wilt verwijderen?`}
        busy={deleting}
        onCancel={() => setConfirmDelete(null)}
        onConfirm={async () => {
          if (!confirmDelete) return;
          setDeleting(true);
          try {
            if (confirmDelete.kind === 'folder') {
              await deleteFolder(userId, confirmDelete.id);
              if (currentFolderId === confirmDelete.id) setCurrentFolderId('');
            } else {
              await deleteStudyItem(userId, confirmDelete.id);
              if (selectedItemId === confirmDelete.id) setSelectedItemId(null);
            }
            setConfirmDelete(null);
          } finally {
            setDeleting(false);
          }
        }}
      />
    </div>
  );
};
