import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  linkWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInAnonymously,
  updateProfile,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDocFromServer,
  serverTimestamp,
  setDoc,
  getDoc,
  updateDoc,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';
import { ThemePreference } from '../types';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

export const GOOGLE_WORKSPACE_SCOPES = [
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/drive.metadata.readonly',
  'https://www.googleapis.com/auth/documents.readonly',
  'https://www.googleapis.com/auth/spreadsheets.readonly',
  'https://www.googleapis.com/auth/presentations.readonly',
];

function createGoogleProvider() {
  const provider = new GoogleAuthProvider();
  GOOGLE_WORKSPACE_SCOPES.forEach((scope) => provider.addScope(scope));
  provider.setCustomParameters({ prompt: 'select_account' });
  return provider;
}

// In-memory cache ONLY for Google OAuth access token (never localStorage/sessionStorage)
let cachedDriveAccessToken: string | null = null;

export function getDriveAccessToken(): string | null {
  return cachedDriveAccessToken;
}

export function clearDriveAccessToken(): void {
  cachedDriveAccessToken = null;
}

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Mandatory Firestore boot connectivity check
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Controleer je Firebase-configuratie: de client is offline.');
    }
  }
}
testConnection();

function readLocalThemeSafe(): ThemePreference {
  try {
    const val = localStorage.getItem('studyflow_theme');
    if (val === 'light' || val === 'dark' || val === 'system') return val;
  } catch {
    // ignore
  }
  return 'system';
}

export async function ensureUserProfile(user: User): Promise<ThemePreference | null> {
  if (user.isAnonymous) return null;
  const userPath = `users/${user.uid}`;
  const ref = doc(db, 'users', user.uid);
  try {
    const snap = await getDoc(ref);
    const displayName = (user.displayName || user.email?.split('@')[0] || 'Leerling').slice(0, 80);
    const email = (user.email || '').slice(0, 200);
    const photoURL = (user.photoURL || '').slice(0, 500);
    if (!snap.exists()) {
      const initialTheme = readLocalThemeSafe();
      await setDoc(ref, {
        uid: user.uid,
        email,
        displayName,
        photoURL,
        themePreference: initialTheme,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      return initialTheme;
    } else {
      const data = snap.data() as { themePreference?: ThemePreference };
      await updateDoc(ref, {
        email,
        displayName,
        photoURL,
        updatedAt: serverTimestamp(),
      });
      return data.themePreference || null;
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, userPath);
  }
}

export async function updateUserThemePreference(
  userId: string,
  themePreference: ThemePreference
): Promise<void> {
  const userPath = `users/${userId}`;
  try {
    await updateDoc(doc(db, 'users', userId), {
      themePreference,
      updatedAt: serverTimestamp(),
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, userPath);
  }
}

export async function signInWithGoogleWorkspace(): Promise<{
  user: User;
  accessToken: string | null;
}> {
  const provider = createGoogleProvider();
  const result = await signInWithPopup(auth, provider);
  const credential = GoogleAuthProvider.credentialFromResult(result);
  if (credential?.accessToken) {
    cachedDriveAccessToken = credential.accessToken;
  }
  await ensureUserProfile(result.user);
  return { user: result.user, accessToken: cachedDriveAccessToken };
}

export async function connectGoogleDriveToken(): Promise<string> {
  const provider = createGoogleProvider();
  const current = auth.currentUser;
  let result;
  if (current && !current.isAnonymous) {
    const hasGoogle = current.providerData.some((p) => p.providerId === 'google.com');
    result = hasGoogle
      ? await signInWithPopup(auth, provider)
      : await linkWithPopup(current, provider);
  } else {
    result = await signInWithPopup(auth, provider);
  }
  const credential = GoogleAuthProvider.credentialFromResult(result);
  if (!credential?.accessToken) {
    throw new Error('Kon geen toegangstoken van Google Drive ophalen.');
  }
  cachedDriveAccessToken = credential.accessToken;
  return credential.accessToken;
}

export async function loginWithEmail(email: string, password: string): Promise<User> {
  const cred = await signInWithEmailAndPassword(auth, email.trim(), password);
  await ensureUserProfile(cred.user);
  return cred.user;
}

export async function registerWithEmail(
  name: string,
  email: string,
  password: string
): Promise<User> {
  const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
  if (name.trim()) {
    await updateProfile(cred.user, { displayName: name.trim().slice(0, 80) });
  }
  await ensureUserProfile(cred.user);
  return cred.user;
}

export async function resetPasswordEmail(email: string): Promise<void> {
  await sendPasswordResetEmail(auth, email.trim());
}

export async function signInGuestAnonymously(): Promise<User> {
  if (auth.currentUser) {
    return auth.currentUser;
  }
  const cred = await signInAnonymously(auth);
  return cred.user;
}

export async function logoutUser(): Promise<void> {
  cachedDriveAccessToken = null;
  await auth.signOut();
}

export function subscribeAuth(callback: (user: User | null) => void) {
  return onAuthStateChanged(auth, (user) => {
    if (!user) {
      cachedDriveAccessToken = null;
    }
    callback(user);
  });
}

export function formatAuthErrorDutch(err: unknown): string {
  const code = (err as { code?: string })?.code || '';
  const message = err instanceof Error ? err.message : String(err);
  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
    return 'Ongeldig e-mailadres of wachtwoord. Probeer het opnieuw.';
  }
  if (code === 'auth/email-already-in-use') {
    return 'Dit e-mailadres is al in gebruik. Probeer in te loggen.';
  }
  if (code === 'auth/weak-password') {
    return 'Kies een sterker wachtwoord van minimaal 6 tekens.';
  }
  if (code === 'auth/invalid-email') {
    return 'Vul een geldig e-mailadres in.';
  }
  if (code === 'auth/popup-closed-by-user') {
    return 'Het inlogvenster is gesloten voordat de aanmelding was voltooid.';
  }
  if (code === 'auth/operation-not-allowed' || code === 'auth/admin-restricted-operation') {
    return 'Deze aanmeldmethode (E-mail/Wachtwoord of Anonieme gasttoegang) moet nog worden ingeschakeld in de Firebase Console onder Authentication > Sign-in method.';
  }
  if (code === 'auth/credential-already-in-use') {
    return 'Dit Google-account is al gekoppeld aan een ander account. Log direct in met Google.';
  }
  return message || 'Er is een onbekende authenticatiefout opgetreden.';
}
