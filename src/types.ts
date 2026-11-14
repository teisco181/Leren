export type StudyItemType = 'note' | 'pdf' | 'docx' | 'pptx' | 'txt';

export type ThemePreference = 'light' | 'dark' | 'system';

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  themePreference?: ThemePreference;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Folder {
  id: string;
  ownerId: string;
  name: string;
  parentId: string;
  subject: string;
  color: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface StudyItem {
  id: string;
  ownerId: string;
  folderId: string;
  title: string;
  type: StudyItemType;
  subject: string;
  content: string;
  fileDataUrl: string;
  fileName: string;
  fileSize: number;
  driveFileId: string;
  driveUrl: string;
  mimeType: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ScheduleTask {
  id: string;
  ownerId: string;
  title: string;
  subject: string;
  date: string;
  durationMinutes: number;
  completed: boolean;
  notes: string;
  isAiGenerated: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface KeyTerm {
  term: string;
  definition: string;
}

export interface SelfTestQuestion {
  question: string;
  answer: string;
}

export interface Summary {
  id: string;
  ownerId: string;
  title: string;
  subject: string;
  sourceItemId: string;
  sourceTitle: string;
  content: string;
  keyTerms: KeyTerm[];
  selfTest: SelfTestQuestion[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface Flashcard {
  front: string;
  back: string;
  sourceTitle?: string;
  sourceSection?: string;
}

export interface MemoryPair {
  id: string;
  term: string;
  definition: string;
  sourceTitle?: string;
  sourceSection?: string;
}

export interface QuizQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  difficulty?: 'easy' | 'normal' | 'hard';
  sourceTitle?: string;
  sourceSection?: string;
}

export interface MaterialFileStatus {
  itemId: string;
  title: string;
  type: StudyItemType;
  readable: boolean;
  charCount: number;
  warning?: string;
  topics: string[];
}

export interface AnalyzedTopic {
  name: string;
  sourceTitle: string;
  sourceSection: string;
  factCount: number;
}

export interface GroundedConcept {
  id: string;
  term: string;
  definition: string;
  cleanWord: string;
  sourceTitle: string;
  sourceSection: string;
}

export interface GroundedQuestion extends QuizQuestion {
  difficulty: 'easy' | 'normal' | 'hard';
  sourceTitle: string;
  sourceSection: string;
}

export interface GroundedSortRound {
  topicTitle: string;
  buckets: [string, string];
  items: Array<{
    label: string;
    bucketIndex: 0 | 1;
    sourceTitle: string;
    sourceSection: string;
  }>;
  sourceTitle: string;
}

export interface GroundedPuzzle {
  id: string;
  kind: 'code' | 'sequence' | 'deduction' | 'clue';
  prompt: string;
  options: string[];
  answer: string;
  hint: string;
  explanation: string;
  sourceTitle: string;
  sourceSection: string;
}

export interface AnalyzedMaterial {
  id: string;
  title: string;
  subject: string;
  selectedFolderIds: string[];
  selectedItemIds: string[];
  fileStatuses: MaterialFileStatus[];
  topics: AnalyzedTopic[];
  concepts: GroundedConcept[];
  questions: GroundedQuestion[];
  sortRounds: GroundedSortRound[];
  puzzles: GroundedPuzzle[];
  warnings: string[];
  analyzedAt: number;
}

export interface StudySet {
  id: string;
  ownerId: string;
  title: string;
  subject: string;
  sourceTitle: string;
  flashcards: Flashcard[];
  pairs: MemoryPair[];
  questions: QuizQuestion[];
  selectedFolderIds?: string[];
  selectedItemIds?: string[];
  topics?: AnalyzedTopic[];
  sortRounds?: GroundedSortRound[];
  puzzles?: GroundedPuzzle[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface SoloGameSession {
  id: string;
  ownerId: string;
  gameId: string;
  gameTitle: string;
  difficulty: 'easy' | 'normal' | 'hard';
  material: string; // JSON-serialized AnalyzedMaterial
  progress: string; // JSON-serialized in-game progress
  score: number;
  completed: boolean;
  updatedAtMs: number;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface ExternalTool {
  id: string;
  ownerId: string;
  name: string;
  url: string;
  subjectLabel: string;
  color: string;
  iconName: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

// Legacy Firestore multiplayer types (retained for backwards compatibility with legacy /join codes)
export type MultiplayerMode = 'quiz' | 'speed-match';
export type RoomStatus = 'lobby' | 'question' | 'leaderboard' | 'finished';

export interface GameRoom {
  roomCode: string;
  hostId: string;
  hostName: string;
  title: string;
  gameMode: MultiplayerMode;
  status: RoomStatus;
  currentQuestionIndex: number;
  questionStartedAt: number;
  questions: QuizQuestion[];
  pairs: MemoryPair[];
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface GamePlayer {
  uid: string;
  nickname: string;
  avatar: string;
  score: number;
  streak: number;
  lastAnswerIndex: number;
  lastAnswerCorrect: boolean;
  lastAnsweredQuestion: number;
  lastPointsEarned: number;
  joinedAt?: unknown;
  updatedAt?: unknown;
}

// New Server-Authoritative Multiplayer Platform Types (8 games)
export type MultiplayerGameId =
  | 'escape-together'
  | 'build-a-city'
  | 'detective-agency'
  | 'kingdoms'
  | 'knowledge-league'
  | 'expedition-earth'
  | 'ecosystem'
  | 'ultimate-workshop';

export type MpRoomStatus = 'lobby' | 'active' | 'waiting' | 'ended' | 'expired';

export interface MpFeedEntry {
  id: string;
  uid: string;
  nickname: string;
  avatar: string;
  text: string;
  kind: 'progress' | 'clue' | 'trade' | 'gallery' | 'rating' | 'system';
  createdAt: number;
  payload?: Record<string, unknown>;
}

export interface MpTradeOffer {
  id: string;
  fromUid: string;
  fromName: string;
  toUid: string; // '' = open for anyone
  offerResource: 'gold' | 'food' | 'knowledge';
  offerAmount: number;
  requestResource: 'gold' | 'food' | 'knowledge';
  requestAmount: number;
  acceptedBy?: string;
  createdAt: number;
}

export interface MpWorkshopEntry {
  uid: string;
  nickname: string;
  avatar: string;
  machineName: string;
  blueprint: Array<string | null>; // 12 slots (4x3)
  efficiencyScore: number;
  testPassed: boolean;
  likes: string[];
  updatedAt: number;
}

export interface MpPlayerPublic {
  uid: string;
  nickname: string;
  avatar: string;
  role: 'host' | 'player';
  online: boolean;
  lastSeenAt: number;
  score: number;
  correct: number;
  wrong: number;
  streak: number;
  progressPct: number;
  completed: boolean;
  grade: number;
  worldData: Record<string, unknown>;
}

export interface MpChallengeItem {
  id: string;
  kind: 'mcq' | 'concept' | 'puzzle';
  prompt: string;
  options: string[];
  hint?: string;
  sourceTitle: string;
  sourceSection: string;
  // Note: correctIndex & answer are NEVER sent to client before answering!
}

export interface MpRoomSnapshot {
  roomCode: string;
  gameId: MultiplayerGameId;
  title: string;
  hostId: string;
  hostName: string;
  status: MpRoomStatus;
  difficulty: 'easy' | 'normal' | 'hard';
  durationMinutes: number;
  maxPlayers: number;
  createdAt: number;
  startedAt: number | null;
  waitingSince: number | null;
  waitingExpiresAt: number | null;
  endedAt: number | null;
  sourceSummary: {
    title: string;
    subject: string;
    fileTitles: string[];
    topics: AnalyzedTopic[];
    conceptCount: number;
    questionCount: number;
  };
  players: MpPlayerPublic[];
  feed: MpFeedEntry[];
  trades: MpTradeOffer[];
  workshopGallery: MpWorkshopEntry[];
  cityRatings: Record<string, Record<string, number>>; // targetUid -> raterUid -> stars
}

export interface MpMyRoomSummary {
  roomCode: string;
  gameId: MultiplayerGameId;
  title: string;
  hostId: string;
  hostName: string;
  isHost: boolean;
  status: MpRoomStatus;
  playerCount: number;
  onlineCount: number;
  maxPlayers: number;
  waitingExpiresAt: number | null;
  myScore: number;
  myProgressPct: number;
  myCompleted: boolean;
  fileTitles: string[];
  createdAt: number;
}

export type AppSection =
  | 'dashboard'
  | 'files'
  | 'summaries'
  | 'games'
  | 'practice'
  | 'tools'
  | 'notebook';

// ============================================================================
// AI Oefenen – Persoonlijk leren met AI
// ============================================================================

export type PracticeQuestionTypeMode = 'open' | 'mc' | 'both';
export type PracticeMode = 'free' | 'weak' | 'exam' | 'repeat' | 'topic';
export type PracticeDifficulty = 'easy' | 'normal' | 'hard';
export type PracticeDifficultyMode = 'adaptive' | PracticeDifficulty;
export type PracticeCheckTiming = 'immediate' | 'end';

export interface PracticeUserSettings {
  questionTypeMode: PracticeQuestionTypeMode;
  allowMultiCorrectMc: boolean;
  questionCount: number;
  difficultyMode: PracticeDifficultyMode;
  timeLimitMinutes: number; // 0 = geen tijdslimiet
  hintsEnabled: boolean;
  checkTiming: PracticeCheckTiming;
}

export interface PracticeMaterialSelection {
  id: string;
  name: string;
  subject: string;
  selectedFolderIds: string[];
  selectedItemIds: string[];
  fileStatuses: MaterialFileStatus[];
  topics: AnalyzedTopic[];
  warnings: string[];
  createdAt: number;
  updatedAt: number;
}

export interface TopicMasteryEntry {
  date: number;
  score0to1: number;
  difficulty: PracticeDifficulty;
  questionType: 'open' | 'mc-single' | 'mc-multi';
  status: 'correct' | 'partial' | 'wrong' | 'unverifiable';
}

export interface TopicMasteryRecord {
  key: string;
  topic: string;
  subject: string;
  sourceTitle: string;
  masteryPct: number;
  totalAttempts: number;
  correctCount: number;
  partialCount: number;
  wrongCount: number;
  consecutiveCorrect: number;
  consecutiveWrong: number;
  recommendedDifficulty: PracticeDifficulty;
  weakAspects: string[];
  lastPracticedAt: number;
  history: TopicMasteryEntry[];
}

export interface PracticeQuestionPublic {
  id: string;
  type: 'open' | 'mc-single' | 'mc-multi';
  topic: string;
  subject: string;
  difficulty: PracticeDifficulty;
  prompt: string;
  options?: string[];
  multiSelectCount?: number;
  hint?: string;
  sourceTitle: string;
  sourceSection: string;
  targetedWeakAspect?: string;
  isVariantOf?: string;
}

export interface PracticeAnswerFeedback {
  questionId: string;
  typedAnswer?: string;
  selectedIndices?: number[];
  status: 'correct' | 'partial' | 'wrong' | 'unverifiable';
  score0to1: number;
  feedback: string;
  whatWasRight?: string;
  missingPoints: string[];
  explanation: string;
  referenceAnswer: string;
  correctOptionTexts?: string[];
  sourceTitle: string;
  sourceSection: string;
  answeredAt: number;
}

export interface PracticeSessionPublic {
  id: string;
  selectionId: string;
  selectionName: string;
  subject: string;
  mode: PracticeMode;
  focusTopic?: string;
  settings: PracticeUserSettings;
  fileTitles: string[];
  topics: AnalyzedTopic[];
  questions: PracticeQuestionPublic[];
  answers: Record<string, PracticeAnswerFeedback>;
  draftAnswers?: Record<string, { typedAnswer?: string; selectedIndices?: number[] }>;
  currentIndex: number;
  status: 'active' | 'completed';
  startedAt: number;
  updatedAt: number;
  completedAt?: number;
  examGrade?: number;
  correctCount: number;
  partialCount: number;
  wrongCount: number;
  aiRecommendation?: string;
  materialNotice?: string;
}

export interface PracticeTimelinePoint {
  date: string;
  avgScorePct: number;
  count: number;
}

export interface PracticeDashboardState {
  savedSelections: PracticeMaterialSelection[];
  topicMastery: TopicMasteryRecord[];
  sessions: PracticeSessionPublic[];
  settings: PracticeUserSettings;
  historyTimeline: PracticeTimelinePoint[];
  aiSuggestion: string;
  aiNextAction?: {
    label: string;
    mode: PracticeMode;
    focusTopic?: string;
    selectionId?: string;
  };
}

