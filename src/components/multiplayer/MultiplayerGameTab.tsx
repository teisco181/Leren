import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  ChevronDown,
  Clock,
  Gamepad2,
  Loader2,
  Play,
  Power,
  ShieldCheck,
  Sparkles,
  Trophy,
  User,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  MpChallengeItem,
  MpRoomSnapshot,
  ThemePreference,
} from '../../types';
import { apiGet, apiPost, getAuthToken } from '../../lib/apiClient';
import {
  auth,
  formatAuthErrorDutch,
  signInGuestAnonymously,
  subscribeAuth,
} from '../../lib/firebase';
import { playGameSound } from '../../lib/gameAudio';
import { ThemeSelector } from '../ThemeSelector';
import { ConfirmModal } from '../ConfirmModal';
import { MP_AVATARS, MP_GAME_CATALOG } from './mpCatalog';
import { MpGameWorlds } from './games/MpGameWorlds';

interface MultiplayerGameTabProps {
  roomCode: string;
  themePreference: ThemePreference;
  onChangeTheme: (t: ThemePreference) => void;
}

interface RoomInfoResponse {
  roomCode: string;
  gameId: string;
  title: string;
  hostName: string;
  status: string;
  playerCount: number;
  maxPlayers: number;
  sourceTitles?: string[];
  error?: string;
}

function formatCountdown(expiresAt: number | null, nowMs: number): string {
  if (!expiresAt) return '05:00';
  const diffSec = Math.max(0, Math.floor((expiresAt - nowMs) / 1000));
  const mins = Math.floor(diffSec / 60);
  const secs = diffSec % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export const MultiplayerGameTab: React.FC<MultiplayerGameTabProps> = ({
  roomCode,
  themePreference,
  onChangeTheme,
}) => {
  const cleanCode = roomCode.replace(/\D/g, '').slice(0, 6);
  const homeUrl = window.location.pathname || '/';

  const [authReady, setAuthReady] = useState(false);
  const [uid, setUid] = useState<string | null>(null);
  const tokenRef = useRef<string>('');

  const [loading, setLoading] = useState(true);
  const [terminatedMessage, setTerminatedMessage] = useState<string | null>(null);
  const [needsJoin, setNeedsJoin] = useState(false);
  const [roomInfo, setRoomInfo] = useState<RoomInfoResponse | null>(null);

  // Guest / participant join form when not yet joined
  const [nickname, setNickname] = useState('');
  const [avatar, setAvatar] = useState(MP_AVATARS[0]);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  // Live room state
  const [snapshot, setSnapshot] = useState<MpRoomSnapshot | null>(null);
  const [challenges, setChallenges] = useState<MpChallengeItem[]>([]);
  const [answeredIds, setAnsweredIds] = useState<string[]>([]);
  const [busyAction, setBusyAction] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // UI controls
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [showSources, setShowSources] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [confirmEndOpen, setConfirmEndOpen] = useState(false);
  const [endingRoom, setEndingRoom] = useState(false);
  const [startingRoom, setStartingRoom] = useState(false);

  // Wait for Firebase auth
  useEffect(() => {
    const unsub = subscribeAuth(
      (user) => {
        setUid(user?.uid || null);
        if (user?.displayName && !nickname) {
          setNickname(user.displayName);
        }
        setAuthReady(true);
        if (user) {
          user.getIdToken().then((t) => {
            tokenRef.current = t;
          }).catch(() => {});
        } else {
          tokenRef.current = '';
        }
      },
      () => setAuthReady(true)
    );
    return () => unsub();
  }, [nickname]);

  // Periodically refresh tokenRef for reliable sendBeacon on tab close
  useEffect(() => {
    if (!uid) return;
    const refresh = () => {
      getAuthToken()
        .then((t) => {
          if (t) tokenRef.current = t;
        })
        .catch(() => {});
    };
    refresh();
    const id = window.setInterval(refresh, 45000);
    return () => window.clearInterval(id);
  }, [uid]);

  // Initial room check + state load
  const loadRoomState = useCallback(async () => {
    if (!cleanCode || cleanCode.length !== 6) {
      setTerminatedMessage('Ongeldige 6-cijferige spelcode.');
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const infoRes = await fetch(`/api/mp/rooms/${cleanCode}/info`);
      const infoData = (await infoRes.json()) as RoomInfoResponse;
      if (!infoRes.ok || infoData.error) {
        setTerminatedMessage(infoData.error || 'Deze spelkamer bestaat niet of is afgelopen.');
        setLoading(false);
        return;
      }
      setRoomInfo(infoData);

      if (!auth.currentUser) {
        setNeedsJoin(true);
        setLoading(false);
        return;
      }

      try {
        const state = await apiGet<{
          snapshot: MpRoomSnapshot;
          challenges: MpChallengeItem[];
          answeredIds: string[];
        }>(`/api/mp/rooms/${cleanCode}/state`);
        setSnapshot(state.snapshot);
        setChallenges(state.challenges);
        setAnsweredIds(state.answeredIds);
        setNeedsJoin(false);
      } catch {
        // User signed in but not yet registered as a player in this room
        setNeedsJoin(true);
      }
    } catch {
      setTerminatedMessage('Kon de spelkamer niet bereiken. Probeer het later opnieuw.');
    } finally {
      setLoading(false);
    }
  }, [cleanCode]);

  useEffect(() => {
    if (!authReady) return;
    loadRoomState();
  }, [authReady, loadRoomState]);

  // WebSocket + Heartbeat + Beacon when inside room
  useEffect(() => {
    if (!snapshot || terminatedMessage || needsJoin) return;

    let cancelled = false;
    let ws: WebSocket | null = null;
    let wsHbId: number | null = null;
    let fallbackHbId: number | null = null;

    const connectWs = async () => {
      try {
        const token = await getAuthToken();
        if (token) tokenRef.current = token;
        if (cancelled || !token) return;

        const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const url = `${proto}//${window.location.host}/ws?code=${cleanCode}&token=${encodeURIComponent(
          token
        )}&mode=game`;
        ws = new WebSocket(url);

        ws.onmessage = (ev) => {
          try {
            const msg = JSON.parse(String(ev.data)) as {
              type: string;
              payload: unknown;
            };
            if (msg.type === 'room_snapshot') {
              setSnapshot(msg.payload as MpRoomSnapshot);
            } else if (msg.type === 'room_terminated') {
              const p = msg.payload as { message?: string };
              setTerminatedMessage(
                p.message || 'Deze spelkamer is beëindigd door de spelleider.'
              );
              setSnapshot(null);
            }
          } catch {
            // ignore
          }
        };

        wsHbId = window.setInterval(() => {
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'heartbeat' }));
          }
        }, 4000);
      } catch {
        // ignore ws setup failures
      }
    };

    connectWs();

    fallbackHbId = window.setInterval(() => {
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        apiPost(`/api/mp/rooms/${cleanCode}/heartbeat`, { mode: 'game' }).catch(() => {});
      }
    }, 10000);

    const sendLeaveBeacon = () => {
      if (!tokenRef.current) return;
      try {
        navigator.sendBeacon(
          `/api/mp/rooms/${cleanCode}/leave-beacon`,
          JSON.stringify({ token: tokenRef.current })
        );
      } catch {
        // ignore
      }
    };

    window.addEventListener('pagehide', sendLeaveBeacon);
    window.addEventListener('beforeunload', sendLeaveBeacon);

    return () => {
      cancelled = true;
      window.removeEventListener('pagehide', sendLeaveBeacon);
      window.removeEventListener('beforeunload', sendLeaveBeacon);
      if (wsHbId !== null) window.clearInterval(wsHbId);
      if (fallbackHbId !== null) window.clearInterval(fallbackHbId);
      if (ws) {
        try {
          ws.close();
        } catch {
          // ignore
        }
      }
    };
  }, [cleanCode, Boolean(snapshot), terminatedMessage, needsJoin]);

  // 1s ticker when status is waiting
  useEffect(() => {
    if (snapshot?.status !== 'waiting') return;
    const id = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [snapshot?.status]);

  const handleJoinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setJoinError(null);
    if (!nickname.trim()) {
      setJoinError('Vul eerst een bijnaam in.');
      return;
    }
    setJoining(true);
    try {
      const user = auth.currentUser || (await signInGuestAnonymously());
      setUid(user.uid);
      const token = await user.getIdToken();
      tokenRef.current = token;

      const joined = await apiPost<{
        snapshot: MpRoomSnapshot;
        challenges: MpChallengeItem[];
        answeredIds: string[];
      }>(`/api/mp/rooms/${cleanCode}/join`, {
        nickname: nickname.trim(),
        avatar,
      });

      setSnapshot(joined.snapshot);
      setChallenges(joined.challenges);
      setAnsweredIds(joined.answeredIds);
      setNeedsJoin(false);
    } catch (err) {
      setJoinError(formatAuthErrorDutch(err));
    } finally {
      setJoining(false);
    }
  };

  const myPlayer = useMemo(() => {
    if (!snapshot || !uid) return null;
    return snapshot.players.find((p) => p.uid === uid) || null;
  }, [snapshot, uid]);

  const gameMeta = useMemo(
    () => MP_GAME_CATALOG.find((g) => g.id === snapshot?.gameId) || null,
    [snapshot?.gameId]
  );

  const handleAnswerChallenge = async (
    challengeId: string,
    optionIndex: number,
    extra?: Record<string, unknown>
  ) => {
    setBusyAction(true);
    setActionError(null);
    try {
      const res = await apiPost<{
        snapshot: MpRoomSnapshot;
        result?: {
          correct: boolean;
          explanation: string;
          correctOption: string;
          sourceTitle: string;
          sourceSection: string;
          answeredIds?: string[];
        };
      }>(`/api/mp/rooms/${cleanCode}/action`, {
        type: 'answer_challenge',
        payload: { challengeId, optionIndex, ...(extra || {}) },
      });

      setSnapshot(res.snapshot);
      if (res.result?.answeredIds) {
        setAnsweredIds(res.result.answeredIds);
      }
      if (res.result) {
        playGameSound(res.result.correct ? 'correct' : 'wrong', soundEnabled);
        return {
          correct: res.result.correct,
          explanation: res.result.explanation,
          correctOption: res.result.correctOption,
          sourceTitle: res.result.sourceTitle,
          sourceSection: res.result.sourceSection,
        };
      }
      return null;
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Kon antwoord niet verwerken.');
      return null;
    } finally {
      setBusyAction(false);
    }
  };

  const handleWorldAction = async (type: string, payload?: Record<string, unknown>) => {
    setBusyAction(true);
    setActionError(null);
    try {
      const res = await apiPost<{ snapshot: MpRoomSnapshot }>(
        `/api/mp/rooms/${cleanCode}/action`,
        { type, payload }
      );
      setSnapshot(res.snapshot);
      playGameSound('click', soundEnabled);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Actie mislukt.');
    } finally {
      setBusyAction(false);
    }
  };

  const handleStartRoom = async () => {
    setStartingRoom(true);
    setActionError(null);
    try {
      const res = await apiPost<{ snapshot: MpRoomSnapshot }>(
        `/api/mp/rooms/${cleanCode}/start`
      );
      setSnapshot(res.snapshot);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Kon spel niet starten.');
    } finally {
      setStartingRoom(false);
    }
  };

  const handleEndRoom = async () => {
    setEndingRoom(true);
    try {
      await apiPost(`/api/mp/rooms/${cleanCode}/end`);
      setTerminatedMessage('Je hebt dit spel definitief beëindigd voor alle spelers.');
      setSnapshot(null);
      setConfirmEndOpen(false);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'Kon spel niet beëindigen.');
      setConfirmEndOpen(false);
    } finally {
      setEndingRoom(false);
    }
  };

  if (loading || !authReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#0B0F17] text-slate-600 dark:text-slate-400">
        <div className="flex items-center gap-2 text-sm">
          <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
          <span>Spelkamer #{cleanCode} laden...</span>
        </div>
      </div>
    );
  }

  if (terminatedMessage) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50 dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100">
        <div className="max-w-md w-full rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-7 text-center space-y-4">
          <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto" />
          <h1 className="text-lg font-bold">Spelkamer niet actief</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
            {terminatedMessage}
          </p>
          <a
            href={homeUrl}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Terug naar StudyFlow</span>
          </a>
        </div>
      </div>
    );
  }

  if (needsJoin || !snapshot || !myPlayer) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50 dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100">
        <div className="max-w-md w-full rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-7 space-y-5">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
                <Gamepad2 className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-lg font-bold">Deelnemen aan #{cleanCode}</h1>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {roomInfo?.title || 'Multiplayer Spelkamer'} · Spelleider: {roomInfo?.hostName}
                </p>
              </div>
            </div>
            <ThemeSelector value={themePreference} onChange={onChangeTheme} compact />
          </div>

          {roomInfo?.sourceTitles && roomInfo.sourceTitles.length > 0 && (
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1.5">
              <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                <span>Geselecteerde leerstof van deze kamer:</span>
              </p>
              <div className="flex flex-wrap gap-1">
                {roomInfo.sourceTitles.map((st) => (
                  <span
                    key={st}
                    className="px-2 py-0.5 rounded bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 text-[11px]"
                  >
                    {st}
                  </span>
                ))}
              </div>
            </div>
          )}

          {joinError && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300">
              {joinError}
            </div>
          )}

          <form onSubmit={handleJoinSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Jouw bijnaam
              </label>
              <div className="relative">
                <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  maxLength={24}
                  required
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="Bijv. SlimmeVos"
                  className="w-full pl-9 pr-4 py-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
                Kies een avatar
              </label>
              <div className="grid grid-cols-4 gap-2">
                {MP_AVATARS.map((av) => (
                  <button
                    key={av}
                    type="button"
                    onClick={() => setAvatar(av)}
                    className={`py-2.5 rounded-lg border text-xl transition-colors ${
                      avatar === av
                        ? 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-500'
                        : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800'
                    }`}
                  >
                    {av}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={joining}
              className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold disabled:opacity-60"
            >
              {joining ? 'Deelnemen...' : 'Spel binnengaan'}
            </button>
          </form>

          <div className="pt-2 text-center">
            <a
              href={homeUrl}
              className="text-xs text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400"
            >
              Terug naar StudyFlow
            </a>
          </div>
        </div>
      </div>
    );
  }

  const isHost = uid === snapshot.hostId;
  const statusLabel =
    snapshot.status === 'lobby'
      ? 'Lobby · wacht op spelleider'
      : snapshot.status === 'waiting'
        ? `Wacht op spelers (${formatCountdown(snapshot.waitingExpiresAt, nowMs)})`
        : 'Actief · Eigen tempo';

  const statusTone =
    snapshot.status === 'waiting'
      ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300'
      : snapshot.status === 'active'
        ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300'
        : 'bg-indigo-100 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-300';

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100 flex flex-col">
      {/* Top Game Header */}
      <header className="sticky top-0 z-30 border-b border-slate-200 dark:border-slate-800 bg-white/90 dark:bg-[#0F141F]/90 backdrop-blur-sm px-4 sm:px-6 py-3">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold text-sm shrink-0">
              {myPlayer.avatar}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-base font-bold truncate">
                  {snapshot.title || gameMeta?.title}
                </h1>
                <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                  #{snapshot.roomCode}
                </span>
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${statusTone}`}>
                  {statusLabel}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {gameMeta?.genre} · {snapshot.sourceSummary.subject} · Jij: {myPlayer.nickname} (Cijfer {myPlayer.grade})
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Sources Popover Toggle */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowSources((s) => !s)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-xs font-medium inline-flex items-center gap-1.5"
              >
                <BookOpen className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                <span>Bronnen ({snapshot.sourceSummary.fileTitles.length})</span>
                <ChevronDown className="w-3.5 h-3.5" />
              </button>

              {showSources && (
                <div className="absolute right-0 mt-2 w-80 max-w-[90vw] rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 shadow-xl p-4 space-y-3 z-40">
                  <p className="text-xs font-bold text-slate-900 dark:text-slate-100">
                    Vergrendelde lesstof van deze kamer
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {snapshot.sourceSummary.fileTitles.map((ft) => (
                      <span
                        key={ft}
                        className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[11px] font-medium"
                      >
                        {ft}
                      </span>
                    ))}
                  </div>
                  {snapshot.sourceSummary.topics.length > 0 && (
                    <div className="space-y-1 max-h-44 overflow-y-auto pt-2 border-t border-slate-200 dark:border-slate-800">
                      <p className="text-[11px] font-semibold text-slate-500">
                        Onderwerpen:
                      </p>
                      {snapshot.sourceSummary.topics.map((t, i) => (
                        <p key={`${t.name}-${i}`} className="text-[11px] text-slate-600 dark:text-slate-300">
                          • <strong>{t.name}</strong> ({t.sourceTitle} · {t.sourceSection})
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setSoundEnabled((s) => !s)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium inline-flex items-center gap-1.5"
            >
              {soundEnabled ? (
                <Volume2 className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
              ) : (
                <VolumeX className="w-3.5 h-3.5 text-slate-400" />
              )}
              <span className="hidden sm:inline">{soundEnabled ? 'Geluid' : 'Gedempt'}</span>
            </button>

            <ThemeSelector value={themePreference} onChange={onChangeTheme} compact />

            {isHost && (
              <button
                type="button"
                onClick={() => setConfirmEndOpen(true)}
                className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold inline-flex items-center gap-1.5"
              >
                <Power className="w-3.5 h-3.5" />
                <span>Beëindig het spel</span>
              </button>
            )}

            <a
              href={homeUrl}
              className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Terug naar StudyFlow
            </a>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 space-y-5">
        {actionError && (
          <div className="p-3 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300">
            {actionError}
          </div>
        )}

        {snapshot.status === 'lobby' && (
          <div className="rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-300 dark:border-indigo-700 p-5 flex flex-wrap items-center justify-between gap-4">
            <div className="space-y-1">
              <h2 className="text-base font-bold text-indigo-950 dark:text-indigo-100 flex items-center gap-2">
                <Clock className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <span>Wachten tot de spelleider ({snapshot.hostName}) het spel start</span>
              </h2>
              <p className="text-xs text-indigo-800 dark:text-indigo-300">
                Zodra het spel start kun je alle opdrachten uit de geselecteerde leerstof in je eigen tempo oplossen.
              </p>
            </div>
            {isHost && (
              <button
                type="button"
                disabled={startingRoom}
                onClick={handleStartRoom}
                className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center gap-2 disabled:opacity-60"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>{startingRoom ? 'Starten...' : 'Spel starten voor iedereen'}</span>
              </button>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left 8 cols: Interactive Game World */}
          <div className="lg:col-span-8">
            {snapshot.status === 'lobby' ? (
              <div className="rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-8 text-center space-y-3">
                <Sparkles className="w-8 h-8 text-indigo-500 mx-auto" />
                <h3 className="text-lg font-bold">De spelwereld staat klaar!</h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 max-w-md mx-auto leading-relaxed">
                  Zodra {snapshot.hostName} op <strong>Spel starten</strong> drukt verschijnen de interactieve opdrachten en speelborden van {gameMeta?.title}.
                </p>
              </div>
            ) : (
              <MpGameWorlds
                snapshot={snapshot}
                myPlayer={myPlayer}
                challenges={challenges}
                answeredIds={answeredIds}
                busyAction={busyAction}
                onAnswerChallenge={handleAnswerChallenge}
                onAction={handleWorldAction}
              />
            )}
          </div>

          {/* Right 4 cols: Live Team Standings & Activity Feed */}
          <aside className="lg:col-span-4 space-y-5">
            {/* Team Standings */}
            <div className="rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-amber-500" />
                  <span>Live Stand &amp; Team ({snapshot.players.length}/{snapshot.maxPlayers})</span>
                </h3>
              </div>

              <div className="space-y-2.5">
                {snapshot.players.map((p, idx) => {
                  const isMe = p.uid === uid;
                  return (
                    <div
                      key={p.uid}
                      className={`p-3 rounded-xl border space-y-2 ${
                        isMe
                          ? 'bg-indigo-50/70 dark:bg-indigo-950/30 border-indigo-300 dark:border-indigo-700'
                          : 'bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-800'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="font-mono text-[11px] text-slate-400 w-4">
                            #{idx + 1}
                          </span>
                          <span
                            className={`w-2 h-2 rounded-full shrink-0 ${
                              p.online ? 'bg-emerald-500' : 'bg-slate-400'
                            }`}
                            title={p.online ? 'Online' : 'Offline'}
                          />
                          <span className="text-base">{p.avatar}</span>
                          <span className="font-semibold truncate">
                            {p.nickname} {isMe ? '(jij)' : ''}
                          </span>
                        </div>
                        <div className="text-right shrink-0 tabular-nums">
                          <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
                            {p.score} ptn
                          </span>
                          <span className="ml-2 text-[11px] text-slate-500">
                            Cijfer {p.grade}
                          </span>
                        </div>
                      </div>

                      <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                        <div
                          className="h-full bg-indigo-600 transition-all duration-300"
                          style={{ width: `${Math.min(100, Math.max(0, p.progressPct))}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Activity & Tips Feed */}
            <div className="rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5 space-y-3">
              <h3 className="text-sm font-bold flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <span>Team Activiteiten &amp; Tips</span>
              </h3>
              <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                {snapshot.feed.length === 0 ? (
                  <p className="text-xs text-slate-500">Nog geen activiteiten.</p>
                ) : (
                  snapshot.feed.map((item) => (
                    <div
                      key={item.id}
                      className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs flex items-start gap-2"
                    >
                      <span className="text-base leading-none shrink-0">{item.avatar}</span>
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 dark:text-slate-100">
                          {item.nickname}
                        </p>
                        <p className="text-slate-600 dark:text-slate-300 break-words leading-relaxed">
                          {item.text}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </aside>
        </div>
      </main>

      <ConfirmModal
        open={confirmEndOpen}
        title="Spel definitief beëindigen?"
        description="Alle spelers worden uit deze kamer gehaald en de spelkamer wordt gesloten. Weet je het zeker?"
        confirmLabel="Beëindig het spel"
        busy={endingRoom}
        onCancel={() => setConfirmEndOpen(false)}
        onConfirm={handleEndRoom}
      />
    </div>
  );
};
