import React, { Component, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  BookOpen,
  BrainCircuit,
  Calendar,
  ExternalLink,
  FolderOpen,
  Gamepad2,
  LogOut,
  Menu,
  Sparkles,
  X,
} from 'lucide-react';
import { User } from 'firebase/auth';
import {
  AppSection,
  ExternalTool,
  Folder,
  ScheduleTask,
  SoloGameSession,
  StudyItem,
  StudySet,
  Summary,
  ThemePreference,
  ToolFolder,
} from './types';
import {
  ensureUserProfile,
  logoutUser,
  subscribeAuth,
  updateUserThemePreference,
} from './lib/firebase';
import { apiGet } from './lib/apiClient';
import {
  seedDefaultExternalTools,
  subscribeExternalTools,
  subscribeToolFolders,
  subscribeFolders,
  subscribeItems,
  subscribeScheduleTasks,
  subscribeSoloGameSessions,
  subscribeStudySets,
  subscribeSummaries,
} from './lib/studyStore';
import { AuthScreen } from './components/AuthScreen';
import { JoinMultiplayerView } from './components/JoinMultiplayerView';
import { MultiplayerGameTab } from './components/multiplayer/MultiplayerGameTab';
import { DashboardView } from './components/DashboardView';
import { FilesView } from './components/FilesView';
import { SummariesView } from './components/SummariesView';
import { GamesView } from './components/GamesView';
import { PracticeView } from './components/PracticeView';
import { ToolsHubView } from './components/ToolsHubView';
import { NotebookView } from './components/NotebookView';
import { ThemeSelector } from './components/ThemeSelector';
import { ReminderToastBanner } from './components/ReminderToastBanner';
import { useDesktopReminders } from './hooks/useDesktopReminders';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

class AppErrorBoundary extends Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, message: error.message };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50 dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100">
          <div className="max-w-md w-full rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-6 space-y-4">
            <h2 className="text-lg font-bold">Er is iets misgegaan</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400 break-words">
              {this.state.message}
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
            >
              Pagina vernieuwen
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const NAV_ITEMS: Array<{
  id: AppSection;
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'dashboard', label: 'Dashboard', Icon: Calendar },
  { id: 'files', label: 'Mappen & Bestanden', Icon: FolderOpen },
  { id: 'summaries', label: 'Samenvattingen', Icon: BookOpen },
  { id: 'games', label: 'Spelletjes', Icon: Gamepad2 },
  { id: 'practice', label: 'Oefen vragen', Icon: BrainCircuit },
  { id: 'tools', label: 'Leertools Hub', Icon: ExternalLink },
  { id: 'notebook', label: 'Studie-Notebook', Icon: Sparkles },
];

function detectJoinRoute(): boolean {
  const path = window.location.pathname;
  const hash = window.location.hash;
  const params = new URLSearchParams(window.location.search);
  return (
    path === '/join' ||
    path.endsWith('/join') ||
    path.endsWith('/join/') ||
    hash.startsWith('#/join') ||
    params.get('join') === '1' ||
    Boolean(params.get('code'))
  );
}

function detectMpRoomCode(): string {
  const params = new URLSearchParams(window.location.search);
  const code = (params.get('mpRoom') || '').replace(/\D/g, '').slice(0, 6);
  return code.length === 6 ? code : '';
}

function StudyFlowRoot() {
  // Standalone multiplayer game tab (?mpRoom=123456)
  const [mpRoomCode] = useState<string>(() => detectMpRoomCode());

  // Public /join route detection (works both at root and under GitHub Pages repo subpaths)
  const [isJoinRoute, setIsJoinRoute] = useState<boolean>(() => detectJoinRoute());
  const [initialRoomCode] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('code')) return params.get('code') || '';
    const hashQuery = window.location.hash.split('?')[1];
    if (hashQuery) {
      return new URLSearchParams(hashQuery).get('code') || '';
    }
    return '';
  });
  const [showJoinModal, setShowJoinModal] = useState(false);

  // Theme state (light, dark, or system auto-detection)
  const [themePreference, setThemePreference] = useState<ThemePreference>(() => {
    try {
      const saved = localStorage.getItem('studyflow_theme');
      if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
    } catch {
      // ignore storage errors
    }
    return 'system';
  });

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const applyResolvedTheme = () => {
      const isDark =
        themePreference === 'dark' ||
        (themePreference === 'system' && mediaQuery.matches);
      const root = document.documentElement;
      if (isDark) root.classList.add('dark');
      else root.classList.remove('dark');
    };

    applyResolvedTheme();
    try {
      localStorage.setItem('studyflow_theme', themePreference);
    } catch {
      // ignore storage errors
    }

    if (themePreference === 'system') {
      mediaQuery.addEventListener('change', applyResolvedTheme);
      return () => mediaQuery.removeEventListener('change', applyResolvedTheme);
    }
  }, [themePreference]);

  // Auth state
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    let settled = false;
    const fallbackTimer = window.setTimeout(() => {
      if (!settled) {
        setAuthReady(true);
      }
    }, 3500);

    const unsub = subscribeAuth(
      (u) => {
        settled = true;
        window.clearTimeout(fallbackTimer);
        setUser(u);
        setAuthReady(true);
        if (u && !u.isAnonymous) {
          ensureUserProfile(u)
            .then((profileTheme) => {
              if (profileTheme === 'light' || profileTheme === 'dark' || profileTheme === 'system') {
                setThemePreference(profileTheme);
              }
            })
            .catch(() => {});
        }
      },
      () => {
        settled = true;
        window.clearTimeout(fallbackTimer);
        setAuthReady(true);
      }
    );
    return () => {
      window.clearTimeout(fallbackTimer);
      unsub();
    };
  }, []);

  const handleChangeTheme = (nextTheme: ThemePreference) => {
    setThemePreference(nextTheme);
    if (user && !user.isAnonymous) {
      updateUserThemePreference(user.uid, nextTheme).catch(() => {});
    }
  };

  // Browser popstate / hashchange for /join
  useEffect(() => {
    const onNavChange = () => {
      setIsJoinRoute(detectJoinRoute());
    };
    window.addEventListener('popstate', onNavChange);
    window.addEventListener('hashchange', onNavChange);
    return () => {
      window.removeEventListener('popstate', onNavChange);
      window.removeEventListener('hashchange', onNavChange);
    };
  }, []);

  // App Section & Mobile Sidebar
  const [section, setSection] = useState<AppSection>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(false);

  // User-isolated Firestore data
  const [folders, setFolders] = useState<Folder[]>([]);
  const [items, setItems] = useState<StudyItem[]>([]);
  const [tasks, setTasks] = useState<ScheduleTask[]>([]);
  const [summaries, setSummaries] = useState<Summary[]>([]);
  const [studySets, setStudySets] = useState<StudySet[]>([]);
  const [soloSessions, setSoloSessions] = useState<SoloGameSession[]>([]);
  const [externalTools, setExternalTools] = useState<ExternalTool[]>([]);
  const [toolFolders, setToolFolders] = useState<ToolFolder[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const seededToolsForRef = useRef<string | null>(null);

  useEffect(() => {
    if (!authReady || !user || user.isAnonymous || mpRoomCode) {
      setAiEnabled(false);
      setFolders([]);
      setItems([]);
      setTasks([]);
      setSummaries([]);
      setStudySets([]);
      setSoloSessions([]);
      setExternalTools([]);
      setToolFolders([]);
      setDataLoading(false);
      return;
    }

    let cancelled = false;
    apiGet<{ aiEnabled: boolean }>('/api/me/capabilities', { requireAuth: true })
      .then((res) => {
        if (!cancelled) {
          setAiEnabled(Boolean(res?.aiEnabled));
        }
      })
      .catch(() => {
        if (!cancelled) setAiEnabled(false);
      });

    setDataLoading(true);
    const uid = user.uid;
    let firstLoadPending = 8;
    const markDone = () => {
      firstLoadPending -= 1;
      if (firstLoadPending <= 0) setDataLoading(false);
    };

    const unsubs = [
      subscribeFolders(uid, (d) => {
        setFolders(d);
        markDone();
      }),
      subscribeItems(uid, (d) => {
        setItems(d);
        markDone();
      }),
      subscribeScheduleTasks(uid, (d) => {
        setTasks(d);
        markDone();
      }),
      subscribeSummaries(uid, (d) => {
        setSummaries(d);
        markDone();
      }),
      subscribeStudySets(uid, (d) => {
        setStudySets(d);
        markDone();
      }),
      subscribeSoloGameSessions(uid, (d) => {
        setSoloSessions(d);
        markDone();
      }),
      subscribeExternalTools(uid, (d) => {
        setExternalTools(d);
        markDone();
        if (d.length === 0 && seededToolsForRef.current !== uid) {
          seededToolsForRef.current = uid;
          seedDefaultExternalTools(uid).catch(() => {});
        }
      }),
      subscribeToolFolders(uid, (d) => {
        setToolFolders(d);
        markDone();
      }),
    ];

    return () => {
      cancelled = true;
      unsubs.forEach((u) => u());
    };
  }, [authReady, user, mpRoomCode]);

  useEffect(() => {
    if (!aiEnabled && (section === 'practice' || section === 'notebook')) {
      setSection('dashboard');
    }
  }, [aiEnabled, section]);

  const activeUserId = authReady && user && !user.isAnonymous && !mpRoomCode ? user.uid : null;
  const desktopReminders = useDesktopReminders({
    userId: activeUserId,
    tasks,
    aiEnabled,
    onNavigateSection: (sec) => setSection(sec),
  });

  // Dedicated standalone multiplayer game tab (?mpRoom=XXXXXX)
  if (mpRoomCode) {
    return (
      <MultiplayerGameTab
        roomCode={mpRoomCode}
        themePreference={themePreference}
        onChangeTheme={handleChangeTheme}
      />
    );
  }

  // Public /join route accessible without login
  if (isJoinRoute) {
    return (
      <JoinMultiplayerView
        initialRoomCode={initialRoomCode}
        isModal={false}
        onClose={() => {
          const cleanPath = window.location.pathname.replace(/\/join\/?$/, '') || '/';
          window.history.pushState({}, '', cleanPath);
          setIsJoinRoute(false);
        }}
      />
    );
  }

  if (!authReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#0B0F17] text-slate-600 dark:text-slate-400 text-sm">
        StudyFlow laden...
      </div>
    );
  }

  // Strict route protection: private pages require non-anonymous authenticated user
  if (!user || user.isAnonymous) {
    return (
      <>
        <AuthScreen
          themePreference={themePreference}
          onChangeTheme={handleChangeTheme}
          onOpenJoinGuest={() => setShowJoinModal(true)}
        />
        {showJoinModal && (
          <JoinMultiplayerView
            initialRoomCode={initialRoomCode}
            isModal={true}
            onClose={() => setShowJoinModal(false)}
          />
        )}
      </>
    );
  }

  const displayName = user.displayName || user.email?.split('@')[0] || 'Leerling';
  const visibleNavItems = aiEnabled
    ? NAV_ITEMS
    : NAV_ITEMS.filter((item) => item.id !== 'practice' && item.id !== 'notebook');
  const activeNav = visibleNavItems.find((n) => n.id === section) || visibleNavItems[0];

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex w-64 shrink-0 flex-col border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F141F]">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-sm shrink-0">
            SF
          </div>
          <span className="text-lg font-bold tracking-tight">StudyFlow</span>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {visibleNavItems.map(({ id, label, Icon }) => {
            const active = section === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setSection(id)}
                className={`w-full px-3 py-2.5 rounded-lg text-sm font-medium flex items-center gap-3 transition-colors whitespace-nowrap ${
                  active
                    ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 hover:text-slate-900 dark:hover:text-slate-100'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-3 border-t border-slate-200 dark:border-slate-800 space-y-2">
          <div className="px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-900/70">
            <p className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
              {displayName}
            </p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
              {user.email}
            </p>
          </div>
          <button
            type="button"
            onClick={() => logoutUser()}
            className="w-full px-3 py-2 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-red-600 dark:hover:text-red-400 flex items-center gap-2 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            <span>Uitloggen</span>
          </button>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-950/50"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative w-64 max-w-[80vw] bg-white dark:bg-[#0F141F] border-r border-slate-200 dark:border-slate-800 flex flex-col z-10">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-xs">
                  SF
                </div>
                <span className="text-base font-bold">StudyFlow</span>
              </div>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 rounded-lg text-slate-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <nav className="flex-1 p-3 space-y-1">
              {visibleNavItems.map(({ id, label, Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    setSection(id);
                    setMobileMenuOpen(false);
                  }}
                  className={`w-full px-3 py-2.5 rounded-lg text-sm font-medium flex items-center gap-3 ${
                    section === id
                      ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300'
                      : 'text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{label}</span>
                </button>
              ))}
            </nav>
            <div className="p-3 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => logoutUser()}
                className="w-full px-3 py-2 rounded-lg text-xs font-medium text-red-600 dark:text-red-400 flex items-center gap-2"
              >
                <LogOut className="w-4 h-4" />
                <span>Uitloggen</span>
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content Shell */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 h-14 px-4 sm:px-8 border-b border-slate-200 dark:border-slate-800 bg-white/85 dark:bg-[#0B0F17]/85 backdrop-blur-sm flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 -ml-2 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Menu openen"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 truncate">
              <span className="hidden sm:inline">StudyFlow</span>
              <span className="hidden sm:inline" aria-hidden="true">/</span>
              <span className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                {activeNav?.label}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => setShowJoinModal(true)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
            >
              Spel joinen
            </button>
            <ThemeSelector
              value={themePreference}
              onChange={handleChangeTheme}
              compact
            />
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-8 max-w-6xl w-full mx-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={section}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            >
              {section === 'dashboard' && (
                <DashboardView
                  userId={user.uid}
                  userName={displayName}
                  tasks={tasks}
                  loading={dataLoading}
                  aiEnabled={aiEnabled}
                  desktopReminders={desktopReminders}
                  onNavigateSection={(sec) => setSection(sec)}
                />
              )}
              {section === 'files' && (
                <FilesView
                  userId={user.uid}
                  folders={folders}
                  items={items}
                  loading={dataLoading}
                />
              )}
              {section === 'summaries' && (
                <SummariesView
                  userId={user.uid}
                  summaries={summaries}
                  items={items}
                  loading={dataLoading}
                  aiEnabled={aiEnabled}
                />
              )}
              {section === 'games' && (
                <GamesView
                  userId={user.uid}
                  userName={displayName}
                  folders={folders}
                  items={items}
                  studySets={studySets}
                  soloSessions={soloSessions}
                  loading={dataLoading}
                  aiEnabled={aiEnabled}
                  onOpenJoinModal={() => setShowJoinModal(true)}
                />
              )}
              {section === 'practice' && aiEnabled && (
                <PracticeView
                  userId={user.uid}
                  userName={displayName}
                  folders={folders}
                  items={items}
                  loading={dataLoading}
                />
              )}
              {section === 'tools' && (
                <ToolsHubView
                  userId={user.uid}
                  tools={externalTools}
                  toolFolders={toolFolders}
                  loading={dataLoading}
                />
              )}
              {section === 'notebook' && aiEnabled && <NotebookView items={items} />}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>

      {showJoinModal && (
        <JoinMultiplayerView
          initialRoomCode={initialRoomCode}
          isModal={true}
          onClose={() => setShowJoinModal(false)}
        />
      )}

      <ReminderToastBanner
        toasts={desktopReminders.activeToasts}
        snoozeMinutes={desktopReminders.settings.snoozeMinutes}
        actionLabel={aiEnabled ? 'Naar Oefen vragen' : 'Naar Spelletjes'}
        onAction={(toast) => {
          desktopReminders.dismissToast(toast.id);
          setSection(aiEnabled ? 'practice' : 'games');
        }}
        onSnooze={desktopReminders.snoozeToast}
        onDismiss={desktopReminders.dismissToast}
      />
    </div>
  );
}

export default function App() {
  return (
    <AppErrorBoundary>
      <StudyFlowRoot />
    </AppErrorBoundary>
  );
}
