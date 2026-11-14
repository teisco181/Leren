import {
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  onSnapshot,
  query,
  where,
  serverTimestamp,
  writeBatch,
  Unsubscribe,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import {
  Folder,
  StudyItem,
  StudyItemType,
  ScheduleTask,
  Summary,
  StudySet,
  SoloGameSession,
  ExternalTool,
  ToolFolder,
  GameRoom,
  GamePlayer,
  MultiplayerMode,
  RoomStatus,
} from '../types';

function makeId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now()}_${rand}`.replace(/[^a-zA-Z0-9_-]/g, '');
}

function getTimestampSeconds(ts: unknown): number {
  if (ts && typeof ts === 'object' && 'seconds' in ts) {
    return Number((ts as { seconds?: number }).seconds) || 0;
  }
  return 0;
}

// --- Subscriptions ---
export function subscribeFolders(
  userId: string,
  onData: (folders: Folder[]) => void
): Unsubscribe {
  const path = `users/${userId}/folders`;
  const q = query(collection(db, path), where('ownerId', '==', userId));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Folder));
      list.sort((a, b) => a.name.localeCompare(b.name, 'nl'));
      onData(list);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, path)
  );
}

export function subscribeItems(
  userId: string,
  onData: (items: StudyItem[]) => void
): Unsubscribe {
  const path = `users/${userId}/items`;
  const q = query(collection(db, path), where('ownerId', '==', userId));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as StudyItem));
      list.sort((a, b) => getTimestampSeconds(b.updatedAt) - getTimestampSeconds(a.updatedAt));
      onData(list);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, path)
  );
}

export function subscribeScheduleTasks(
  userId: string,
  onData: (tasks: ScheduleTask[]) => void
): Unsubscribe {
  const path = `users/${userId}/scheduleTasks`;
  const q = query(collection(db, path), where('ownerId', '==', userId));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as ScheduleTask));
      list.sort((a, b) => a.date.localeCompare(b.date));
      onData(list);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, path)
  );
}

export function subscribeSummaries(
  userId: string,
  onData: (summaries: Summary[]) => void
): Unsubscribe {
  const path = `users/${userId}/summaries`;
  const q = query(collection(db, path), where('ownerId', '==', userId));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Summary));
      list.sort((a, b) => getTimestampSeconds(b.updatedAt) - getTimestampSeconds(a.updatedAt));
      onData(list);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, path)
  );
}

export function subscribeStudySets(
  userId: string,
  onData: (sets: StudySet[]) => void
): Unsubscribe {
  const path = `users/${userId}/studySets`;
  const q = query(collection(db, path), where('ownerId', '==', userId));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as StudySet));
      list.sort((a, b) => getTimestampSeconds(b.updatedAt) - getTimestampSeconds(a.updatedAt));
      onData(list);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, path)
  );
}

export function subscribeSoloGameSessions(
  userId: string,
  onData: (sessions: SoloGameSession[]) => void
): Unsubscribe {
  const path = `users/${userId}/soloGameSessions`;
  const q = query(collection(db, path), where('ownerId', '==', userId));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as SoloGameSession));
      list.sort((a, b) => (b.updatedAtMs || 0) - (a.updatedAtMs || 0));
      onData(list);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, path)
  );
}

export function subscribeExternalTools(
  userId: string,
  onData: (tools: ExternalTool[]) => void
): Unsubscribe {
  const path = `users/${userId}/externalTools`;
  const q = query(collection(db, path), where('ownerId', '==', userId));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as ExternalTool));
      list.sort((a, b) => {
        const ao = typeof a.sortOrder === 'number' ? a.sortOrder : Number.MAX_SAFE_INTEGER;
        const bo = typeof b.sortOrder === 'number' ? b.sortOrder : Number.MAX_SAFE_INTEGER;
        if (ao !== bo) return ao - bo;
        return getTimestampSeconds(a.createdAt) - getTimestampSeconds(b.createdAt);
      });
      onData(list);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, path)
  );
}

export function subscribeToolFolders(
  userId: string,
  onData: (folders: ToolFolder[]) => void
): Unsubscribe {
  const path = `users/${userId}/toolFolders`;
  const q = query(collection(db, path), where('ownerId', '==', userId));
  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as ToolFolder));
      list.sort((a, b) => {
        const ao = typeof a.sortOrder === 'number' ? a.sortOrder : Number.MAX_SAFE_INTEGER;
        const bo = typeof b.sortOrder === 'number' ? b.sortOrder : Number.MAX_SAFE_INTEGER;
        if (ao !== bo) return ao - bo;
        return a.name.localeCompare(b.name, 'nl');
      });
      onData(list);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, path)
  );
}

// --- Folders CRUD ---
export async function createFolder(
  userId: string,
  input: { name: string; parentId?: string; subject?: string; color?: string }
): Promise<string> {
  const id = makeId('fld');
  const path = `users/${userId}/folders/${id}`;
  try {
    await setDoc(doc(db, path), {
      ownerId: userId,
      name: input.name.trim().slice(0, 100),
      parentId: (input.parentId || '').slice(0, 128),
      subject: (input.subject || '').trim().slice(0, 80),
      color: (input.color || '#4F46E5').slice(0, 30),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function updateFolder(
  userId: string,
  folderId: string,
  updates: Partial<Pick<Folder, 'name' | 'parentId' | 'subject' | 'color'>>
): Promise<void> {
  const path = `users/${userId}/folders/${folderId}`;
  const clean: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (updates.name !== undefined) clean.name = updates.name.trim().slice(0, 100);
  if (updates.parentId !== undefined) clean.parentId = updates.parentId.slice(0, 128);
  if (updates.subject !== undefined) clean.subject = updates.subject.trim().slice(0, 80);
  if (updates.color !== undefined) clean.color = updates.color.slice(0, 30);
  try {
    await updateDoc(doc(db, path), clean);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function deleteFolder(userId: string, folderId: string): Promise<void> {
  const path = `users/${userId}/folders/${folderId}`;
  try {
    await deleteDoc(doc(db, path));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

// --- Study Items CRUD ---
export async function createStudyItem(
  userId: string,
  input: {
    folderId?: string;
    title: string;
    type: StudyItemType;
    subject?: string;
    content?: string;
    fileDataUrl?: string;
    fileName?: string;
    fileSize?: number;
    driveFileId?: string;
    driveUrl?: string;
    mimeType?: string;
  }
): Promise<string> {
  const id = makeId('itm');
  const path = `users/${userId}/items/${id}`;
  const safeFileDataUrl =
    input.fileDataUrl && input.fileDataUrl.length <= 680000 ? input.fileDataUrl : '';
  try {
    await setDoc(doc(db, path), {
      ownerId: userId,
      folderId: (input.folderId || '').slice(0, 128),
      title: input.title.trim().slice(0, 160) || 'Naamloos document',
      type: input.type,
      subject: (input.subject || '').trim().slice(0, 80),
      content: (input.content || '').slice(0, 290000),
      fileDataUrl: safeFileDataUrl,
      fileName: (input.fileName || '').slice(0, 200),
      fileSize: Math.max(0, Math.min(Number(input.fileSize) || 0, 50000000)),
      driveFileId: (input.driveFileId || '').slice(0, 200),
      driveUrl: (input.driveUrl || '').slice(0, 500),
      mimeType: (input.mimeType || '').slice(0, 120),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function updateStudyItem(
  userId: string,
  itemId: string,
  updates: Partial<
    Pick<
      StudyItem,
      | 'folderId'
      | 'title'
      | 'subject'
      | 'content'
      | 'fileDataUrl'
      | 'fileName'
      | 'fileSize'
      | 'driveFileId'
      | 'driveUrl'
      | 'mimeType'
    >
  >
): Promise<void> {
  const path = `users/${userId}/items/${itemId}`;
  const clean: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (updates.folderId !== undefined) clean.folderId = updates.folderId.slice(0, 128);
  if (updates.title !== undefined) clean.title = updates.title.trim().slice(0, 160) || 'Naamloos';
  if (updates.subject !== undefined) clean.subject = updates.subject.trim().slice(0, 80);
  if (updates.content !== undefined) clean.content = updates.content.slice(0, 290000);
  if (updates.fileDataUrl !== undefined) {
    clean.fileDataUrl =
      updates.fileDataUrl.length <= 680000 ? updates.fileDataUrl : '';
  }
  if (updates.fileName !== undefined) clean.fileName = updates.fileName.slice(0, 200);
  if (updates.fileSize !== undefined) clean.fileSize = updates.fileSize;
  if (updates.driveFileId !== undefined) clean.driveFileId = updates.driveFileId.slice(0, 200);
  if (updates.driveUrl !== undefined) clean.driveUrl = updates.driveUrl.slice(0, 500);
  if (updates.mimeType !== undefined) clean.mimeType = updates.mimeType.slice(0, 120);

  try {
    await updateDoc(doc(db, path), clean);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function deleteStudyItem(userId: string, itemId: string): Promise<void> {
  const path = `users/${userId}/items/${itemId}`;
  try {
    await deleteDoc(doc(db, path));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

// --- Schedule Tasks CRUD ---
export async function createScheduleTask(
  userId: string,
  input: {
    title: string;
    subject: string;
    date: string;
    durationMinutes: number;
    notes?: string;
    isAiGenerated?: boolean;
  }
): Promise<string> {
  const id = makeId('tsk');
  const path = `users/${userId}/scheduleTasks/${id}`;
  try {
    await setDoc(doc(db, path), {
      ownerId: userId,
      title: input.title.trim().slice(0, 160),
      subject: (input.subject || 'Algemeen').trim().slice(0, 80),
      date: input.date,
      durationMinutes: Math.max(1, Math.min(Math.round(input.durationMinutes) || 30, 600)),
      completed: false,
      notes: (input.notes || '').trim().slice(0, 1000),
      isAiGenerated: Boolean(input.isAiGenerated),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function createManyScheduleTasks(
  userId: string,
  tasks: Array<{
    title: string;
    subject: string;
    date: string;
    durationMinutes: number;
    notes?: string;
  }>
): Promise<void> {
  const path = `users/${userId}/scheduleTasks`;
  try {
    const batch = writeBatch(db);
    for (const t of tasks.slice(0, 40)) {
      const id = makeId('tsk');
      batch.set(doc(db, path, id), {
        ownerId: userId,
        title: t.title.trim().slice(0, 160),
        subject: (t.subject || 'Algemeen').trim().slice(0, 80),
        date: /^\d{4}-\d{2}-\d{2}$/.test(t.date)
          ? t.date
          : new Date().toISOString().slice(0, 10),
        durationMinutes: Math.max(1, Math.min(Math.round(t.durationMinutes) || 30, 600)),
        completed: false,
        notes: (t.notes || '').trim().slice(0, 1000),
        isAiGenerated: true,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function updateScheduleTask(
  userId: string,
  taskId: string,
  updates: Partial<Pick<ScheduleTask, 'title' | 'subject' | 'date' | 'durationMinutes' | 'completed' | 'notes'>>
): Promise<void> {
  const path = `users/${userId}/scheduleTasks/${taskId}`;
  const clean: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (updates.title !== undefined) clean.title = updates.title.trim().slice(0, 160);
  if (updates.subject !== undefined) clean.subject = updates.subject.trim().slice(0, 80);
  if (updates.date !== undefined) clean.date = updates.date;
  if (updates.durationMinutes !== undefined) {
    clean.durationMinutes = Math.max(1, Math.min(Math.round(updates.durationMinutes), 600));
  }
  if (updates.completed !== undefined) clean.completed = Boolean(updates.completed);
  if (updates.notes !== undefined) clean.notes = updates.notes.trim().slice(0, 1000);
  try {
    await updateDoc(doc(db, path), clean);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function deleteScheduleTask(userId: string, taskId: string): Promise<void> {
  const path = `users/${userId}/scheduleTasks/${taskId}`;
  try {
    await deleteDoc(doc(db, path));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

// --- Summaries CRUD ---
export async function createSummary(
  userId: string,
  input: Omit<Summary, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const id = makeId('sum');
  const path = `users/${userId}/summaries/${id}`;
  try {
    await setDoc(doc(db, path), {
      ownerId: userId,
      title: input.title.trim().slice(0, 160),
      subject: (input.subject || 'Algemeen').trim().slice(0, 80),
      sourceItemId: (input.sourceItemId || '').slice(0, 128),
      sourceTitle: (input.sourceTitle || '').slice(0, 160),
      content: input.content.slice(0, 190000),
      keyTerms: (input.keyTerms || []).slice(0, 30),
      selfTest: (input.selfTest || []).slice(0, 20),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function updateSummary(
  userId: string,
  summaryId: string,
  updates: Partial<Omit<Summary, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>>
): Promise<void> {
  const path = `users/${userId}/summaries/${summaryId}`;
  const clean: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (updates.title !== undefined) clean.title = updates.title.trim().slice(0, 160);
  if (updates.subject !== undefined) clean.subject = updates.subject.trim().slice(0, 80);
  if (updates.sourceItemId !== undefined) clean.sourceItemId = updates.sourceItemId.slice(0, 128);
  if (updates.sourceTitle !== undefined) clean.sourceTitle = updates.sourceTitle.slice(0, 160);
  if (updates.content !== undefined) clean.content = updates.content.slice(0, 190000);
  if (updates.keyTerms !== undefined) clean.keyTerms = updates.keyTerms.slice(0, 30);
  if (updates.selfTest !== undefined) clean.selfTest = updates.selfTest.slice(0, 20);
  try {
    await updateDoc(doc(db, path), clean);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function deleteSummary(userId: string, summaryId: string): Promise<void> {
  const path = `users/${userId}/summaries/${summaryId}`;
  try {
    await deleteDoc(doc(db, path));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

// --- Study Sets CRUD ---
export async function createStudySet(
  userId: string,
  input: Omit<StudySet, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const id = makeId('set');
  const path = `users/${userId}/studySets/${id}`;
  const payload: Record<string, unknown> = {
    ownerId: userId,
    title: input.title.trim().slice(0, 160),
    subject: (input.subject || 'Algemeen').trim().slice(0, 80),
    sourceTitle: (input.sourceTitle || '').slice(0, 160),
    flashcards: (input.flashcards || []).slice(0, 40),
    pairs: (input.pairs || []).slice(0, 30),
    questions: (input.questions || []).slice(0, 30),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
  if (input.selectedFolderIds) payload.selectedFolderIds = input.selectedFolderIds.slice(0, 50);
  if (input.selectedItemIds) payload.selectedItemIds = input.selectedItemIds.slice(0, 100);
  if (input.topics) payload.topics = input.topics.slice(0, 40);
  if (input.sortRounds) payload.sortRounds = input.sortRounds.slice(0, 10);
  if (input.puzzles) payload.puzzles = input.puzzles.slice(0, 20);
  try {
    await setDoc(doc(db, path), payload);
    return id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function deleteStudySet(userId: string, setId: string): Promise<void> {
  const path = `users/${userId}/studySets/${setId}`;
  try {
    await deleteDoc(doc(db, path));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

// --- Saved Singleplayer Game Sessions ---
export async function createSoloGameSession(
  userId: string,
  input: {
    gameId: string;
    gameTitle: string;
    difficulty: 'easy' | 'normal' | 'hard';
    material: string;
    progress: string;
    score: number;
    completed: boolean;
  }
): Promise<string> {
  const id = makeId('solo');
  const path = `users/${userId}/soloGameSessions/${id}`;
  try {
    await setDoc(doc(db, path), {
      ownerId: userId,
      gameId: input.gameId.slice(0, 64),
      gameTitle: input.gameTitle.slice(0, 160),
      difficulty: input.difficulty,
      material: input.material.slice(0, 340000),
      progress: input.progress.slice(0, 140000),
      score: Math.max(0, Math.round(input.score || 0)),
      completed: Boolean(input.completed),
      updatedAtMs: Date.now(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function updateSoloGameSession(
  userId: string,
  sessionId: string,
  updates: {
    difficulty?: 'easy' | 'normal' | 'hard';
    progress: string;
    score: number;
    completed: boolean;
  }
): Promise<void> {
  const path = `users/${userId}/soloGameSessions/${sessionId}`;
  const clean: Record<string, unknown> = {
    progress: updates.progress.slice(0, 140000),
    score: Math.max(0, Math.round(updates.score || 0)),
    completed: Boolean(updates.completed),
    updatedAtMs: Date.now(),
    updatedAt: serverTimestamp(),
  };
  if (updates.difficulty) clean.difficulty = updates.difficulty;
  try {
    await updateDoc(doc(db, path), clean);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function deleteSoloGameSession(userId: string, sessionId: string): Promise<void> {
  const path = `users/${userId}/soloGameSessions/${sessionId}`;
  try {
    await deleteDoc(doc(db, path));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

// --- External Tools CRUD ---
export async function seedDefaultExternalTools(userId: string): Promise<void> {
  const defaults = [
    {
      name: 'StudyGo',
      url: 'https://studygo.com/nl/',
      subjectLabel: 'Woordjes & Toetsen',
      description: 'Woordjes, definities en oefentoetsen stampen voor alle vakken.',
      gradeYear: '',
      level: 'Alle niveaus',
      sortOrder: 0,
      folderIds: [] as string[],
      color: '#2563EB',
      iconName: 'BookOpen',
    },
    {
      name: 'Quizlet',
      url: 'https://quizlet.com/nl',
      subjectLabel: 'Flashcards',
      description: 'Begrippen en vertalingen herhalen met flashcards en toetsen.',
      gradeYear: '',
      level: 'Alle niveaus',
      sortOrder: 1,
      folderIds: [] as string[],
      color: '#4F46E5',
      iconName: 'Layers',
    },
    {
      name: 'Gimkit',
      url: 'https://www.gimkit.com/',
      subjectLabel: 'Live Quiz Games',
      description: 'Interactieve quizspellen om leerstof klassikaal of zelf te oefenen.',
      gradeYear: '',
      level: 'Alle niveaus',
      sortOrder: 2,
      folderIds: [] as string[],
      color: '#059669',
      iconName: 'Gamepad2',
    },
  ];
  const path = `users/${userId}/externalTools`;
  try {
    const batch = writeBatch(db);
    for (const tool of defaults) {
      const id = makeId('tool');
      batch.set(doc(db, path, id), {
        ownerId: userId,
        ...tool,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function createExternalTool(
  userId: string,
  input: Omit<ExternalTool, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>
): Promise<string> {
  const id = makeId('tool');
  const path = `users/${userId}/externalTools/${id}`;
  const cleanFolderIds = Array.isArray(input.folderIds)
    ? Array.from(new Set(input.folderIds.map((f) => f.trim()).filter(Boolean))).slice(0, 25)
    : [];
  const safeSort =
    typeof input.sortOrder === 'number' && Number.isFinite(input.sortOrder)
      ? Math.max(0, Math.min(Math.round(input.sortOrder), 100000))
      : 0;
  try {
    await setDoc(doc(db, path), {
      ownerId: userId,
      name: input.name.trim().slice(0, 80),
      url: input.url.trim().slice(0, 500),
      subjectLabel: input.subjectLabel.trim().slice(0, 80),
      description: (input.description || '').trim().slice(0, 240),
      gradeYear: (input.gradeYear || '').trim().slice(0, 40),
      level: (input.level || '').trim().slice(0, 40),
      sortOrder: safeSort,
      folderIds: cleanFolderIds,
      color: input.color.slice(0, 30),
      iconName: input.iconName.slice(0, 40),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function updateExternalTool(
  userId: string,
  toolId: string,
  updates: Partial<Omit<ExternalTool, 'id' | 'ownerId' | 'createdAt' | 'updatedAt'>>
): Promise<void> {
  const path = `users/${userId}/externalTools/${toolId}`;
  const clean: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (updates.name !== undefined) clean.name = updates.name.trim().slice(0, 80);
  if (updates.url !== undefined) clean.url = updates.url.trim().slice(0, 500);
  if (updates.subjectLabel !== undefined) clean.subjectLabel = updates.subjectLabel.trim().slice(0, 80);
  if (updates.description !== undefined) clean.description = updates.description.trim().slice(0, 240);
  if (updates.gradeYear !== undefined) clean.gradeYear = updates.gradeYear.trim().slice(0, 40);
  if (updates.level !== undefined) clean.level = updates.level.trim().slice(0, 40);
  if (updates.sortOrder !== undefined && Number.isFinite(updates.sortOrder)) {
    clean.sortOrder = Math.max(0, Math.min(Math.round(updates.sortOrder), 100000));
  }
  if (updates.folderIds !== undefined) {
    clean.folderIds = Array.from(
      new Set(updates.folderIds.map((f) => f.trim()).filter(Boolean))
    ).slice(0, 25);
  }
  if (updates.color !== undefined) clean.color = updates.color.slice(0, 30);
  if (updates.iconName !== undefined) clean.iconName = updates.iconName.slice(0, 40);
  try {
    await updateDoc(doc(db, path), clean);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function deleteExternalTool(userId: string, toolId: string): Promise<void> {
  const path = `users/${userId}/externalTools/${toolId}`;
  try {
    await deleteDoc(doc(db, path));
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

export async function reorderExternalTools(
  userId: string,
  orderedToolIds: string[]
): Promise<void> {
  const path = `users/${userId}/externalTools`;
  if (orderedToolIds.length === 0) return;
  try {
    const batch = writeBatch(db);
    orderedToolIds.forEach((id, idx) => {
      batch.update(doc(db, path, id), {
        sortOrder: idx,
        updatedAt: serverTimestamp(),
      });
    });
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

// --- Tool Folders CRUD (Leertools Hub Mappen) ---
export async function createToolFolder(
  userId: string,
  input: { name: string; description?: string; color?: string; sortOrder?: number }
): Promise<string> {
  const id = makeId('tfld');
  const path = `users/${userId}/toolFolders/${id}`;
  const safeSort =
    typeof input.sortOrder === 'number' && Number.isFinite(input.sortOrder)
      ? Math.max(0, Math.min(Math.round(input.sortOrder), 100000))
      : 0;
  try {
    await setDoc(doc(db, path), {
      ownerId: userId,
      name: input.name.trim().slice(0, 80) || 'Nieuwe map',
      description: (input.description || '').trim().slice(0, 240),
      color: (input.color || '#4F46E5').slice(0, 30),
      sortOrder: safeSort,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return id;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function updateToolFolder(
  userId: string,
  folderId: string,
  updates: Partial<Pick<ToolFolder, 'name' | 'description' | 'color' | 'sortOrder'>>
): Promise<void> {
  const path = `users/${userId}/toolFolders/${folderId}`;
  const clean: Record<string, unknown> = { updatedAt: serverTimestamp() };
  if (updates.name !== undefined) clean.name = updates.name.trim().slice(0, 80);
  if (updates.description !== undefined) clean.description = updates.description.trim().slice(0, 240);
  if (updates.color !== undefined) clean.color = updates.color.slice(0, 30);
  if (updates.sortOrder !== undefined && Number.isFinite(updates.sortOrder)) {
    clean.sortOrder = Math.max(0, Math.min(Math.round(updates.sortOrder), 100000));
  }
  try {
    await updateDoc(doc(db, path), clean);
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function deleteToolFolder(
  userId: string,
  folderId: string,
  toolsReferencing: ExternalTool[]
): Promise<void> {
  const folderPath = `users/${userId}/toolFolders/${folderId}`;
  try {
    const batch = writeBatch(db);
    batch.delete(doc(db, folderPath));
    for (const tool of toolsReferencing) {
      const currentFolders = Array.isArray(tool.folderIds) ? tool.folderIds : [];
      if (currentFolders.includes(folderId)) {
        batch.update(doc(db, `users/${userId}/externalTools`, tool.id), {
          folderIds: currentFolders.filter((fid) => fid !== folderId),
          updatedAt: serverTimestamp(),
        });
      }
    }
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, folderPath);
  }
}

export async function reorderToolFolders(
  userId: string,
  orderedFolderIds: string[]
): Promise<void> {
  const path = `users/${userId}/toolFolders`;
  if (orderedFolderIds.length === 0) return;
  try {
    const batch = writeBatch(db);
    orderedFolderIds.forEach((id, idx) => {
      batch.update(doc(db, path, id), {
        sortOrder: idx,
        updatedAt: serverTimestamp(),
      });
    });
    await batch.commit();
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

// --- Real-Time Multiplayer Game Rooms ---
export async function createMultiplayerRoom(input: {
  hostId: string;
  hostName: string;
  title: string;
  gameMode: MultiplayerMode;
  questions: StudySet['questions'];
  pairs: StudySet['pairs'];
}): Promise<string> {
  // Generate unique 6-digit code
  let roomCode = '';
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = String(Math.floor(100000 + Math.random() * 900000));
    const snap = await getDoc(doc(db, 'gameRooms', candidate));
    if (!snap.exists()) {
      roomCode = candidate;
      break;
    }
  }
  if (!roomCode) {
    roomCode = String(Math.floor(100000 + Math.random() * 900000));
  }

  const path = `gameRooms/${roomCode}`;
  try {
    await setDoc(doc(db, path), {
      roomCode,
      hostId: input.hostId,
      hostName: input.hostName.trim().slice(0, 80) || 'Host',
      title: input.title.trim().slice(0, 160),
      gameMode: input.gameMode,
      status: 'lobby' as RoomStatus,
      currentQuestionIndex: 0,
      questionStartedAt: Date.now(),
      questions: input.questions.slice(0, 30),
      pairs: input.pairs.slice(0, 20),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return roomCode;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function updateMultiplayerRoomState(
  roomCode: string,
  updates: {
    status: RoomStatus;
    currentQuestionIndex: number;
    questionStartedAt: number;
  }
): Promise<void> {
  const path = `gameRooms/${roomCode}`;
  try {
    await updateDoc(doc(db, path), {
      status: updates.status,
      currentQuestionIndex: updates.currentQuestionIndex,
      questionStartedAt: updates.questionStartedAt,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function joinMultiplayerRoom(
  roomCode: string,
  player: { uid: string; nickname: string; avatar: string }
): Promise<GameRoom> {
  const roomPath = `gameRooms/${roomCode}`;
  let roomSnap;
  try {
    roomSnap = await getDoc(doc(db, roomPath));
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, roomPath);
  }
  if (!roomSnap.exists()) {
    throw new Error(`Geen spelkamer gevonden met code ${roomCode}. Controleer de 6 cijfers.`);
  }
  const roomData = roomSnap.data() as GameRoom;
  if (roomData.status !== 'lobby') {
    throw new Error('Dit spel is al gestart of afgelopen. Vraag de host om een nieuwe kamer.');
  }

  const playerPath = `gameRooms/${roomCode}/players/${player.uid}`;
  try {
    await setDoc(doc(db, playerPath), {
      uid: player.uid,
      nickname: player.nickname.trim().slice(0, 24),
      avatar: player.avatar.slice(0, 20),
      score: 0,
      streak: 0,
      lastAnswerIndex: -1,
      lastAnswerCorrect: false,
      lastAnsweredQuestion: -1,
      lastPointsEarned: 0,
      joinedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, playerPath);
  }
  return roomData;
}

export async function submitMultiplayerAnswer(
  roomCode: string,
  playerId: string,
  payload: {
    score: number;
    streak: number;
    lastAnswerIndex: number;
    lastAnswerCorrect: boolean;
    lastAnsweredQuestion: number;
    lastPointsEarned: number;
  }
): Promise<void> {
  const path = `gameRooms/${roomCode}/players/${playerId}`;
  try {
    await updateDoc(doc(db, path), {
      ...payload,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export function subscribeGameRoom(
  roomCode: string,
  onRoom: (room: GameRoom | null) => void
): Unsubscribe {
  const path = `gameRooms/${roomCode}`;
  return onSnapshot(
    doc(db, path),
    (snap) => {
      onRoom(snap.exists() ? (snap.data() as GameRoom) : null);
    },
    (err) => handleFirestoreError(err, OperationType.GET, path)
  );
}

export function subscribeGamePlayers(
  roomCode: string,
  onPlayers: (players: GamePlayer[]) => void
): Unsubscribe {
  const path = `gameRooms/${roomCode}/players`;
  return onSnapshot(
    collection(db, path),
    (snap) => {
      const list = snap.docs.map((d) => d.data() as GamePlayer);
      list.sort((a, b) => b.score - a.score);
      onPlayers(list);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, path)
  );
}
