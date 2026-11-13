export type StudyItemType = 'note' | 'pdf';

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
}

export interface MemoryPair {
  id: string;
  term: string;
  definition: string;
}

export interface QuizQuestion {
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
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

export type AppSection =
  | 'dashboard'
  | 'files'
  | 'summaries'
  | 'games'
  | 'tools'
  | 'notebook';
