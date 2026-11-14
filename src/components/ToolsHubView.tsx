import React, { useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Calculator,
  Check,
  Compass,
  Edit3,
  ExternalLink,
  Folder as FolderIcon,
  FolderPlus,
  Gamepad2,
  Globe,
  GripVertical,
  Layers,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Tv,
  X,
  Youtube,
  Zap,
} from 'lucide-react';
import { ExternalTool, ToolFolder } from '../types';
import {
  createExternalTool,
  createToolFolder,
  deleteExternalTool,
  deleteToolFolder,
  reorderExternalTools,
  reorderToolFolders,
  updateExternalTool,
  updateToolFolder,
} from '../lib/studyStore';
import { detectExternalToolFromUrl } from '../lib/toolDetector';
import { ConfirmModal } from './ConfirmModal';
import { ListSkeleton } from './Skeletons';

interface ToolsHubViewProps {
  userId: string;
  tools: ExternalTool[];
  toolFolders: ToolFolder[];
  loading: boolean;
}

const TOOL_COLORS = [
  '#2563EB',
  '#4F46E5',
  '#6D28D9',
  '#16A34A',
  '#DC2626',
  '#991B1B',
  '#D97706',
];

const GRADE_YEAR_PRESETS = [
  'Leerjaar 1',
  'Leerjaar 2',
  'Leerjaar 3',
  'Leerjaar 4',
  'Leerjaar 5',
  'Leerjaar 6',
  'Onderbouw',
  'Bovenbouw',
  'Examenjaar',
  'Algemeen',
];

const LEVEL_PRESETS = [
  'Alle niveaus',
  'VMBO-Basis',
  'VMBO-Kader',
  'MAVO / VMBO-TL',
  'HAVO',
  'VWO / Gymnasium',
  'MBO',
  'HBO / WO',
];

const ICON_OPTIONS = [
  { id: 'Youtube', label: 'YouTube', Icon: Youtube },
  { id: 'BookOpen', label: 'Boek', Icon: BookOpen },
  { id: 'Layers', label: 'Kaarten', Icon: Layers },
  { id: 'Tv', label: 'TV / Video', Icon: Tv },
  { id: 'Zap', label: 'Bliksem', Icon: Zap },
  { id: 'Gamepad2', label: 'Spel', Icon: Gamepad2 },
  { id: 'Globe', label: 'Web', Icon: Globe },
  { id: 'Calculator', label: 'Rekenen', Icon: Calculator },
  { id: 'Compass', label: 'Kompas', Icon: Compass },
];

function renderToolIcon(iconName: string) {
  const found = ICON_OPTIONS.find((i) => i.id === iconName);
  const IconComp = found ? found.Icon : Globe;
  return <IconComp className="w-5 h-5" />;
}

export const ToolsHubView: React.FC<ToolsHubViewProps> = ({
  userId,
  tools,
  toolFolders,
  loading,
}) => {
  // Navigation between main hub overview and separate Folders menu
  const [activeTab, setActiveTab] = useState<'all' | 'folders'>('all');
  const [selectedFolderKey, setSelectedFolderKey] = useState<string>('__first__');

  // Filter & Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSubject, setFilterSubject] = useState('');
  const [filterGradeYear, setFilterGradeYear] = useState('');
  const [filterLevel, setFilterLevel] = useState('');
  const [filterFolderId, setFilterFolderId] = useState('');

  // Drag & Drop ordering state
  const [draggedToolId, setDraggedToolId] = useState<string | null>(null);
  const [dragOverToolId, setDragOverToolId] = useState<string | null>(null);
  const [reorderingBusy, setReorderingBusy] = useState(false);

  // Add / Edit Tool Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTool, setEditingTool] = useState<ExternalTool | null>(null);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [subjectLabel, setSubjectLabel] = useState('');
  const [description, setDescription] = useState('');
  const [gradeYear, setGradeYear] = useState('');
  const [level, setLevel] = useState('');
  const [selectedToolFolderIds, setSelectedToolFolderIds] = useState<string[]>([]);
  const [color, setColor] = useState(TOOL_COLORS[0]);
  const [iconName, setIconName] = useState('Globe');
  const [nameManuallyEdited, setNameManuallyEdited] = useState(false);
  const [subjectManuallyEdited, setSubjectManuallyEdited] = useState(false);
  const [descriptionManuallyEdited, setDescriptionManuallyEdited] = useState(false);
  const [detectedPlatform, setDetectedPlatform] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Assign Tool to Folders Quick Picker Modal
  const [assignModalTool, setAssignModalTool] = useState<ExternalTool | null>(null);
  const [assignFolderIds, setAssignFolderIds] = useState<string[]>([]);
  const [assignSaving, setAssignSaving] = useState(false);
  const [quickNewFolderName, setQuickNewFolderName] = useState('');

  // Folder Create / Edit Modal
  const [folderModalOpen, setFolderModalOpen] = useState(false);
  const [editingFolder, setEditingFolder] = useState<ToolFolder | null>(null);
  const [folderName, setFolderName] = useState('');
  const [folderDesc, setFolderDesc] = useState('');
  const [folderColor, setFolderColor] = useState(TOOL_COLORS[1]);
  const [folderSaving, setFolderSaving] = useState(false);

  // Add existing tools into currently selected folder modal
  const [addExistingToFolderOpen, setAddExistingToFolderOpen] = useState(false);
  const [existingSearchQuery, setExistingSearchQuery] = useState('');

  // Delete confirmations
  const [deleteTarget, setDeleteTarget] = useState<ExternalTool | null>(null);
  const [deleteFolderTarget, setDeleteFolderTarget] = useState<ToolFolder | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Active folder resolution for the separate "Mappen" menu
  const effectiveFolderKey = useMemo(() => {
    if (selectedFolderKey === '__unassigned__') return '__unassigned__';
    if (
      selectedFolderKey &&
      selectedFolderKey !== '__first__' &&
      toolFolders.some((f) => f.id === selectedFolderKey)
    ) {
      return selectedFolderKey;
    }
    return toolFolders[0]?.id || '__unassigned__';
  }, [selectedFolderKey, toolFolders]);

  const activeFolder = useMemo(
    () => toolFolders.find((f) => f.id === effectiveFolderKey) || null,
    [toolFolders, effectiveFolderKey]
  );

  // Distinct dropdown options gathered dynamically from user tools
  const subjectOptions = useMemo(() => {
    const set = new Set<string>();
    for (const t of tools) {
      if (t.subjectLabel?.trim()) set.add(t.subjectLabel.trim());
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'nl'));
  }, [tools]);

  const gradeYearOptions = useMemo(() => {
    const set = new Set<string>();
    for (const t of tools) {
      if (t.gradeYear?.trim()) set.add(t.gradeYear.trim());
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'nl'));
  }, [tools]);

  const levelOptions = useMemo(() => {
    const set = new Set<string>();
    for (const t of tools) {
      if (t.level?.trim()) set.add(t.level.trim());
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'nl'));
  }, [tools]);

  const folderNameMap = useMemo(() => {
    const map = new Map<string, ToolFolder>();
    for (const f of toolFolders) map.set(f.id, f);
    return map;
  }, [toolFolders]);

  const unassignedCount = useMemo(
    () => tools.filter((t) => !t.folderIds || t.folderIds.length === 0).length,
    [tools]
  );

  const hasActiveFilters = Boolean(
    searchQuery.trim() ||
      filterSubject ||
      filterGradeYear ||
      filterLevel ||
      (activeTab === 'all' && filterFolderId)
  );

  const resetFilters = () => {
    setSearchQuery('');
    setFilterSubject('');
    setFilterGradeYear('');
    setFilterLevel('');
    setFilterFolderId('');
  };

  // Filtered tools list depending on active tab & filters
  const baseTabTools = useMemo(() => {
    if (activeTab === 'all') {
      if (filterFolderId === '__unassigned__') {
        return tools.filter((t) => !t.folderIds || t.folderIds.length === 0);
      }
      if (filterFolderId) {
        return tools.filter((t) => Array.isArray(t.folderIds) && t.folderIds.includes(filterFolderId));
      }
      return tools;
    }
    // In separate 'Mappen' menu
    if (effectiveFolderKey === '__unassigned__') {
      return tools.filter((t) => !t.folderIds || t.folderIds.length === 0);
    }
    return tools.filter((t) => Array.isArray(t.folderIds) && t.folderIds.includes(effectiveFolderKey));
  }, [activeTab, tools, filterFolderId, effectiveFolderKey]);

  const filteredTools = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return baseTabTools.filter((tool) => {
      if (filterSubject && (tool.subjectLabel || '').trim() !== filterSubject) return false;
      if (filterGradeYear && (tool.gradeYear || '').trim() !== filterGradeYear) return false;
      if (filterLevel && (tool.level || '').trim() !== filterLevel) return false;
      if (q) {
        const folderNames = (tool.folderIds || [])
          .map((fid) => folderNameMap.get(fid)?.name || '')
          .join(' ');
        const haystack = [
          tool.name,
          tool.description || '',
          tool.subjectLabel || '',
          tool.gradeYear || '',
          tool.level || '',
          tool.url,
          folderNames,
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [baseTabTools, filterSubject, filterGradeYear, filterLevel, searchQuery, folderNameMap]);

  // Move / reorder helpers (works seamlessly across both full list and filtered views)
  const commitToolReorder = async (sourceId: string, targetId: string) => {
    if (sourceId === targetId || reorderingBusy) return;
    const allIds = tools.map((t) => t.id);
    const fromIdx = allIds.indexOf(sourceId);
    const toIdx = allIds.indexOf(targetId);
    if (fromIdx === -1 || toIdx === -1) return;

    const updated = [...allIds];
    const [moved] = updated.splice(fromIdx, 1);
    updated.splice(toIdx, 0, moved);

    setReorderingBusy(true);
    try {
      await reorderExternalTools(userId, updated);
    } finally {
      setReorderingBusy(false);
    }
  };

  const stepToolOrder = async (toolId: string, direction: -1 | 1) => {
    const visibleIndex = filteredTools.findIndex((t) => t.id === toolId);
    if (visibleIndex === -1) return;
    const neighbor = filteredTools[visibleIndex + direction];
    if (!neighbor) return;
    await commitToolReorder(toolId, neighbor.id);
  };

  const stepFolderOrder = async (folderId: string, direction: -1 | 1) => {
    const idx = toolFolders.findIndex((f) => f.id === folderId);
    if (idx === -1) return;
    const nextIdx = idx + direction;
    if (nextIdx < 0 || nextIdx >= toolFolders.length) return;
    const ordered = toolFolders.map((f) => f.id);
    const [moved] = ordered.splice(idx, 1);
    ordered.splice(nextIdx, 0, moved);
    await reorderToolFolders(userId, ordered);
  };

  // Tool Add / Edit Modal handlers
  const openAdd = (presetFolderId?: string) => {
    setEditingTool(null);
    setName('');
    setUrl('');
    setSubjectLabel('');
    setDescription('');
    setGradeYear('');
    setLevel('');
    setSelectedToolFolderIds(
      presetFolderId && presetFolderId !== '__unassigned__' ? [presetFolderId] : []
    );
    setColor('#4F46E5');
    setIconName('Globe');
    setNameManuallyEdited(false);
    setSubjectManuallyEdited(false);
    setDescriptionManuallyEdited(false);
    setDetectedPlatform(null);
    setModalOpen(true);
  };

  const openEdit = (tool: ExternalTool) => {
    setEditingTool(tool);
    setName(tool.name);
    setUrl(tool.url);
    setSubjectLabel(tool.subjectLabel || '');
    setDescription(tool.description || '');
    setGradeYear(tool.gradeYear || '');
    setLevel(tool.level || '');
    setSelectedToolFolderIds(Array.isArray(tool.folderIds) ? tool.folderIds : []);
    setColor(tool.color || TOOL_COLORS[0]);
    setIconName(tool.iconName || 'Globe');
    setNameManuallyEdited(true);
    setSubjectManuallyEdited(Boolean(tool.subjectLabel));
    setDescriptionManuallyEdited(Boolean(tool.description));
    const detected = detectExternalToolFromUrl(tool.url);
    setDetectedPlatform(detected.matched ? detected.platformName : null);
    setModalOpen(true);
  };

  const handleUrlChange = (nextUrl: string) => {
    setUrl(nextUrl);
    const detected = detectExternalToolFromUrl(nextUrl);
    setIconName(detected.iconName);
    setColor(detected.color);
    if (detected.matched) {
      setDetectedPlatform(detected.platformName);
      if (!nameManuallyEdited || !name.trim()) {
        setName(detected.platformName);
      }
      if ((!subjectManuallyEdited || !subjectLabel.trim()) && detected.defaultSubject) {
        setSubjectLabel(detected.defaultSubject);
      }
      if ((!descriptionManuallyEdited || !description.trim()) && detected.defaultDescription) {
        setDescription(detected.defaultDescription);
      }
    } else {
      setDetectedPlatform(null);
      if (!nameManuallyEdited && detected.platformName) {
        setName(detected.platformName);
      }
    }
  };

  const handleSaveTool = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !url.trim()) return;
    const normalizedUrl = /^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`;
    setSaving(true);
    try {
      if (editingTool) {
        await updateExternalTool(userId, editingTool.id, {
          name,
          url: normalizedUrl,
          subjectLabel,
          description,
          gradeYear,
          level,
          folderIds: selectedToolFolderIds,
          color,
          iconName,
        });
      } else {
        const nextSort =
          tools.length > 0
            ? Math.max(...tools.map((t, i) => (typeof t.sortOrder === 'number' ? t.sortOrder : i))) + 1
            : 0;
        await createExternalTool(userId, {
          name,
          url: normalizedUrl,
          subjectLabel,
          description,
          gradeYear,
          level,
          sortOrder: nextSort,
          folderIds: selectedToolFolderIds,
          color,
          iconName,
        });
      }
      setModalOpen(false);
    } finally {
      setSaving(false);
    }
  };

  // Folder Modal handlers
  const openCreateFolder = () => {
    setEditingFolder(null);
    setFolderName('');
    setFolderDesc('');
    setFolderColor(TOOL_COLORS[1]);
    setFolderModalOpen(true);
  };

  const openEditFolder = (folder: ToolFolder) => {
    setEditingFolder(folder);
    setFolderName(folder.name);
    setFolderDesc(folder.description || '');
    setFolderColor(folder.color || TOOL_COLORS[1]);
    setFolderModalOpen(true);
  };

  const handleSaveFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!folderName.trim()) return;
    setFolderSaving(true);
    try {
      if (editingFolder) {
        await updateToolFolder(userId, editingFolder.id, {
          name: folderName,
          description: folderDesc,
          color: folderColor,
        });
      } else {
        const nextSort =
          toolFolders.length > 0
            ? Math.max(...toolFolders.map((f, i) => (typeof f.sortOrder === 'number' ? f.sortOrder : i))) + 1
            : 0;
        const newId = await createToolFolder(userId, {
          name: folderName,
          description: folderDesc,
          color: folderColor,
          sortOrder: nextSort,
        });
        setSelectedFolderKey(newId);
        setActiveTab('folders');
      }
      setFolderModalOpen(false);
    } finally {
      setFolderSaving(false);
    }
  };

  // Assign Tool to Folders Picker handlers
  const openAssignFolders = (tool: ExternalTool) => {
    setAssignModalTool(tool);
    setAssignFolderIds(Array.isArray(tool.folderIds) ? tool.folderIds : []);
    setQuickNewFolderName('');
  };

  const handleSaveAssignFolders = async () => {
    if (!assignModalTool) return;
    setAssignSaving(true);
    try {
      await updateExternalTool(userId, assignModalTool.id, {
        folderIds: assignFolderIds,
      });
      setAssignModalTool(null);
    } finally {
      setAssignSaving(false);
    }
  };

  const handleQuickCreateAndSelectFolder = async () => {
    if (!quickNewFolderName.trim()) return;
    const nextSort =
      toolFolders.length > 0
        ? Math.max(...toolFolders.map((f, i) => (typeof f.sortOrder === 'number' ? f.sortOrder : i))) + 1
        : 0;
    const newId = await createToolFolder(userId, {
      name: quickNewFolderName.trim(),
      color: TOOL_COLORS[toolFolders.length % TOOL_COLORS.length],
      sortOrder: nextSort,
    });
    setAssignFolderIds((prev) => Array.from(new Set([...prev, newId])));
    setQuickNewFolderName('');
  };

  const handleToggleToolMembershipInActiveFolder = async (tool: ExternalTool) => {
    if (!activeFolder) return;
    const current = Array.isArray(tool.folderIds) ? tool.folderIds : [];
    const exists = current.includes(activeFolder.id);
    const next = exists
      ? current.filter((fid) => fid !== activeFolder.id)
      : [...current, activeFolder.id];
    await updateExternalTool(userId, tool.id, { folderIds: next });
  };

  if (loading) {
    return <ListSkeleton rows={4} />;
  }

  const renderFilterBar = () => (
    <div className="rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-4 space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3 items-center">
        <div className="relative lg:col-span-5">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Zoek op naam, beschrijving, vak, leerjaar of niveau..."
            className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
          />
        </div>

        <select
          value={filterSubject}
          onChange={(e) => setFilterSubject(e.target.value)}
          aria-label="Filter op vak"
          className="lg:col-span-2 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
        >
          <option value="">Alle vakken</option>
          {subjectOptions.map((subj) => (
            <option key={subj} value={subj}>
              {subj}
            </option>
          ))}
        </select>

        <select
          value={filterGradeYear}
          onChange={(e) => setFilterGradeYear(e.target.value)}
          aria-label="Filter op leerjaar"
          className="lg:col-span-2 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
        >
          <option value="">Alle leerjaren</option>
          {gradeYearOptions.map((gy) => (
            <option key={gy} value={gy}>
              {gy}
            </option>
          ))}
        </select>

        <select
          value={filterLevel}
          onChange={(e) => setFilterLevel(e.target.value)}
          aria-label="Filter op niveau"
          className={
            activeTab === 'all' && toolFolders.length > 0
              ? 'lg:col-span-1 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/30'
              : 'lg:col-span-3 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/30'
          }
        >
          <option value="">Alle niveaus</option>
          {levelOptions.map((lvl) => (
            <option key={lvl} value={lvl}>
              {lvl}
            </option>
          ))}
        </select>

        {activeTab === 'all' && toolFolders.length > 0 && (
          <select
            value={filterFolderId}
            onChange={(e) => setFilterFolderId(e.target.value)}
            aria-label="Filter op map"
            className="lg:col-span-2 px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
          >
            <option value="">Alle mappen</option>
            {toolFolders.map((f) => (
              <option key={f.id} value={f.id}>
                Map: {f.name}
              </option>
            ))}
            <option value="__unassigned__">Zonder map</option>
          </select>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
        <span className="tabular-nums">
          {filteredTools.length} van {baseTabTools.length} leertools zichtbaar
          {baseTabTools.length > 1 ? ' · Sleep een blok of gebruik de pijltjes om de volgorde aan te passen' : ''}
        </span>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={resetFilters}
            className="font-medium text-indigo-600 dark:text-indigo-400 hover:underline whitespace-nowrap shrink-0"
          >
            Filters wissen
          </button>
        )}
      </div>
    </div>
  );

  const renderToolCardsGrid = (list: ExternalTool[]) => {
    if (list.length === 0) {
      return (
        <div className="rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-10 text-center space-y-3">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
            {hasActiveFilters
              ? 'Geen leertools gevonden voor deze zoek- of filtercombinatie.'
              : activeTab === 'folders'
                ? activeFolder
                  ? `De map "${activeFolder.name}" bevat nog geen leertools.`
                  : 'Alle leertools zitten al in één of meer mappen.'
                : 'Je hebt nog geen externe leertools toegevoegd.'}
          </p>
          <div className="flex items-center justify-center gap-2.5 flex-wrap">
            {hasActiveFilters && (
              <button
                type="button"
                onClick={resetFilters}
                className="px-4 py-2 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap shrink-0"
              >
                Filters wissen
              </button>
            )}
            {activeTab === 'folders' && activeFolder ? (
              <button
                type="button"
                onClick={() => {
                  setExistingSearchQuery('');
                  setAddExistingToFolderOpen(true);
                }}
                className="px-4 py-2 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-700 text-white whitespace-nowrap shrink-0"
              >
                Tool aan deze map toevoegen
              </button>
            ) : (
              <button
                type="button"
                onClick={() => openAdd(activeTab === 'folders' ? effectiveFolderKey : undefined)}
                className="px-4 py-2 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-700 text-white whitespace-nowrap shrink-0"
              >
                Link toevoegen
              </button>
            )}
          </div>
        </div>
      );
    }

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {list.map((tool, index) => {
          const metaParts: string[] = [];
          if (tool.subjectLabel?.trim()) metaParts.push(tool.subjectLabel.trim());
          if (tool.gradeYear?.trim()) metaParts.push(tool.gradeYear.trim());
          if (tool.level?.trim()) metaParts.push(tool.level.trim());
          const assignedFolders = (tool.folderIds || [])
            .map((fid) => folderNameMap.get(fid))
            .filter((f): f is ToolFolder => Boolean(f));

          const isDragged = draggedToolId === tool.id;
          const isDragTarget = dragOverToolId === tool.id && draggedToolId !== tool.id;

          return (
            <div
              key={tool.id}
              draggable={list.length > 1}
              onDragStart={(e) => {
                setDraggedToolId(tool.id);
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', tool.id);
              }}
              onDragOver={(e) => {
                if (!draggedToolId || draggedToolId === tool.id) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (dragOverToolId !== tool.id) setDragOverToolId(tool.id);
              }}
              onDragLeave={() => {
                if (dragOverToolId === tool.id) setDragOverToolId(null);
              }}
              onDrop={async (e) => {
                e.preventDefault();
                const src = draggedToolId || e.dataTransfer.getData('text/plain');
                setDraggedToolId(null);
                setDragOverToolId(null);
                if (src && src !== tool.id) {
                  await commitToolReorder(src, tool.id);
                }
              }}
              onDragEnd={() => {
                setDraggedToolId(null);
                setDragOverToolId(null);
              }}
              className={`rounded-xl bg-white dark:bg-[#111827] border p-5 flex flex-col justify-between gap-4 transition-colors ${
                isDragTarget
                  ? 'border-indigo-500 ring-2 ring-indigo-500/30'
                  : 'border-slate-200 dark:border-slate-800 hover:border-indigo-400 dark:hover:border-indigo-500'
              } ${isDragged ? 'opacity-55' : ''}`}
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="w-10 h-10 rounded-xl text-white flex items-center justify-center shrink-0"
                      style={{ backgroundColor: tool.color || '#4F46E5' }}
                    >
                      {renderToolIcon(tool.iconName)}
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 truncate">
                        {tool.name}
                      </h3>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                        {metaParts.length > 0 ? metaParts.join(' · ') : 'Leertool'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-0.5 shrink-0">
                    {list.length > 1 && (
                      <>
                        <span
                          className="p-1 text-slate-400 cursor-grab active:cursor-grabbing hidden sm:inline-flex"
                          title="Versleep om volgorde aan te passen"
                        >
                          <GripVertical className="w-3.5 h-3.5" />
                        </span>
                        <button
                          type="button"
                          disabled={index === 0 || reorderingBusy}
                          onClick={() => stepToolOrder(tool.id, -1)}
                          className="p-1 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-30"
                          title="Eerder in lijst plaatsen"
                          aria-label="Eerder plaatsen"
                        >
                          <ArrowLeft className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={index === list.length - 1 || reorderingBusy}
                          onClick={() => stepToolOrder(tool.id, 1)}
                          className="p-1 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-30"
                          title="Later in lijst plaatsen"
                          aria-label="Later plaatsen"
                        >
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={() => openAssignFolders(tool)}
                      className="p-1 rounded-md text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400"
                      title="In mappen plaatsen"
                      aria-label="In mappen plaatsen"
                    >
                      <FolderPlus className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => openEdit(tool)}
                      className="p-1 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                      title="Bewerken"
                      aria-label="Bewerken"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteTarget(tool)}
                      className="p-1 rounded-md text-slate-400 hover:text-red-600 dark:hover:text-red-400"
                      title="Verwijderen"
                      aria-label="Verwijderen"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {tool.description?.trim() && (
                  <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed line-clamp-2">
                    {tool.description.trim()}
                  </p>
                )}

                {assignedFolders.length > 0 && (
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    Mappen: {assignedFolders.map((f) => f.name).join(' · ')}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <a
                  href={tool.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-2 px-3 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center justify-between gap-2"
                >
                  <span className="truncate">{tool.url.replace(/^https?:\/\//, '')}</span>
                  <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                </a>

                {activeTab === 'folders' && activeFolder && (
                  <button
                    type="button"
                    onClick={() => handleToggleToolMembershipInActiveFolder(tool)}
                    className="w-full py-1.5 px-3 rounded-lg text-[11px] font-medium text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors text-left"
                  >
                    Uit map "{activeFolder.name}" halen
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
            Externe Leertools Hub
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
            Filter je studietools op vak, leerjaar of niveau, pas de volgorde aan en organiseer ze in je mappenmenu.
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap shrink-0">
          {activeTab === 'folders' && (
            <button
              type="button"
              onClick={openCreateFolder}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2 whitespace-nowrap shrink-0"
            >
              <FolderPlus className="w-4 h-4" />
              <span>Nieuwe map</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => openAdd(activeTab === 'folders' ? effectiveFolderKey : undefined)}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-2 whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Link toevoegen</span>
          </button>
        </div>
      </div>

      {/* Sub-navigation: Alle tools vs Apart Mappen-menu */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setActiveTab('all')}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
              activeTab === 'all'
                ? 'bg-white dark:bg-[#161D2B] text-slate-900 dark:text-slate-100 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            Alle tools <span className="tabular-nums opacity-75">({tools.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('folders')}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 ${
              activeTab === 'folders'
                ? 'bg-white dark:bg-[#161D2B] text-slate-900 dark:text-slate-100 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <FolderIcon className="w-3.5 h-3.5" />
            <span>Mappen</span>
            <span className="tabular-nums opacity-75">({toolFolders.length})</span>
          </button>
        </div>
      </div>

      {/* Tab 1: All Tools Overview with Filters & Ordering */}
      {activeTab === 'all' && (
        <div className="space-y-4">
          {renderFilterBar()}
          {renderToolCardsGrid(filteredTools)}
        </div>
      )}

      {/* Tab 2: Dedicated Separate Mappen Menu */}
      {activeTab === 'folders' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Dedicated Folders Menu */}
          <aside className="lg:col-span-4 xl:col-span-3 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100">
                Mappenmenu
              </h2>
              <button
                type="button"
                onClick={openCreateFolder}
                className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 whitespace-nowrap shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Nieuwe map</span>
              </button>
            </div>

            {toolFolders.length === 0 ? (
              <div className="p-4 rounded-lg bg-slate-50 dark:bg-slate-900/70 text-xs text-slate-600 dark:text-slate-400 space-y-2">
                <p>Je hebt nog geen mappen aangemaakt voor je leertools.</p>
                <button
                  type="button"
                  onClick={openCreateFolder}
                  className="font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  Eerste map maken
                </button>
              </div>
            ) : (
              <div className="space-y-1.5">
                {toolFolders.map((folder, idx) => {
                  const count = tools.filter(
                    (t) => Array.isArray(t.folderIds) && t.folderIds.includes(folder.id)
                  ).length;
                  const active = effectiveFolderKey === folder.id;
                  return (
                    <div
                      key={folder.id}
                      className={`group rounded-lg border transition-colors ${
                        active
                          ? 'bg-indigo-50/70 dark:bg-indigo-950/40 border-indigo-400 dark:border-indigo-700'
                          : 'bg-slate-50/60 dark:bg-slate-900/40 border-transparent hover:border-slate-200 dark:hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 px-2.5 py-2">
                        <button
                          type="button"
                          onClick={() => setSelectedFolderKey(folder.id)}
                          className="flex items-center gap-2.5 min-w-0 flex-1 text-left"
                        >
                          <span
                            className="w-7 h-7 rounded-md text-white flex items-center justify-center shrink-0"
                            style={{ backgroundColor: folder.color || '#4F46E5' }}
                          >
                            <FolderIcon className="w-3.5 h-3.5" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                              {folder.name}
                            </span>
                            <span className="block text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                              {count} {count === 1 ? 'tool' : 'tools'}
                            </span>
                          </span>
                        </button>

                        <div className="flex items-center gap-0.5 shrink-0">
                          {toolFolders.length > 1 && (
                            <>
                              <button
                                type="button"
                                disabled={idx === 0}
                                onClick={() => stepFolderOrder(folder.id, -1)}
                                className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-30"
                                title="Map omhoog"
                              >
                                <ArrowLeft className="w-3 h-3 rotate-90" />
                              </button>
                              <button
                                type="button"
                                disabled={idx === toolFolders.length - 1}
                                onClick={() => stepFolderOrder(folder.id, 1)}
                                className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-30"
                                title="Map omlaag"
                              >
                                <ArrowRight className="w-3 h-3 rotate-90" />
                              </button>
                            </>
                          )}
                          <button
                            type="button"
                            onClick={() => openEditFolder(folder)}
                            className="p-1 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                            title="Map bewerken"
                          >
                            <Edit3 className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteFolderTarget(folder)}
                            className="p-1 rounded text-slate-400 hover:text-red-600 dark:hover:text-red-400"
                            title="Map verwijderen"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setSelectedFolderKey('__unassigned__')}
                className={`w-full px-3 py-2 rounded-lg text-xs font-medium flex items-center justify-between transition-colors ${
                  effectiveFolderKey === '__unassigned__'
                    ? 'bg-indigo-50/70 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-400 dark:border-indigo-700'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                }`}
              >
                <span>Zonder map</span>
                <span className="tabular-nums">{unassignedCount}</span>
              </button>
            </div>
          </aside>

          {/* Right Selected Folder Content */}
          <div className="lg:col-span-8 xl:col-span-9 space-y-4">
            <div className="rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className="w-10 h-10 rounded-xl text-white flex items-center justify-center shrink-0"
                  style={{ backgroundColor: activeFolder?.color || '#475569' }}
                >
                  <FolderIcon className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 truncate">
                    {activeFolder ? activeFolder.name : 'Tools zonder map'}
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    {activeFolder
                      ? activeFolder.description?.trim() || `${baseTabTools.length} leertools in deze map`
                      : 'Koppel deze leertools aan een map om ze daar altijd snel terug te vinden.'}
                  </p>
                </div>
              </div>

              {activeFolder && (
                <div className="flex items-center gap-2 shrink-0 flex-wrap">
                  <button
                    type="button"
                    onClick={() => {
                      setExistingSearchQuery('');
                      setAddExistingToFolderOpen(true);
                    }}
                    className="px-3.5 py-2 rounded-lg text-xs font-medium bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-1.5 whitespace-nowrap shrink-0"
                  >
                    <FolderPlus className="w-3.5 h-3.5" />
                    <span>Bestaande tool toevoegen</span>
                  </button>
                </div>
              )}
            </div>

            {renderFilterBar()}
            {renderToolCardsGrid(filteredTools)}
          </div>
        </div>
      )}

      {/* Add / Edit Tool Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs overflow-y-auto">
          <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-6 my-8">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                {editingTool ? 'Leertool bewerken' : 'Nieuwe leertool toevoegen'}
              </h3>
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveTool} className="mt-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Website URL
                </label>
                <input
                  type="text"
                  required
                  value={url}
                  onChange={(e) => handleUrlChange(e.target.value)}
                  placeholder="Plak URL, bijv. https://youtube.com of https://quizlet.com"
                  className="w-full px-3.5 py-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm"
                />
                {detectedPlatform && (
                  <p className="mt-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 shrink-0" />
                    <span>Automatisch herkend: {detectedPlatform}</span>
                  </p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Naam
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => {
                      setName(e.target.value);
                      setNameManuallyEdited(true);
                    }}
                    placeholder="Bijv. YouTube of Khan Academy"
                    className="w-full px-3.5 py-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Vak
                  </label>
                  <input
                    type="text"
                    value={subjectLabel}
                    onChange={(e) => {
                      setSubjectLabel(e.target.value);
                      setSubjectManuallyEdited(true);
                    }}
                    placeholder="Bijv. Wiskunde & Natuurkunde"
                    className="w-full px-3.5 py-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Beschrijving
                </label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => {
                    setDescription(e.target.value);
                    setDescriptionManuallyEdited(true);
                  }}
                  maxLength={240}
                  placeholder="Waar gebruik je deze tool voor? (handig voor zoeken en filteren)"
                  className="w-full px-3.5 py-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Leerjaar
                  </label>
                  <input
                    type="text"
                    list="studyflow-grade-years"
                    value={gradeYear}
                    onChange={(e) => setGradeYear(e.target.value)}
                    placeholder="Bijv. Leerjaar 4"
                    className="w-full px-3.5 py-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm"
                  />
                  <datalist id="studyflow-grade-years">
                    {GRADE_YEAR_PRESETS.map((g) => (
                      <option key={g} value={g} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                    Niveau
                  </label>
                  <input
                    type="text"
                    list="studyflow-levels"
                    value={level}
                    onChange={(e) => setLevel(e.target.value)}
                    placeholder="Bijv. HAVO of VWO"
                    className="w-full px-3.5 py-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm"
                  />
                  <datalist id="studyflow-levels">
                    {LEVEL_PRESETS.map((l) => (
                      <option key={l} value={l} />
                    ))}
                  </datalist>
                </div>
              </div>

              {toolFolders.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    Mappen (optioneel)
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {toolFolders.map((folder) => {
                      const active = selectedToolFolderIds.includes(folder.id);
                      return (
                        <button
                          key={folder.id}
                          type="button"
                          onClick={() =>
                            setSelectedToolFolderIds((prev) =>
                              active
                                ? prev.filter((id) => id !== folder.id)
                                : [...prev, folder.id]
                            )
                          }
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium border flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 ${
                            active
                              ? 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-500 text-indigo-700 dark:text-indigo-300'
                              : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                          }`}
                        >
                          {active && <Check className="w-3 h-3" />}
                          <span>{folder.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Icoon
                </label>
                <div className="grid grid-cols-5 gap-2">
                  {ICON_OPTIONS.map(({ id, label, Icon }) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setIconName(id)}
                      title={label}
                      className={`p-2.5 rounded-lg border flex items-center justify-center ${
                        iconName === id
                          ? 'bg-indigo-50 dark:bg-indigo-950/50 border-indigo-500 text-indigo-600 dark:text-indigo-400'
                          : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Kleur
                </label>
                <div className="flex items-center gap-2.5 flex-wrap">
                  {TOOL_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      className={`w-7 h-7 rounded-full ${
                        color === c ? 'ring-2 ring-offset-2 ring-indigo-500 scale-110' : ''
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-lg text-sm font-medium border border-slate-200 dark:border-slate-700 whitespace-nowrap shrink-0"
                >
                  Annuleren
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-60 whitespace-nowrap shrink-0"
                >
                  {saving ? 'Opslaan...' : 'Opslaan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Folder Create / Edit Modal */}
      {folderModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-6">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                {editingFolder ? 'Map bewerken' : 'Nieuwe map aanmaken'}
              </h3>
              <button
                type="button"
                onClick={() => setFolderModalOpen(false)}
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
                  maxLength={80}
                  value={folderName}
                  onChange={(e) => setFolderName(e.target.value)}
                  placeholder="Bijv. Toetsweek Talen of Wiskunde 4 HAVO"
                  className="w-full px-3.5 py-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Korte beschrijving (optioneel)
                </label>
                <input
                  type="text"
                  maxLength={240}
                  value={folderDesc}
                  onChange={(e) => setFolderDesc(e.target.value)}
                  placeholder="Bijv. Alle oefenwebsites voor het eindexamen"
                  className="w-full px-3.5 py-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Mapkleur
                </label>
                <div className="flex items-center gap-2.5 flex-wrap">
                  {TOOL_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setFolderColor(c)}
                      className={`w-7 h-7 rounded-full ${
                        folderColor === c ? 'ring-2 ring-offset-2 ring-indigo-500 scale-110' : ''
                      }`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setFolderModalOpen(false)}
                  className="px-4 py-2 rounded-lg text-sm font-medium border border-slate-200 dark:border-slate-700 whitespace-nowrap shrink-0"
                >
                  Annuleren
                </button>
                <button
                  type="submit"
                  disabled={folderSaving}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-60 whitespace-nowrap shrink-0"
                >
                  {folderSaving ? 'Opslaan...' : 'Opslaan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Quick Assign Tool to Folders Modal */}
      {assignModalTool && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 truncate">
                  Mappen voor {assignModalTool.name}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Kies in welke mappen je deze leertool wilt terugvinden.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAssignModalTool(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="max-h-60 overflow-y-auto space-y-1.5">
              {toolFolders.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400 py-3">
                  Nog geen mappen aangemaakt. Maak hieronder direct je eerste map aan.
                </p>
              ) : (
                toolFolders.map((folder) => {
                  const checked = assignFolderIds.includes(folder.id);
                  return (
                    <button
                      key={folder.id}
                      type="button"
                      onClick={() =>
                        setAssignFolderIds((prev) =>
                          checked ? prev.filter((id) => id !== folder.id) : [...prev, folder.id]
                        )
                      }
                      className={`w-full px-3 py-2 rounded-lg border text-left flex items-center justify-between gap-2 transition-colors ${
                        checked
                          ? 'bg-indigo-50 dark:bg-indigo-950/50 border-indigo-500 text-indigo-800 dark:text-indigo-200'
                          : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-3 h-3 rounded-xs shrink-0"
                          style={{ backgroundColor: folder.color || '#4F46E5' }}
                        />
                        <span className="text-xs font-medium truncate">{folder.name}</span>
                      </span>
                      {checked && <Check className="w-4 h-4 shrink-0" />}
                    </button>
                  );
                })
              )}
            </div>

            <div className="pt-2 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2">
              <input
                type="text"
                value={quickNewFolderName}
                onChange={(e) => setQuickNewFolderName(e.target.value)}
                placeholder="Snelle nieuwe map..."
                className="flex-1 px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs"
              />
              <button
                type="button"
                disabled={!quickNewFolderName.trim()}
                onClick={handleQuickCreateAndSelectFolder}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                Aanmaken
              </button>
            </div>

            <div className="flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setAssignModalTool(null)}
                className="px-4 py-2 rounded-lg text-sm font-medium border border-slate-200 dark:border-slate-700 whitespace-nowrap shrink-0"
              >
                Annuleren
              </button>
              <button
                type="button"
                disabled={assignSaving}
                onClick={handleSaveAssignFolders}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-60 whitespace-nowrap shrink-0"
              >
                {assignSaving ? 'Opslaan...' : 'Opslaan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Existing Tools to Active Folder Modal */}
      {addExistingToFolderOpen && activeFolder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 truncate">
                Tools koppelen aan "{activeFolder.name}"
              </h3>
              <button
                type="button"
                onClick={() => setAddExistingToFolderOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={existingSearchQuery}
                onChange={(e) => setExistingSearchQuery(e.target.value)}
                placeholder="Zoek bestaande leertools..."
                className="w-full pl-9 pr-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs"
              />
            </div>

            <div className="max-h-72 overflow-y-auto space-y-1.5">
              {tools
                .filter((t) => {
                  const q = existingSearchQuery.trim().toLowerCase();
                  if (!q) return true;
                  return `${t.name} ${t.subjectLabel} ${t.description || ''}`
                    .toLowerCase()
                    .includes(q);
                })
                .map((tool) => {
                  const inFolder =
                    Array.isArray(tool.folderIds) && tool.folderIds.includes(activeFolder.id);
                  return (
                    <button
                      key={tool.id}
                      type="button"
                      onClick={() => handleToggleToolMembershipInActiveFolder(tool)}
                      className={`w-full px-3 py-2 rounded-lg border text-left flex items-center justify-between gap-2 transition-colors ${
                        inFolder
                          ? 'bg-indigo-50 dark:bg-indigo-950/50 border-indigo-500 text-indigo-800 dark:text-indigo-200'
                          : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <span className="min-w-0">
                        <span className="block text-xs font-semibold truncate">{tool.name}</span>
                        <span className="block text-[11px] opacity-75 truncate">
                          {[tool.subjectLabel, tool.gradeYear, tool.level]
                            .filter(Boolean)
                            .join(' · ') || 'Leertool'}
                        </span>
                      </span>
                      {inFolder && <Check className="w-4 h-4 shrink-0" />}
                    </button>
                  );
                })}
            </div>

            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => setAddExistingToFolderOpen(false)}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white whitespace-nowrap shrink-0"
              >
                Klaar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Tool Confirmation */}
      <ConfirmModal
        open={Boolean(deleteTarget)}
        title="Leertool verwijderen?"
        description={`Weet je zeker dat je "${deleteTarget?.name}" wilt verwijderen uit je hub?`}
        busy={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (!deleteTarget) return;
          setDeleting(true);
          try {
            await deleteExternalTool(userId, deleteTarget.id);
            setDeleteTarget(null);
          } finally {
            setDeleting(false);
          }
        }}
      />

      {/* Delete Folder Confirmation */}
      <ConfirmModal
        open={Boolean(deleteFolderTarget)}
        title="Map verwijderen?"
        description={`Weet je zeker dat je de map "${deleteFolderTarget?.name}" wilt verwijderen? De leertools zelf blijven gewoon in "Alle tools" staan.`}
        busy={deleting}
        onCancel={() => setDeleteFolderTarget(null)}
        onConfirm={async () => {
          if (!deleteFolderTarget) return;
          setDeleting(true);
          try {
            await deleteToolFolder(userId, deleteFolderTarget.id, tools);
            if (effectiveFolderKey === deleteFolderTarget.id) {
              setSelectedFolderKey('__first__');
            }
            setDeleteFolderTarget(null);
          } finally {
            setDeleting(false);
          }
        }}
      />
    </div>
  );
};
