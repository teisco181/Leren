import fs from "fs";
import path from "path";
import type {
  AnalyzedMaterial,
  MpChallengeItem,
  MpFeedEntry,
  MpMyRoomSummary,
  MpPlayerPublic,
  MpRoomSnapshot,
  MpRoomStatus,
  MpTradeOffer,
  MpWorkshopEntry,
  MultiplayerGameId,
} from "../types";

export const FIVE_MINUTES_MS = 5 * 60 * 1000;
const HEARTBEAT_OFFLINE_MS = 16 * 1000;
const STARTUP_GRACE_MS = 20 * 1000;

export const MP_GAME_SPECS: Record<
  MultiplayerGameId,
  {
    title: string;
    minPlayers: number;
    maxPlayers: number;
    minConcepts: number;
    minQuestions: number;
  }
> = {
  "escape-together": {
    title: "Escape Together",
    minPlayers: 2,
    maxPlayers: 6,
    minConcepts: 3,
    minQuestions: 2,
  },
  "build-a-city": {
    title: "Build a City",
    minPlayers: 2,
    maxPlayers: 6,
    minConcepts: 3,
    minQuestions: 3,
  },
  "detective-agency": {
    title: "Detective Agency",
    minPlayers: 2,
    maxPlayers: 5,
    minConcepts: 3,
    minQuestions: 2,
  },
  kingdoms: {
    title: "Kingdoms",
    minPlayers: 2,
    maxPlayers: 6,
    minConcepts: 3,
    minQuestions: 3,
  },
  "knowledge-league": {
    title: "Knowledge League",
    minPlayers: 2,
    maxPlayers: 8,
    minConcepts: 4,
    minQuestions: 3,
  },
  "expedition-earth": {
    title: "Expedition Earth",
    minPlayers: 2,
    maxPlayers: 6,
    minConcepts: 3,
    minQuestions: 3,
  },
  ecosystem: {
    title: "Ecosystem",
    minPlayers: 2,
    maxPlayers: 6,
    minConcepts: 3,
    minQuestions: 3,
  },
  "ultimate-workshop": {
    title: "The Ultimate Workshop",
    minPlayers: 2,
    maxPlayers: 5,
    minConcepts: 3,
    minQuestions: 3,
  },
};

export interface ServerChallenge extends MpChallengeItem {
  correctIndex: number;
  answer: string;
  explanation: string;
}

export interface ServerPlayer extends MpPlayerPublic {
  taskOrder: number[];
  answeredIds: string[];
  hasOpenedGameTab: boolean;
}

export interface ServerRoom {
  roomCode: string;
  gameId: MultiplayerGameId;
  title: string;
  hostId: string;
  hostName: string;
  status: MpRoomStatus;
  difficulty: "easy" | "normal" | "hard";
  durationMinutes: number;
  maxPlayers: number;
  createdAt: number;
  startedAt: number | null;
  waitingSince: number | null;
  waitingExpiresAt: number | null;
  endedAt: number | null;
  material: AnalyzedMaterial;
  challenges: ServerChallenge[];
  players: Record<string, ServerPlayer>;
  feed: MpFeedEntry[];
  trades: MpTradeOffer[];
  workshopGallery: MpWorkshopEntry[];
  cityRatings: Record<string, Record<string, number>>;
}

interface PersistedDb {
  rooms: Record<string, ServerRoom>;
  terminatedCodes: Record<string, { status: "ended" | "expired"; at: number }>;
}

const DATA_DIR = path.join(process.cwd(), ".data");
const DB_FILE = path.join(DATA_DIR, "mp-rooms.json");

function seededShuffle<T>(arr: T[], seedStr: string): T[] {
  const copy = [...arr];
  let seed = 0;
  for (let i = 0; i < seedStr.length; i++) {
    seed = (seed * 31 + seedStr.charCodeAt(i)) >>> 0;
  }
  const nextRand = () => {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(nextRand() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function buildChallengesFromMaterial(material: AnalyzedMaterial): ServerChallenge[] {
  const challenges: ServerChallenge[] = [];
  const seenPrompts = new Set<string>();

  for (const q of material.questions || []) {
    const key = q.question.trim().toLowerCase();
    if (!key || seenPrompts.has(key) || !Array.isArray(q.options) || q.options.length < 2) {
      continue;
    }
    seenPrompts.add(key);
    challenges.push({
      id: `ch-q-${challenges.length + 1}`,
      kind: "mcq",
      prompt: q.question,
      options: q.options,
      correctIndex: q.correctIndex,
      answer: q.options[q.correctIndex] || "",
      explanation: q.explanation,
      sourceTitle: q.sourceTitle || material.title,
      sourceSection: q.sourceSection || "Brontekst",
    });
  }

  for (const p of material.puzzles || []) {
    const key = p.prompt.trim().toLowerCase();
    if (!key || seenPrompts.has(key) || !Array.isArray(p.options) || p.options.length < 2) {
      continue;
    }
    seenPrompts.add(key);
    const idx = p.options.findIndex(
      (o) => o.trim().toLowerCase() === p.answer.trim().toLowerCase()
    );
    challenges.push({
      id: `ch-p-${challenges.length + 1}`,
      kind: "puzzle",
      prompt: p.prompt,
      options: p.options,
      correctIndex: idx >= 0 ? idx : 0,
      answer: idx >= 0 ? p.options[idx] : p.answer,
      explanation: p.explanation,
      hint: p.hint,
      sourceTitle: p.sourceTitle || material.title,
      sourceSection: p.sourceSection || "Brontekst",
    });
  }

  const concepts = material.concepts || [];
  for (let i = 0; i < concepts.length; i++) {
    const c = concepts[i];
    if (concepts.length < 2) break;
    const prompt = `Welk begrip uit de leerstof hoort bij: "${c.definition}"?`;
    const key = prompt.toLowerCase();
    if (seenPrompts.has(key)) continue;
    seenPrompts.add(key);
    const distractors = concepts
      .filter((_, j) => j !== i)
      .slice(0, 3)
      .map((d) => d.term);
    const options = seededShuffle([c.term, ...distractors], `${c.id}-${i}`);
    challenges.push({
      id: `ch-c-${challenges.length + 1}`,
      kind: "concept",
      prompt,
      options,
      correctIndex: options.indexOf(c.term),
      answer: c.term,
      explanation: `${c.term}: ${c.definition}`,
      sourceTitle: c.sourceTitle || material.title,
      sourceSection: c.sourceSection || "Brontekst",
    });
  }

  return challenges;
}

function createInitialWorldData(gameId: MultiplayerGameId): Record<string, unknown> {
  switch (gameId) {
    case "escape-together":
      return { solvedStations: [], unlockedNotes: [], escaped: false };
    case "build-a-city":
      return {
        coins: 120,
        energy: 2,
        citizens: 20,
        grid: Array(16).fill(null), // 4x4 grid of building IDs
      };
    case "detective-agency":
      return {
        investigatedSpots: [],
        unlockedClues: [],
        caseSolved: false,
      };
    case "kingdoms":
      return {
        gold: 120,
        food: 100,
        knowledge: 40,
        population: 50,
        castleLevel: 1,
        techs: [],
      };
    case "knowledge-league":
      return {
        roundIndex: 0,
        roundScores: [0, 0, 0, 0],
      };
    case "expedition-earth":
      return {
        stage: 0, // 0..6
        supplies: 100,
        discoveries: [],
      };
    case "ecosystem":
      return {
        flora: 40,
        fauna: 35,
        water: 55,
        energy: 50,
        slots: Array(8).fill(null),
      };
    case "ultimate-workshop":
      return {
        partsInventory: { gear: 1, battery: 1, sensor: 0, thruster: 0, shield: 0 },
        blueprint: Array(12).fill(null),
        machineName: "Mijn Uitvinding",
        lastTestScore: 0,
        testPassed: false,
      };
  }
}

export function computeDutchGrade(correct: number, wrong: number, progressPct: number): number {
  const total = correct + wrong;
  if (total === 0) return Number(Math.max(1, 5.5 * (progressPct / 100)).toFixed(1));
  const acc = correct / total;
  const raw = 1 + acc * 8.2 + (progressPct / 100) * 0.8;
  return Number(Math.min(10, Math.max(1, raw)).toFixed(1));
}

export class MultiplayerRoomStore {
  private db: PersistedDb = { rooms: {}, terminatedCodes: {} };
  private onBroadcast?: (roomCode: string, event: { type: string; payload: unknown }) => void;
  private sweeperId: NodeJS.Timeout | null = null;

  constructor(
    onBroadcast?: (roomCode: string, event: { type: string; payload: unknown }) => void
  ) {
    this.onBroadcast = onBroadcast;
    this.load();
    this.startSweeper();
  }

  public setBroadcaster(
    fn: (roomCode: string, event: { type: string; payload: unknown }) => void
  ) {
    this.onBroadcast = fn;
  }

  private load() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, "utf8");
        const parsed = JSON.parse(raw) as PersistedDb;
        if (parsed && typeof parsed.rooms === "object") {
          this.db = {
            rooms: parsed.rooms || {},
            terminatedCodes: parsed.terminatedCodes || {},
          };
          // Reconcile stale online flags after server restart
          const now = Date.now();
          for (const room of Object.values(this.db.rooms)) {
            for (const p of Object.values(room.players)) {
              if (now - p.lastSeenAt > HEARTBEAT_OFFLINE_MS) {
                p.online = false;
              }
            }
          }
          this.checkWaitingAndExpiry(now);
        }
      }
    } catch (err) {
      console.error("Kon multiplayer rooms store niet laden:", err);
      this.db = { rooms: {}, terminatedCodes: {} };
    }
  }

  private save() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      const tmp = `${DB_FILE}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.db), "utf8");
      fs.renameSync(tmp, DB_FILE);
    } catch (err) {
      console.error("Kon multiplayer rooms store niet opslaan:", err);
    }
  }

  private startSweeper() {
    if (this.sweeperId) clearInterval(this.sweeperId);
    this.sweeperId = setInterval(() => {
      const changed = this.checkWaitingAndExpiry(Date.now());
      if (changed) this.save();
    }, 3000);
  }

  private checkWaitingAndExpiry(now: number): boolean {
    let dirty = false;
    for (const [code, room] of Object.entries(this.db.rooms)) {
      if (room.status === "ended" || room.status === "expired") continue;

      const playerList = Object.values(room.players);
      for (const p of playerList) {
        if (p.online && now - p.lastSeenAt > HEARTBEAT_OFFLINE_MS) {
          p.online = false;
          dirty = true;
        }
      }

      if (room.status === "active") {
        const anyTabEverOpened = playerList.some((p) => p.hasOpenedGameTab);
        const pastGrace = room.startedAt !== null && now - room.startedAt > STARTUP_GRACE_MS;
        const onlineCount = playerList.filter((p) => p.online && p.hasOpenedGameTab).length;

        if ((anyTabEverOpened || pastGrace) && onlineCount === 0) {
          room.status = "waiting";
          room.waitingSince = now;
          room.waitingExpiresAt = now + FIVE_MINUTES_MS;
          room.feed.unshift({
            id: `sys-${now}`,
            uid: "system",
            nickname: "StudyFlow",
            avatar: "⏳",
            text: "Alle spelers zijn offline. Spelkamer wacht 5 minuten op terugkeer.",
            kind: "system",
            createdAt: now,
          });
          room.feed = room.feed.slice(0, 40);
          dirty = true;
          this.broadcastRoom(code);
        }
      } else if (room.status === "waiting") {
        const onlineCount = playerList.filter((p) => p.online && p.hasOpenedGameTab).length;
        if (onlineCount > 0) {
          room.status = "active";
          room.waitingSince = null;
          room.waitingExpiresAt = null;
          room.feed.unshift({
            id: `sys-${now}`,
            uid: "system",
            nickname: "StudyFlow",
            avatar: "🟢",
            text: "Een speler is teruggekeerd! Het spel gaat verder.",
            kind: "system",
            createdAt: now,
          });
          room.feed = room.feed.slice(0, 40);
          dirty = true;
          this.broadcastRoom(code);
        } else if (room.waitingExpiresAt && now >= room.waitingExpiresAt) {
          this.expireRoom(code, now);
          dirty = true;
        }
      }
    }

    // Prune very old terminated code notices (>24h)
    for (const [code, info] of Object.entries(this.db.terminatedCodes)) {
      if (now - info.at > 24 * 60 * 60 * 1000) {
        delete this.db.terminatedCodes[code];
        dirty = true;
      }
    }
    return dirty;
  }

  private expireRoom(roomCode: string, now: number) {
    delete this.db.rooms[roomCode];
    this.db.terminatedCodes[roomCode] = { status: "expired", at: now };
    this.onBroadcast?.(roomCode, {
      type: "room_terminated",
      payload: {
        roomCode,
        status: "expired",
        message: "Deze spelkamer is verlopen omdat alle spelers langer dan 5 minuten afwezig waren.",
      },
    });
  }

  public broadcastRoom(roomCode: string) {
    const room = this.db.rooms[roomCode];
    if (!room) return;
    this.onBroadcast?.(roomCode, {
      type: "room_snapshot",
      payload: this.toPublicSnapshot(room),
    });
  }

  public toPublicSnapshot(room: ServerRoom): MpRoomSnapshot {
    const players: MpPlayerPublic[] = Object.values(room.players)
      .map((p) => ({
        uid: p.uid,
        nickname: p.nickname,
        avatar: p.avatar,
        role: p.role,
        online: p.online,
        lastSeenAt: p.lastSeenAt,
        score: p.score,
        correct: p.correct,
        wrong: p.wrong,
        streak: p.streak,
        progressPct: p.progressPct,
        completed: p.completed,
        grade: p.grade,
        worldData: p.worldData,
      }))
      .sort((a, b) => b.score - a.score);

    return {
      roomCode: room.roomCode,
      gameId: room.gameId,
      title: room.title,
      hostId: room.hostId,
      hostName: room.hostName,
      status: room.status,
      difficulty: room.difficulty,
      durationMinutes: room.durationMinutes,
      maxPlayers: room.maxPlayers,
      createdAt: room.createdAt,
      startedAt: room.startedAt,
      waitingSince: room.waitingSince,
      waitingExpiresAt: room.waitingExpiresAt,
      endedAt: room.endedAt,
      sourceSummary: {
        title: room.material.title,
        subject: room.material.subject,
        fileTitles: room.material.fileStatuses
          .filter((f) => f.readable)
          .map((f) => f.title),
        topics: room.material.topics || [],
        conceptCount: (room.material.concepts || []).length,
        questionCount: (room.material.questions || []).length,
      },
      players,
      feed: room.feed,
      trades: room.trades,
      workshopGallery: room.workshopGallery,
      cityRatings: room.cityRatings,
    };
  }

  private generateUniqueCode(): string {
    for (let i = 0; i < 30; i++) {
      const code = String(Math.floor(100000 + Math.random() * 900000));
      if (!this.db.rooms[code] && !this.db.terminatedCodes[code]) {
        return code;
      }
    }
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  public createRoom(input: {
    hostId: string;
    hostName: string;
    hostAvatar?: string;
    gameId: MultiplayerGameId;
    title?: string;
    difficulty?: "easy" | "normal" | "hard";
    durationMinutes?: number;
    maxPlayers?: number;
    material: AnalyzedMaterial;
  }): MpRoomSnapshot {
    const spec = MP_GAME_SPECS[input.gameId];
    if (!spec) {
      throw new Error("Onbekend multiplayerspel gekozen.");
    }
    const challenges = buildChallengesFromMaterial(input.material);
    if (
      (input.material.concepts?.length || 0) < spec.minConcepts &&
      challenges.length < 4
    ) {
      throw new Error(
        `Onvoldoende bruikbare leerstof voor ${spec.title}. Selecteer meer bestanden met voldoende tekst.`
      );
    }

    const roomCode = this.generateUniqueCode();
    const now = Date.now();
    const clampedMax = Math.max(
      spec.minPlayers,
      Math.min(spec.maxPlayers, Number(input.maxPlayers) || spec.maxPlayers)
    );
    const clampedDuration = Math.max(5, Math.min(60, Number(input.durationMinutes) || 20));
    const difficulty =
      input.difficulty === "easy" || input.difficulty === "hard"
        ? input.difficulty
        : "normal";

    const taskOrder = seededShuffle(
      challenges.map((_, idx) => idx),
      `${roomCode}-${input.hostId}`
    );

    const hostPlayer: ServerPlayer = {
      uid: input.hostId,
      nickname: (input.hostName || "Spelleider").trim().slice(0, 24),
      avatar: (input.hostAvatar || "👑").slice(0, 12),
      role: "host",
      online: true,
      lastSeenAt: now,
      score: 0,
      correct: 0,
      wrong: 0,
      streak: 0,
      progressPct: 0,
      completed: false,
      grade: 1,
      worldData: createInitialWorldData(input.gameId),
      taskOrder,
      answeredIds: [],
      hasOpenedGameTab: false,
    };

    const room: ServerRoom = {
      roomCode,
      gameId: input.gameId,
      title: (input.title || `${spec.title} · ${input.material.title}`).trim().slice(0, 160),
      hostId: input.hostId,
      hostName: hostPlayer.nickname,
      status: "lobby",
      difficulty,
      durationMinutes: clampedDuration,
      maxPlayers: clampedMax,
      createdAt: now,
      startedAt: null,
      waitingSince: null,
      waitingExpiresAt: null,
      endedAt: null,
      material: input.material,
      challenges,
      players: { [input.hostId]: hostPlayer },
      feed: [
        {
          id: `sys-${now}`,
          uid: "system",
          nickname: "StudyFlow",
          avatar: "🎮",
          text: `${hostPlayer.nickname} heeft spelkamer ${roomCode} geopend op basis van ${input.material.fileStatuses.filter((f) => f.readable).length} geselecteerde bron(nen).`,
          kind: "system",
          createdAt: now,
        },
      ],
      trades: [],
      workshopGallery: [],
      cityRatings: {},
    };

    this.db.rooms[roomCode] = room;
    this.save();
    return this.toPublicSnapshot(room);
  }

  public getRoomInfo(roomCode: string): {
    roomCode: string;
    status: MpRoomStatus;
    gameId?: MultiplayerGameId;
    title?: string;
    hostName?: string;
    playerCount?: number;
    maxPlayers?: number;
    fileTitles?: string[];
    error?: string;
  } {
    const term = this.db.terminatedCodes[roomCode];
    if (term) {
      return {
        roomCode,
        status: term.status,
        error:
          term.status === "ended"
            ? "Dit spel is beëindigd door de spelleider. De spelcode is niet meer geldig."
            : "Deze spelkamer is verlopen omdat alle spelers langer dan 5 minuten afwezig waren.",
      };
    }
    const room = this.db.rooms[roomCode];
    if (!room) {
      return {
        roomCode,
        status: "expired",
        error: `Geen actieve spelkamer gevonden met code ${roomCode}.`,
      };
    }
    return {
      roomCode: room.roomCode,
      status: room.status,
      gameId: room.gameId,
      title: room.title,
      hostName: room.hostName,
      playerCount: Object.keys(room.players).length,
      maxPlayers: room.maxPlayers,
      fileTitles: room.material.fileStatuses.filter((f) => f.readable).map((f) => f.title),
    };
  }

  public getMyRooms(uid: string): MpMyRoomSummary[] {
    const now = Date.now();
    this.checkWaitingAndExpiry(now);
    const list: MpMyRoomSummary[] = [];
    for (const room of Object.values(this.db.rooms)) {
      if (room.status === "ended" || room.status === "expired") continue;
      const p = room.players[uid];
      if (!p && room.hostId !== uid) continue;
      const players = Object.values(room.players);
      list.push({
        roomCode: room.roomCode,
        gameId: room.gameId,
        title: room.title,
        hostId: room.hostId,
        hostName: room.hostName,
        isHost: room.hostId === uid,
        status: room.status,
        playerCount: players.length,
        onlineCount: players.filter((pl) => pl.online).length,
        maxPlayers: room.maxPlayers,
        waitingExpiresAt: room.waitingExpiresAt,
        myScore: p?.score || 0,
        myProgressPct: p?.progressPct || 0,
        myCompleted: p?.completed || false,
        fileTitles: room.material.fileStatuses.filter((f) => f.readable).map((f) => f.title),
        createdAt: room.createdAt,
      });
    }
    return list.sort((a, b) => b.createdAt - a.createdAt);
  }

  public joinRoom(
    roomCode: string,
    user: { uid: string; nickname: string; avatar: string }
  ): MpRoomSnapshot {
    const term = this.db.terminatedCodes[roomCode];
    if (term) {
      throw new Error(
        term.status === "ended"
          ? "Dit spel is beëindigd door de spelleider. De spelcode is niet meer geldig."
          : "Deze spelkamer is verlopen omdat iedereen langer dan 5 minuten afwezig was."
      );
    }
    const room = this.db.rooms[roomCode];
    if (!room) {
      throw new Error(`Geen spelkamer gevonden met code ${roomCode}.`);
    }

    const now = Date.now();
    const existing = room.players[user.uid];
    if (existing) {
      existing.online = true;
      existing.lastSeenAt = now;
      if (user.nickname.trim()) existing.nickname = user.nickname.trim().slice(0, 24);
      if (user.avatar) existing.avatar = user.avatar.slice(0, 12);
      if (room.status === "waiting") {
        room.status = "active";
        room.waitingSince = null;
        room.waitingExpiresAt = null;
      }
      this.save();
      this.broadcastRoom(roomCode);
      return this.toPublicSnapshot(room);
    }

    const currentCount = Object.keys(room.players).length;
    if (currentCount >= room.maxPlayers) {
      throw new Error(
        `Deze spelkamer zit vol (maximaal ${room.maxPlayers} spelers voor dit spel).`
      );
    }

    const taskOrder = seededShuffle(
      room.challenges.map((_, idx) => idx),
      `${roomCode}-${user.uid}`
    );

    room.players[user.uid] = {
      uid: user.uid,
      nickname: user.nickname.trim().slice(0, 24) || "Speler",
      avatar: (user.avatar || "🦊").slice(0, 12),
      role: room.hostId === user.uid ? "host" : "player",
      online: true,
      lastSeenAt: now,
      score: 0,
      correct: 0,
      wrong: 0,
      streak: 0,
      progressPct: 0,
      completed: false,
      grade: 1,
      worldData: createInitialWorldData(room.gameId),
      taskOrder,
      answeredIds: [],
      hasOpenedGameTab: false,
    };

    if (room.status === "waiting") {
      room.status = "active";
      room.waitingSince = null;
      room.waitingExpiresAt = null;
    }

    room.feed.unshift({
      id: `join-${now}-${user.uid.slice(0, 6)}`,
      uid: user.uid,
      nickname: room.players[user.uid].nickname,
      avatar: room.players[user.uid].avatar,
      text: `${room.players[user.uid].nickname} doet mee aan ${MP_GAME_SPECS[room.gameId].title}!`,
      kind: "system",
      createdAt: now,
    });
    room.feed = room.feed.slice(0, 40);

    this.save();
    this.broadcastRoom(roomCode);
    return this.toPublicSnapshot(room);
  }

  public startRoom(roomCode: string, requesterUid: string): MpRoomSnapshot {
    const room = this.db.rooms[roomCode];
    if (!room) throw new Error("Spelkamer niet gevonden.");
    if (room.hostId !== requesterUid) {
      throw new Error("Alleen de maker van het spel kan de kamer starten.");
    }
    const now = Date.now();
    if (room.status === "lobby") {
      room.status = "active";
      room.startedAt = now;
      room.waitingSince = null;
      room.waitingExpiresAt = null;
      room.feed.unshift({
        id: `start-${now}`,
        uid: requesterUid,
        nickname: room.hostName,
        avatar: "🚀",
        text: "Het spel is gestart! Iedereen kan op zijn eigen tempo spelen.",
        kind: "system",
        createdAt: now,
      });
      room.feed = room.feed.slice(0, 40);
      this.save();
      this.broadcastRoom(roomCode);
    }
    return this.toPublicSnapshot(room);
  }

  public endRoomByMaker(roomCode: string, requesterUid: string): void {
    const room = this.db.rooms[roomCode];
    if (!room) throw new Error("Spelkamer niet gevonden.");
    if (room.hostId !== requesterUid) {
      throw new Error("Alleen de maker kan dit spel definitief beëindigen.");
    }
    const now = Date.now();
    delete this.db.rooms[roomCode];
    this.db.terminatedCodes[roomCode] = { status: "ended", at: now };
    this.save();
    this.onBroadcast?.(roomCode, {
      type: "room_terminated",
      payload: {
        roomCode,
        status: "ended",
        message: "De spelleider heeft dit spel beëindigd.",
      },
    });
  }

  public getPlayerPayload(roomCode: string, uid: string): {
    snapshot: MpRoomSnapshot;
    challenges: MpChallengeItem[];
    answeredIds: string[];
  } {
    const term = this.db.terminatedCodes[roomCode];
    if (term) {
      throw new Error(
        term.status === "ended"
          ? "Dit spel is beëindigd door de spelleider."
          : "Deze spelkamer is verlopen omdat alle spelers langer dan 5 minuten afwezig waren."
      );
    }
    const room = this.db.rooms[roomCode];
    if (!room) {
      throw new Error("Spelkamer niet gevonden.");
    }
    const player = room.players[uid];
    if (!player) {
      throw new Error("Je bent nog geen deelnemer in deze spelkamer.");
    }

    const orderedChallenges: MpChallengeItem[] = player.taskOrder
      .map((idx) => room.challenges[idx])
      .filter(Boolean)
      .map(({ id, kind, prompt, options, hint, sourceTitle, sourceSection }) => ({
        id,
        kind,
        prompt,
        options,
        hint,
        sourceTitle,
        sourceSection,
      }));

    return {
      snapshot: this.toPublicSnapshot(room),
      challenges: orderedChallenges,
      answeredIds: player.answeredIds,
    };
  }

  public recordHeartbeat(roomCode: string, uid: string, mode: "lobby" | "game") {
    const room = this.db.rooms[roomCode];
    if (!room) return;
    const player = room.players[uid];
    if (!player) return;
    const now = Date.now();
    const wasOffline = !player.online;
    player.online = true;
    player.lastSeenAt = now;
    if (mode === "game") {
      player.hasOpenedGameTab = true;
    }
    if (mode === "game" && room.status === "waiting") {
      room.status = "active";
      room.waitingSince = null;
      room.waitingExpiresAt = null;
      this.save();
      this.broadcastRoom(roomCode);
    } else if (wasOffline) {
      this.broadcastRoom(roomCode);
    }
  }

  public markPlayerTabClosed(roomCode: string, uid: string, activeGameSocketsForPlayer: number) {
    const room = this.db.rooms[roomCode];
    if (!room) return;
    const player = room.players[uid];
    if (!player) return;
    if (activeGameSocketsForPlayer <= 0) {
      player.online = false;
      this.checkWaitingAndExpiry(Date.now());
      this.save();
      this.broadcastRoom(roomCode);
    }
  }

  public performAction(
    roomCode: string,
    uid: string,
    body: { type: string; payload?: Record<string, unknown> }
  ): {
    snapshot: MpRoomSnapshot;
    result?: Record<string, unknown>;
  } {
    const room = this.db.rooms[roomCode];
    if (!room) {
      const term = this.db.terminatedCodes[roomCode];
      if (term?.status === "ended") {
        throw new Error("Dit spel is beëindigd door de spelleider.");
      }
      if (term?.status === "expired") {
        throw new Error("Deze spelkamer is verlopen.");
      }
      throw new Error("Spelkamer niet gevonden.");
    }
    const player = room.players[uid];
    if (!player) {
      throw new Error("Speler niet gevonden in deze kamer.");
    }

    const now = Date.now();
    player.online = true;
    player.lastSeenAt = now;
    player.hasOpenedGameTab = true;
    if (room.status === "waiting") {
      room.status = "active";
      room.waitingSince = null;
      room.waitingExpiresAt = null;
    }

    const payload = body.payload || {};
    let result: Record<string, unknown> = {};

    if (body.type === "answer_challenge") {
      const challengeId = String(payload.challengeId || "");
      const optionIndex = Number(payload.optionIndex);
      const ch = room.challenges.find((c) => c.id === challengeId);
      if (!ch) throw new Error("Opdracht niet gevonden.");

      const isCorrect = optionIndex === ch.correctIndex;
      const alreadyAnswered = player.answeredIds.includes(challengeId);

      if (isCorrect) {
        if (!alreadyAnswered) {
          player.answeredIds.push(challengeId);
          player.correct += 1;
          player.streak += 1;
          const pts = 100 + Math.min(player.streak - 1, 5) * 20;
          player.score += pts;

          // Apply per-game resource/world rewards deterministically on server
          this.applyCorrectChallengeReward(room, player, payload);
        }
      } else {
        player.wrong += 1;
        player.streak = 0;
        if (room.gameId === "expedition-earth") {
          const curSup = Number(player.worldData.supplies ?? 100);
          player.worldData.supplies = Math.max(20, curSup - 10);
        } else if (room.gameId === "ecosystem") {
          const curWater = Number(player.worldData.water ?? 50);
          player.worldData.water = Math.max(15, curWater - 6);
        }
      }

      this.recomputeProgressAndGrade(room, player);
      result = {
        correct: isCorrect,
        explanation: ch.explanation,
        correctOption: ch.options[ch.correctIndex],
        sourceTitle: ch.sourceTitle,
        sourceSection: ch.sourceSection,
        answeredIds: player.answeredIds,
      };
    } else if (body.type === "build_city_tile") {
      if (room.gameId !== "build-a-city") throw new Error("Ongeldige actie voor dit spel.");
      const slotIndex = Number(payload.slotIndex);
      const buildingId = String(payload.buildingId || "");
      const COSTS: Record<string, { cost: number; pop: number; energyDelta: number }> = {
        huis: { cost: 40, pop: 15, energyDelta: -1 },
        school: { cost: 80, pop: 25, energyDelta: -1 },
        park: { cost: 50, pop: 12, energyDelta: 0 },
        zonnepaneel: { cost: 60, pop: 5, energyDelta: 3 },
        bieb: { cost: 90, pop: 30, energyDelta: -1 },
        metro: { cost: 110, pop: 40, energyDelta: -1 },
      };
      const spec = COSTS[buildingId];
      if (!spec || slotIndex < 0 || slotIndex >= 16) {
        throw new Error("Ongeldig gebouw of vakje.");
      }
      const coins = Number(player.worldData.coins ?? 0);
      if (coins < spec.cost) {
        throw new Error(`Je hebt ${spec.cost} bouwmunten nodig.`);
      }
      const grid = Array.isArray(player.worldData.grid)
        ? [...(player.worldData.grid as Array<string | null>)]
        : Array(16).fill(null);
      grid[slotIndex] = buildingId;
      player.worldData.grid = grid;
      player.worldData.coins = coins - spec.cost;
      player.worldData.citizens = Number(player.worldData.citizens ?? 20) + spec.pop;
      player.worldData.energy = Math.max(0, Number(player.worldData.energy ?? 2) + spec.energyDelta);
      player.score += 60;
      this.recomputeProgressAndGrade(room, player);
    } else if (body.type === "rate_city") {
      if (room.gameId !== "build-a-city") throw new Error("Ongeldige actie.");
      const targetUid = String(payload.targetUid || "");
      const stars = Math.max(1, Math.min(5, Math.round(Number(payload.stars) || 5)));
      if (!room.players[targetUid] || targetUid === uid) {
        throw new Error("Ongeldige stad om te beoordelen.");
      }
      if (!room.cityRatings[targetUid]) room.cityRatings[targetUid] = {};
      room.cityRatings[targetUid][uid] = stars;
      room.feed.unshift({
        id: `rate-${now}`,
        uid,
        nickname: player.nickname,
        avatar: player.avatar,
        text: `gaf de stad van ${room.players[targetUid].nickname} ${stars} sterren!`,
        kind: "rating",
        createdAt: now,
      });
      room.feed = room.feed.slice(0, 40);
    } else if (body.type === "share_clue") {
      const text = String(payload.text || "").trim().slice(0, 220);
      if (!text) throw new Error("Typ eerst een aanwijzing.");
      room.feed.unshift({
        id: `clue-${now}-${uid.slice(0, 5)}`,
        uid,
        nickname: player.nickname,
        avatar: player.avatar,
        text,
        kind: "clue",
        createdAt: now,
      });
      room.feed = room.feed.slice(0, 40);
    } else if (body.type === "kingdom_upgrade") {
      if (room.gameId !== "kingdoms") throw new Error("Ongeldige actie.");
      const upgradeKind = String(payload.upgradeKind || "");
      if (upgradeKind === "castle") {
        const lvl = Number(player.worldData.castleLevel ?? 1);
        if (lvl >= 5) throw new Error("Kasteel staat al op maximaal niveau (5).");
        const goldCost = 80 * lvl;
        const knowCost = 30 * lvl;
        const gold = Number(player.worldData.gold ?? 0);
        const knowledge = Number(player.worldData.knowledge ?? 0);
        if (gold < goldCost || knowledge < knowCost) {
          throw new Error(`Nodig: ${goldCost} goud en ${knowCost} kennis.`);
        }
        player.worldData.gold = gold - goldCost;
        player.worldData.knowledge = knowledge - knowCost;
        player.worldData.castleLevel = lvl + 1;
        player.worldData.population = Number(player.worldData.population ?? 50) + 40;
        player.score += 180;
      } else {
        const techId = String(payload.techId || "");
        const techs = Array.isArray(player.worldData.techs)
          ? [...(player.worldData.techs as string[])]
          : [];
        if (techs.includes(techId)) throw new Error("Technologie is al onderzocht.");
        const know = Number(player.worldData.knowledge ?? 0);
        if (know < 50) throw new Error("Minimaal 50 kennis nodig voor onderzoek.");
        player.worldData.knowledge = know - 50;
        techs.push(techId);
        player.worldData.techs = techs;
        player.worldData.food = Number(player.worldData.food ?? 100) + 35;
        player.score += 140;
      }
      this.recomputeProgressAndGrade(room, player);
    } else if (body.type === "trade_offer") {
      if (room.gameId !== "kingdoms") throw new Error("Ongeldige actie.");
      const offerRes = String(payload.offerResource) as "gold" | "food" | "knowledge";
      const reqRes = String(payload.requestResource) as "gold" | "food" | "knowledge";
      const offerAmt = Math.max(10, Math.min(200, Math.round(Number(payload.offerAmount) || 30)));
      const reqAmt = Math.max(10, Math.min(200, Math.round(Number(payload.requestAmount) || 30)));
      if (!["gold", "food", "knowledge"].includes(offerRes) || !["gold", "food", "knowledge"].includes(reqRes)) {
        throw new Error("Ongeldige grondstof.");
      }
      const curAmt = Number(player.worldData[offerRes] ?? 0);
      if (curAmt < offerAmt) throw new Error("Onvoldoende grondstoffen voor dit aanbod.");
      player.worldData[offerRes] = curAmt - offerAmt;
      const offer: MpTradeOffer = {
        id: `tr-${now}-${uid.slice(0, 4)}`,
        fromUid: uid,
        fromName: player.nickname,
        toUid: "",
        offerResource: offerRes,
        offerAmount: offerAmt,
        requestResource: reqRes,
        requestAmount: reqAmt,
        createdAt: now,
      };
      room.trades.unshift(offer);
      room.trades = room.trades.slice(0, 15);
    } else if (body.type === "trade_accept") {
      const tradeId = String(payload.tradeId || "");
      const offer = room.trades.find((t) => t.id === tradeId && !t.acceptedBy);
      if (!offer) throw new Error("Handelsaanbod is al geaccepteerd of bestaat niet meer.");
      if (offer.fromUid === uid) throw new Error("Je kunt niet met jezelf ruilen.");
      const myReqAmt = Number(player.worldData[offer.requestResource] ?? 0);
      if (myReqAmt < offer.requestAmount) {
        throw new Error("Je hebt niet genoeg grondstoffen om te ruilen.");
      }
      player.worldData[offer.requestResource] = myReqAmt - offer.requestAmount;
      player.worldData[offer.offerResource] =
        Number(player.worldData[offer.offerResource] ?? 0) + offer.offerAmount;
      const sender = room.players[offer.fromUid];
      if (sender) {
        sender.worldData[offer.requestResource] =
          Number(sender.worldData[offer.requestResource] ?? 0) + offer.requestAmount;
      }
      offer.acceptedBy = player.nickname;
      room.feed.unshift({
        id: `trdone-${now}`,
        uid,
        nickname: player.nickname,
        avatar: player.avatar,
        text: `ruilde grondstoffen met ${offer.fromName}!`,
        kind: "trade",
        createdAt: now,
      });
      room.feed = room.feed.slice(0, 40);
    } else if (body.type === "ecosystem_place") {
      if (room.gameId !== "ecosystem") throw new Error("Ongeldige actie.");
      const slotIdx = Number(payload.slotIndex);
      const itemKind = String(payload.itemKind || "");
      const SPECS: Record<string, { costE: number; flora: number; fauna: number; water: number }> = {
        boom: { costE: 15, flora: 18, fauna: 4, water: -4 },
        meer: { costE: 15, flora: 6, fauna: 4, water: 22 },
        vogel: { costE: 20, flora: -4, fauna: 20, water: -3 },
        bijen: { costE: 15, flora: 14, fauna: 12, water: 0 },
      };
      const sp = SPECS[itemKind];
      if (!sp || slotIdx < 0 || slotIdx >= 8) throw new Error("Ongeldig ecosysteem-vak.");
      const e = Number(player.worldData.energy ?? 0);
      if (e < sp.costE) throw new Error("Niet genoeg bio-energie. Beantwoord een bronvraag!");
      const slots = Array.isArray(player.worldData.slots)
        ? [...(player.worldData.slots as Array<string | null>)]
        : Array(8).fill(null);
      slots[slotIdx] = itemKind;
      player.worldData.slots = slots;
      player.worldData.energy = Math.max(0, e - sp.costE);
      player.worldData.flora = Math.max(0, Math.min(100, Number(player.worldData.flora ?? 40) + sp.flora));
      player.worldData.fauna = Math.max(0, Math.min(100, Number(player.worldData.fauna ?? 35) + sp.fauna));
      player.worldData.water = Math.max(0, Math.min(100, Number(player.worldData.water ?? 55) + sp.water));
      player.score += 80;
      this.recomputeProgressAndGrade(room, player);
    } else if (body.type === "workshop_update") {
      if (room.gameId !== "ultimate-workshop") throw new Error("Ongeldige actie.");
      const blueprint = Array.isArray(payload.blueprint)
        ? payload.blueprint.slice(0, 12).map((x) => (x ? String(x) : null))
        : Array(12).fill(null);
      const machineName = String(payload.machineName || "Mijn Uitvinding").trim().slice(0, 40);
      player.worldData.blueprint = blueprint;
      player.worldData.machineName = machineName || "Mijn Uitvinding";
      if (payload.runTest) {
        const filled = blueprint.filter(Boolean);
        const hasPower = filled.includes("battery") || filled.includes("thruster");
        const hasControl = filled.includes("gear") || filled.includes("sensor");
        const efficiency = Math.min(
          100,
          filled.length * 14 + (hasPower ? 20 : 0) + (hasControl ? 20 : 0)
        );
        const passed = filled.length >= 4 && hasPower && hasControl;
        player.worldData.lastTestScore = efficiency;
        player.worldData.testPassed = passed;
        if (passed) player.score += 150;
        const entry: MpWorkshopEntry = {
          uid,
          nickname: player.nickname,
          avatar: player.avatar,
          machineName: String(player.worldData.machineName),
          blueprint,
          efficiencyScore: efficiency,
          testPassed: passed,
          likes: room.workshopGallery.find((w) => w.uid === uid)?.likes || [],
          updatedAt: now,
        };
        room.workshopGallery = [
          entry,
          ...room.workshopGallery.filter((w) => w.uid !== uid),
        ].slice(0, 12);
        room.feed.unshift({
          id: `ws-${now}`,
          uid,
          nickname: player.nickname,
          avatar: player.avatar,
          text: `testte "${entry.machineName}" (${efficiency}% efficiëntie)!`,
          kind: "gallery",
          createdAt: now,
        });
        room.feed = room.feed.slice(0, 40);
      }
      this.recomputeProgressAndGrade(room, player);
    } else if (body.type === "workshop_like") {
      const targetUid = String(payload.targetUid || "");
      const entry = room.workshopGallery.find((w) => w.uid === targetUid);
      if (entry && !entry.likes.includes(uid)) {
        entry.likes.push(uid);
      }
    }

    this.save();
    this.broadcastRoom(roomCode);
    return {
      snapshot: this.toPublicSnapshot(room),
      result,
    };
  }

  private applyCorrectChallengeReward(
    room: ServerRoom,
    player: ServerPlayer,
    payload: Record<string, unknown>
  ) {
    if (room.gameId === "escape-together") {
      const station = Number(payload.station || player.answeredIds.length);
      const solved = Array.isArray(player.worldData.solvedStations)
        ? [...(player.worldData.solvedStations as number[])]
        : [];
      if (!solved.includes(station)) solved.push(station);
      player.worldData.solvedStations = solved;
      if (solved.length >= 5) player.worldData.escaped = true;
    } else if (room.gameId === "build-a-city") {
      player.worldData.coins = Number(player.worldData.coins ?? 120) + 65;
      player.worldData.energy = Number(player.worldData.energy ?? 2) + 2;
    } else if (room.gameId === "detective-agency") {
      const spot = Number(payload.spot || player.answeredIds.length);
      const spots = Array.isArray(player.worldData.investigatedSpots)
        ? [...(player.worldData.investigatedSpots as number[])]
        : [];
      if (!spots.includes(spot)) spots.push(spot);
      player.worldData.investigatedSpots = spots;
      if (spots.length >= 5) player.worldData.caseSolved = true;
    } else if (room.gameId === "kingdoms") {
      player.worldData.gold = Number(player.worldData.gold ?? 120) + 55;
      player.worldData.knowledge = Number(player.worldData.knowledge ?? 40) + 30;
      player.worldData.food = Number(player.worldData.food ?? 100) + 25;
    } else if (room.gameId === "knowledge-league") {
      const curRound = Math.min(3, Math.floor((player.answeredIds.length - 1) / 3));
      player.worldData.roundIndex = curRound;
    } else if (room.gameId === "expedition-earth") {
      const stage = Math.min(6, Number(player.worldData.stage ?? 0) + 1);
      player.worldData.stage = stage;
      player.worldData.supplies = Math.min(100, Number(player.worldData.supplies ?? 100) + 5);
    } else if (room.gameId === "ecosystem") {
      player.worldData.energy = Number(player.worldData.energy ?? 50) + 25;
      player.worldData.water = Math.min(100, Number(player.worldData.water ?? 55) + 8);
    } else if (room.gameId === "ultimate-workshop") {
      const inv = (player.worldData.partsInventory || {
        gear: 1,
        battery: 1,
        sensor: 0,
        thruster: 0,
        shield: 0,
      }) as Record<string, number>;
      const partPool = ["gear", "battery", "sensor", "thruster", "shield"];
      const earnedPart = partPool[player.answeredIds.length % partPool.length];
      inv[earnedPart] = (inv[earnedPart] || 0) + 1;
      player.worldData.partsInventory = inv;
    }
  }

  private recomputeProgressAndGrade(room: ServerRoom, player: ServerPlayer) {
    const targetTasks = Math.max(4, Math.min(room.challenges.length, 8));
    let pct = Math.min(100, Math.round((player.answeredIds.length / targetTasks) * 100));

    if (room.gameId === "build-a-city") {
      const built = Array.isArray(player.worldData.grid)
        ? (player.worldData.grid as Array<string | null>).filter(Boolean).length
        : 0;
      pct = Math.min(100, Math.round(((player.answeredIds.length + built) / (targetTasks + 5)) * 100));
    } else if (room.gameId === "ecosystem") {
      const slots = Array.isArray(player.worldData.slots)
        ? (player.worldData.slots as Array<string | null>).filter(Boolean).length
        : 0;
      pct = Math.min(100, Math.round(((player.answeredIds.length + slots) / (targetTasks + 4)) * 100));
    } else if (room.gameId === "ultimate-workshop" && player.worldData.testPassed) {
      pct = 100;
    } else if (room.gameId === "escape-together" && player.worldData.escaped) {
      pct = 100;
    } else if (room.gameId === "detective-agency" && player.worldData.caseSolved) {
      pct = 100;
    } else if (room.gameId === "expedition-earth" && Number(player.worldData.stage ?? 0) >= 6) {
      pct = 100;
    }

    player.progressPct = pct;
    player.completed = pct >= 100;
    player.grade = computeDutchGrade(player.correct, player.wrong, pct);
  }
}
