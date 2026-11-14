import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BookOpen,
  Check,
  Clock,
  Copy,
  ExternalLink,
  Gamepad2,
  Hash,
  Layers,
  Loader2,
  Play,
  Plus,
  Power,
  ShieldCheck,
  Sparkles,
  Users,
  X,
} from 'lucide-react';
import {
  AnalyzedMaterial,
  Folder,
  MpMyRoomSummary,
  MpRoomSnapshot,
  StudyItem,
} from '../../types';
import { apiGet, apiPost, getAuthToken } from '../../lib/apiClient';
import { MaterialSelector } from '../MaterialSelector';
import { ConfirmModal } from '../ConfirmModal';
import { MP_AVATARS, MP_GAME_CATALOG, MpGameCatalogItem } from './mpCatalog';

interface MultiplayerHubProps {
  userId: string;
  userName: string;
  folders: Folder[];
  items: StudyItem[];
  onOpenJoinModal: () => void;
}

function formatCountdown(expiresAt: number | null, nowMs: number): string {
  if (!expiresAt) return '05:00';
  const diffSec = Math.max(0, Math.floor((expiresAt - nowMs) / 1000));
  const mins = Math.floor(diffSec / 60);
  const secs = diffSec % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export const MultiplayerHub: React.FC<MultiplayerHubProps> = ({
  userId,
  userName,
  folders,
  items,
  onOpenJoinModal,
}) => {
  const [myRooms, setMyRooms] = useState<MpMyRoomSummary[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(true);
  const [nowMs, setNowMs] = useState(() => Date.now());

  // Create room flow
  const [selectedGame, setSelectedGame] = useState<MpGameCatalogItem | null>(null);
  const [roomTitle, setRoomTitle] = useState('');
  const [difficulty, setDifficulty] = useState<'easy' | 'normal' | 'hard'>('normal');
  const [maxPlayers, setMaxPlayers] = useState(6);
  const [durationMinutes, setDurationMinutes] = useState(20);
  const [hostAvatar, setHostAvatar] = useState(MP_AVATARS[0]);
  const [analyzedMaterial, setAnalyzedMaterial] = useState<AnalyzedMaterial | null>(null);
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Active host lobby view
  const [lobbyRoomCode, setLobbyRoomCode] = useState<string | null>(null);
  const [lobbySnapshot, setLobbySnapshot] = useState<MpRoomSnapshot | null>(null);
  const [lobbyError, setLobbyError] = useState<string | null>(null);
  const [startingRoom, setStartingRoom] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  // End room confirmation modal
  const [endTargetCode, setEndTargetCode] = useState<string | null>(null);
  const [endingRoom, setEndingRoom] = useState(false);

  const fetchMyRooms = useCallback(async () => {
    try {
      const data = await apiGet<{ rooms: MpMyRoomSummary[] }>('/api/mp/my-rooms');
      setMyRooms(Array.isArray(data.rooms) ? data.rooms : []);
    } catch {
      // Ignore background fetch hiccups
    } finally {
      setRoomsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMyRooms();
    const pollId = window.setInterval(fetchMyRooms, 6000);
    return () => window.clearInterval(pollId);
  }, [fetchMyRooms]);

  // 1s UI ticker for waiting-countdown
  useEffect(() => {
    const hasWaiting = myRooms.some((r) => r.status === 'waiting') || lobbySnapshot?.status === 'waiting';
    if (!hasWaiting) return;
    const tId = window.setInterval(() => setNowMs(Date.now()), 1000);
    return () => window.clearInterval(tId);
  }, [myRooms, lobbySnapshot?.status]);

  // Host lobby WebSocket + initial sync
  useEffect(() => {
    if (!lobbyRoomCode) {
      setLobbySnapshot(null);
      return;
    }

    let cancelled = false;
    let ws: WebSocket | null = null;
    let hbInterval: number | null = null;

    const loadAndConnect = async () => {
      try {
        const res = await apiGet<{ snapshot: MpRoomSnapshot }>(
          `/api/mp/rooms/${lobbyRoomCode}/state`
        );
        if (!cancelled) {
          setLobbySnapshot(res.snapshot);
          setLobbyError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setLobbyError(err instanceof Error ? err.message : 'Kon lobby niet laden.');
        }
      }

      try {
        const token = await getAuthToken();
        if (cancelled || !token) return;
        const wsProto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${wsProto}//${window.location.host}/ws?code=${lobbyRoomCode}&token=${encodeURIComponent(
          token
        )}&mode=lobby`;
        ws = new WebSocket(wsUrl);
        ws.onmessage = (ev) => {
          try {
            const msg = JSON.parse(String(ev.data)) as {
              type: string;
              payload: unknown;
            };
            if (msg.type === 'room_snapshot') {
              setLobbySnapshot(msg.payload as MpRoomSnapshot);
            } else if (msg.type === 'room_terminated') {
              const p = msg.payload as { message?: string };
              setLobbyError(p.message || 'Deze spelkamer is beëindigd.');
              setLobbySnapshot(null);
              fetchMyRooms();
            }
          } catch {
            // ignore malformed ws frame
          }
        };
        hbInterval = window.setInterval(() => {
          if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'heartbeat' }));
          }
        }, 5000);
      } catch {
        // fallback handled by periodic my-rooms poll
      }
    };

    loadAndConnect();

    return () => {
      cancelled = true;
      if (hbInterval !== null) window.clearInterval(hbInterval);
      if (ws) {
        try {
          ws.close();
        } catch {
          // ignore
        }
      }
    };
  }, [lobbyRoomCode, fetchMyRooms]);

  const openCreateForm = (game: MpGameCatalogItem) => {
    setSelectedGame(game);
    setRoomTitle(game.title);
    setDifficulty('normal');
    setMaxPlayers(Math.min(game.maxPlayers, Math.max(game.minPlayers, 4)));
    setDurationMinutes(20);
    setCreateError(null);
  };

  const materialReady = useMemo(() => {
    if (!selectedGame || !analyzedMaterial) return false;
    const readableCount = analyzedMaterial.fileStatuses.filter((f) => f.readable).length;
    if (readableCount === 0) return false;
    return (
      analyzedMaterial.concepts.length >= selectedGame.minConcepts ||
      analyzedMaterial.questions.length >= selectedGame.minQuestions
    );
  }, [selectedGame, analyzedMaterial]);

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedGame || !analyzedMaterial) {
      setCreateError('Selecteer en analyseer eerst de leerstof.');
      return;
    }
    setCreatingRoom(true);
    setCreateError(null);
    try {
      const res = await apiPost<{ snapshot: MpRoomSnapshot }>('/api/mp/rooms', {
        gameId: selectedGame.id,
        title: roomTitle.trim() || selectedGame.title,
        difficulty,
        durationMinutes,
        maxPlayers,
        material: analyzedMaterial,
        hostAvatar,
      });
      setLobbyRoomCode(res.snapshot.roomCode);
      setLobbySnapshot(res.snapshot);
      setSelectedGame(null);
      fetchMyRooms();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : 'Kon spelkamer niet aanmaken.');
    } finally {
      setCreatingRoom(false);
    }
  };

  const handleStartLobbyRoom = async () => {
    if (!lobbyRoomCode) return;
    setStartingRoom(true);
    setLobbyError(null);
    try {
      const res = await apiPost<{ snapshot: MpRoomSnapshot }>(
        `/api/mp/rooms/${lobbyRoomCode}/start`
      );
      setLobbySnapshot(res.snapshot);
      fetchMyRooms();
    } catch (err) {
      setLobbyError(err instanceof Error ? err.message : 'Kon spel niet starten.');
    } finally {
      setStartingRoom(false);
    }
  };

  const handleCopyInvite = async (code: string) => {
    const link = `${window.location.origin}${window.location.pathname}?join=1&code=${code}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopiedCode(true);
      window.setTimeout(() => setCopiedCode(false), 2500);
    } catch {
      // ignore clipboard error
    }
  };

  const handleConfirmEndRoom = async () => {
    if (!endTargetCode) return;
    setEndingRoom(true);
    try {
      await apiPost(`/api/mp/rooms/${endTargetCode}/end`);
      if (lobbyRoomCode === endTargetCode) {
        setLobbyRoomCode(null);
        setLobbySnapshot(null);
      }
      setEndTargetCode(null);
      fetchMyRooms();
    } catch (err) {
      setLobbyError(err instanceof Error ? err.message : 'Kon spelkamer niet beëindigen.');
      setEndTargetCode(null);
    } finally {
      setEndingRoom(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Banner / Intro */}
      <section className="rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-xs font-semibold text-indigo-600 dark:text-indigo-400">
            <ShieldCheck className="w-4 h-4" />
            <span>100% Leerstof-vergrendelde Multiplayer</span>
          </div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
            8 Interactieve Multiplayer Spelwerelden
          </h2>
          <p className="text-xs text-slate-600 dark:text-slate-400 max-w-2xl leading-relaxed">
            Kies een spel, vergrendel jouw geselecteerde bestanden of mappen als enige bron en nodig teamgenoten uit met een 6-cijferige code. Spelers spelen in een apart tabblad in hun eigen tempo en blijven met elkaar verbonden, ook als iemand even offline is.
          </p>
        </div>

        <button
          type="button"
          onClick={onOpenJoinModal}
          className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold inline-flex items-center gap-2 whitespace-nowrap shrink-0"
        >
          <Hash className="w-4 h-4" />
          <span>Deelnemen met code</span>
        </button>
      </section>

      {/* Active Host Lobby */}
      {lobbyRoomCode && (
        <section className="rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/30 border-2 border-indigo-400 dark:border-indigo-700 p-6 space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1">
              <span className="text-xs font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-300">
                Spelkamer Lobby · {lobbySnapshot?.status === 'active' ? 'Actief' : lobbySnapshot?.status === 'waiting' ? 'Wacht op spelers' : 'Klaar om te starten'}
              </span>
              <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                {lobbySnapshot?.title || 'Spelkamer'}
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Spelcode: <strong className="font-mono text-base text-indigo-700 dark:text-indigo-300 tracking-widest">{lobbyRoomCode}</strong> · Max {lobbySnapshot?.maxPlayers || 6} spelers · Niveau: {lobbySnapshot?.difficulty || 'normal'}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => handleCopyInvite(lobbyRoomCode)}
                className="px-3.5 py-2 rounded-lg bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-700 text-xs font-medium inline-flex items-center gap-1.5 hover:bg-slate-50 dark:hover:bg-slate-800"
              >
                {copiedCode ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedCode ? 'Link gekopieerd!' : 'Kopieer uitnodigingslink'}</span>
              </button>

              <a
                href={`${window.location.pathname}?mpRoom=${lobbyRoomCode}`}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold inline-flex items-center gap-1.5"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>Open spel in nieuw tabblad</span>
              </a>

              {lobbySnapshot?.status === 'lobby' && lobbySnapshot.hostId === userId && (
                <button
                  type="button"
                  disabled={startingRoom}
                  onClick={handleStartLobbyRoom}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-60"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>{startingRoom ? 'Starten...' : 'Spel starten'}</span>
                </button>
              )}

              {lobbySnapshot?.hostId === userId && (
                <button
                  type="button"
                  onClick={() => setEndTargetCode(lobbyRoomCode)}
                  className="px-3.5 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold inline-flex items-center gap-1.5"
                >
                  <Power className="w-3.5 h-3.5" />
                  <span>Beëindig het spel</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setLobbyRoomCode(null)}
                className="p-2 rounded-lg text-slate-500 hover:bg-white/60 dark:hover:bg-slate-800"
                aria-label="Lobby verbergen"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {lobbyError && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300">
              {lobbyError}
            </div>
          )}

          {lobbySnapshot && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Locked sources */}
              <div className="rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-4 space-y-2">
                <p className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                  <BookOpen className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <span>Vergrendelde leerstof voor deze kamer</span>
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {lobbySnapshot.sourceSummary.fileTitles.map((ft) => (
                    <span
                      key={ft}
                      className="px-2.5 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-[11px] font-medium text-slate-700 dark:text-slate-300"
                    >
                      {ft}
                    </span>
                  ))}
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  {lobbySnapshot.sourceSummary.conceptCount} begrippen · {lobbySnapshot.sourceSummary.questionCount} vragen · {lobbySnapshot.sourceSummary.topics.length} onderwerpen
                </p>
              </div>

              {/* Players in lobby */}
              <div className="rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-4 space-y-2">
                <p className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                  <span>
                    Spelers in kamer ({lobbySnapshot.players.length}/{lobbySnapshot.maxPlayers})
                  </span>
                </p>
                <div className="flex flex-wrap gap-2">
                  {lobbySnapshot.players.map((p) => (
                    <div
                      key={p.uid}
                      className="px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center gap-2 text-xs"
                    >
                      <span
                        className={`w-2 h-2 rounded-full ${
                          p.online ? 'bg-emerald-500' : 'bg-slate-400'
                        }`}
                      />
                      <span>{p.avatar}</span>
                      <span className="font-semibold text-slate-900 dark:text-slate-100">
                        {p.nickname}
                      </span>
                      {p.role === 'host' && (
                        <span className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400">
                          Maker
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Mijn actieve spellen */}
      <section className="rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-6 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Layers className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              <span>Mijn actieve spellen ({myRooms.length})</span>
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Lopende kamers die je hebt aangemaakt of waaraan je deelneemt. Kamers blijven maximaal 5 minuten bewaard als iedereen offline is.
            </p>
          </div>
        </div>

        {roomsLoading ? (
          <div className="py-6 flex items-center justify-center gap-2 text-xs text-slate-500">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Kamers ophalen...</span>
          </div>
        ) : myRooms.length === 0 ? (
          <div className="p-6 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-dashed border-slate-200 dark:border-slate-800 text-center text-xs text-slate-500 dark:text-slate-400">
            Je hebt op dit moment nog geen actieve multiplayerkamers. Maak hieronder een nieuw spel aan of doe mee via een 6-cijferige code.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {myRooms.map((room) => {
              const statusText =
                room.status === 'lobby'
                  ? 'In lobby'
                  : room.status === 'waiting'
                    ? `Wacht op spelers (${formatCountdown(room.waitingExpiresAt, nowMs)})`
                    : 'Actief';
              const statusTone =
                room.status === 'waiting'
                  ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300'
                  : room.status === 'active'
                    ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300'
                    : 'bg-indigo-100 dark:bg-indigo-950/60 text-indigo-800 dark:text-indigo-300';

              return (
                <div
                  key={room.roomCode}
                  className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/60 p-4 space-y-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-800 text-slate-800 dark:text-slate-200">
                          #{room.roomCode}
                        </span>
                        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${statusTone}`}>
                          {statusText}
                        </span>
                      </div>
                      <h4 className="mt-1.5 text-sm font-bold text-slate-900 dark:text-slate-100">
                        {room.title}
                      </h4>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400">
                        {room.playerCount}/{room.maxPlayers} spelers · {room.onlineCount} online · Mijn score: {room.myScore} ({room.myProgressPct}%)
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-1.5">
                    {room.fileTitles.slice(0, 4).map((ft) => (
                      <span
                        key={ft}
                        className="px-2 py-0.5 rounded bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-300"
                      >
                        {ft}
                      </span>
                    ))}
                    {room.fileTitles.length > 4 && (
                      <span className="text-[11px] text-slate-500">
                        +{room.fileTitles.length - 4} bronnen
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <a
                      href={`${window.location.pathname}?mpRoom=${room.roomCode}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold inline-flex items-center gap-1.5"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>Open spel in nieuw tabblad</span>
                    </a>

                    {room.status === 'lobby' && room.isHost && (
                      <button
                        type="button"
                        onClick={() => setLobbyRoomCode(room.roomCode)}
                        className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#111827] text-xs font-medium hover:bg-slate-50 dark:hover:bg-slate-800"
                      >
                        Lobby openen
                      </button>
                    )}

                    {room.isHost && (
                      <button
                        type="button"
                        onClick={() => setEndTargetCode(room.roomCode)}
                        className="ml-auto px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 text-xs font-semibold inline-flex items-center gap-1"
                      >
                        <Power className="w-3.5 h-3.5" />
                        <span>Beëindig het spel</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Room Creation Modal / Drawer */}
      {selectedGame && (
        <section className="rounded-2xl bg-white dark:bg-[#111827] border-2 border-indigo-500 p-6 space-y-6 shadow-sm">
          <div className="flex items-start justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
            <div className="space-y-1">
              <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                Nieuwe Multiplayer Kamer · {selectedGame.genre}
              </p>
              <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                {selectedGame.title} instellen
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                {selectedGame.shortDesc}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedGame(null)}
              className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              aria-label="Sluiten"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <form onSubmit={handleCreateRoom} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Kamernaam
                </label>
                <input
                  type="text"
                  maxLength={80}
                  value={roomTitle}
                  onChange={(e) => setRoomTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Moeilijkheidsgraad
                </label>
                <select
                  value={difficulty}
                  onChange={(e) => setDifficulty(e.target.value as 'easy' | 'normal' | 'hard')}
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm"
                >
                  <option value="easy">Makkelijk</option>
                  <option value="normal">Normaal</option>
                  <option value="hard">Moeilijk</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1 tabular-nums">
                  Max. spelers ({selectedGame.minPlayers}–{selectedGame.maxPlayers})
                </label>
                <select
                  value={maxPlayers}
                  onChange={(e) => setMaxPlayers(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm"
                >
                  {Array.from(
                    { length: selectedGame.maxPlayers - selectedGame.minPlayers + 1 },
                    (_, i) => selectedGame.minPlayers + i
                  ).map((n) => (
                    <option key={n} value={n}>
                      {n} spelers
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1">
                  Richtduur
                </label>
                <select
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm"
                >
                  <option value={10}>10 minuten</option>
                  <option value={15}>15 minuten</option>
                  <option value={20}>20 minuten</option>
                  <option value={30}>30 minuten</option>
                </select>
              </div>
            </div>

            {/* Host avatar choice */}
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                Jouw avatar ({userName}):
              </span>
              <div className="flex flex-wrap gap-1.5">
                {MP_AVATARS.map((av) => (
                  <button
                    key={av}
                    type="button"
                    onClick={() => setHostAvatar(av)}
                    className={`w-9 h-9 rounded-lg border text-lg flex items-center justify-center transition-colors ${
                      hostAvatar === av
                        ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/60'
                        : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900'
                    }`}
                  >
                    {av}
                  </button>
                ))}
              </div>
            </div>

            {/* Mandatory Material Selector */}
            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                Stap 2: Selecteer en controleer de verplichte leerstof
              </p>
              <MaterialSelector
                folders={folders}
                items={items}
                targetGameTitle={selectedGame.title}
                minConceptsRequired={selectedGame.minConcepts}
                minQuestionsRequired={selectedGame.minQuestions}
                initialMaterial={analyzedMaterial}
                onAnalyzed={setAnalyzedMaterial}
              />
            </div>

            {createError && (
              <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300">
                {createError}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-end gap-3 pt-2 border-t border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setSelectedGame(null)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium"
              >
                Annuleren
              </button>
              <button
                type="submit"
                disabled={creatingRoom || !materialReady}
                className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold inline-flex items-center gap-2 disabled:opacity-50"
              >
                <Sparkles className="w-4 h-4" />
                <span>
                  {creatingRoom
                    ? 'Spelkamer aanmaken...'
                    : materialReady
                      ? 'Spelkamer aanmaken'
                      : 'Analyseer eerst voldoende leerstof'}
                </span>
              </button>
            </div>
          </form>
        </section>
      )}

      {/* 8 Multiplayer Games Catalog */}
      <section className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Gamepad2 className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <span>Kies een Multiplayer Spelwereld (8)</span>
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
          {MP_GAME_CATALOG.map((game) => (
            <div
              key={game.id}
              className="rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col justify-between transition-all hover:border-indigo-400 dark:hover:border-indigo-700 shadow-xs"
            >
              <div>
                <div className="relative aspect-[16/9] bg-slate-900 overflow-hidden">
                  <img
                    src={game.image}
                    alt={game.title}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-950/75 via-transparent to-transparent" />
                  <div className="absolute bottom-2.5 left-3 right-3 flex items-center justify-between text-[11px] font-semibold text-white">
                    <span>{game.genre}</span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {game.duration}
                    </span>
                  </div>
                </div>

                <div className="p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <h4 className="text-base font-bold text-slate-900 dark:text-slate-100">
                      {game.title}
                    </h4>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    {game.shortDesc}
                  </p>
                  <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1.5 pt-1">
                    <Users className="w-3.5 h-3.5" />
                    <span>
                      {game.minPlayers}–{game.maxPlayers} spelers
                    </span>
                  </p>
                </div>
              </div>

              <div className="p-4 pt-0">
                <button
                  type="button"
                  onClick={() => openCreateForm(game)}
                  className={`w-full py-2.5 px-4 rounded-xl text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors ${game.accentClass}`}
                >
                  <Plus className="w-4 h-4" />
                  <span>Kamer aanmaken</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <ConfirmModal
        open={Boolean(endTargetCode)}
        title="Spel definitief beëindigen?"
        description={`Weet je zeker dat je spelkamer #${endTargetCode} voor alle spelers wilt sluiten? Deze actie kan niet ongedaan worden gemaakt.`}
        confirmLabel="Beëindig het spel"
        busy={endingRoom}
        onCancel={() => setEndTargetCode(null)}
        onConfirm={handleConfirmEndRoom}
      />
    </div>
  );
};
