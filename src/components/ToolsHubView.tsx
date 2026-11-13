import React, { useState } from 'react';
import {
  BookOpen,
  Calculator,
  Compass,
  Edit3,
  ExternalLink,
  Gamepad2,
  Globe,
  Layers,
  Plus,
  Sparkles,
  Trash2,
  Tv,
  X,
  Youtube,
  Zap,
} from 'lucide-react';
import { ExternalTool } from '../types';
import {
  createExternalTool,
  deleteExternalTool,
  updateExternalTool,
} from '../lib/studyStore';
import { detectExternalToolFromUrl } from '../lib/toolDetector';
import { ConfirmModal } from './ConfirmModal';
import { ListSkeleton } from './Skeletons';

interface ToolsHubViewProps {
  userId: string;
  tools: ExternalTool[];
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
  loading,
}) => {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTool, setEditingTool] = useState<ExternalTool | null>(null);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [subjectLabel, setSubjectLabel] = useState('');
  const [color, setColor] = useState(TOOL_COLORS[0]);
  const [iconName, setIconName] = useState('Globe');
  const [nameManuallyEdited, setNameManuallyEdited] = useState(false);
  const [subjectManuallyEdited, setSubjectManuallyEdited] = useState(false);
  const [detectedPlatform, setDetectedPlatform] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<ExternalTool | null>(null);
  const [deleting, setDeleting] = useState(false);

  const openAdd = () => {
    setEditingTool(null);
    setName('');
    setUrl('');
    setSubjectLabel('');
    setColor('#4F46E5');
    setIconName('Globe');
    setNameManuallyEdited(false);
    setSubjectManuallyEdited(false);
    setDetectedPlatform(null);
    setModalOpen(true);
  };

  const openEdit = (tool: ExternalTool) => {
    setEditingTool(tool);
    setName(tool.name);
    setUrl(tool.url);
    setSubjectLabel(tool.subjectLabel);
    setColor(tool.color || TOOL_COLORS[0]);
    setIconName(tool.iconName || 'Globe');
    setNameManuallyEdited(true);
    setSubjectManuallyEdited(Boolean(tool.subjectLabel));
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
    } else {
      setDetectedPlatform(null);
      if (!nameManuallyEdited && detected.platformName) {
        setName(detected.platformName);
      }
    }
  };

  const handleSave = async (e: React.FormEvent) => {
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
          color,
          iconName,
        });
      } else {
        await createExternalTool(userId, {
          name,
          url: normalizedUrl,
          subjectLabel,
          color,
          iconName,
        });
      }
      setModalOpen(false);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <ListSkeleton rows={4} />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50">
            Externe Leertools Hub
          </h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
            Plak een website-URL en StudyFlow herkent automatisch het platform, logo en kleur.
          </p>
        </div>

        <button
          type="button"
          onClick={openAdd}
          className="px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-2 whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Link toevoegen</span>
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {tools.map((tool) => (
          <div
            key={tool.id}
            className="rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5 flex flex-col justify-between gap-4 hover:border-indigo-400 dark:hover:border-indigo-500 transition-colors"
          >
            <div className="flex items-start justify-between gap-3">
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
                    {tool.subjectLabel || 'Leertool'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => openEdit(tool)}
                  className="p-1.5 rounded-md text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                  title="Bewerken"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteTarget(tool)}
                  className="p-1.5 rounded-md text-slate-400 hover:text-red-600 dark:hover:text-red-400"
                  title="Verwijderen"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <a
              href={tool.url}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full py-2 px-3 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center justify-between gap-2"
            >
              <span className="truncate">{tool.url.replace(/^https?:\/\//, '')}</span>
              <ExternalLink className="w-3.5 h-3.5 shrink-0" />
            </a>
          </div>
        ))}
      </div>

      {/* Add / Edit Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-6">
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

            <form onSubmit={handleSave} className="mt-5 space-y-4">
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
                  Vak-label
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
                  className="px-4 py-2 rounded-lg text-sm font-medium border border-slate-200 dark:border-slate-700"
                >
                  Annuleren
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-60"
                >
                  {saving ? 'Opslaan...' : 'Opslaan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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
    </div>
  );
};
