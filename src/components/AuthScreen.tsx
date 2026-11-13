import React, { useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  Gamepad2,
  KeyRound,
  Layers,
  Mail,
  Sparkles,
  UserPlus,
} from 'lucide-react';
import {
  formatAuthErrorDutch,
  loginWithEmail,
  registerWithEmail,
  resetPasswordEmail,
  signInWithGoogle,
} from '../lib/firebase';
import { ThemePreference } from '../types';
import { ThemeSelector } from './ThemeSelector';

interface AuthScreenProps {
  themePreference: ThemePreference;
  onChangeTheme: (theme: ThemePreference) => void;
  onOpenJoinGuest: () => void;
}

type AuthMode = 'login' | 'register' | 'reset';

export const AuthScreen: React.FC<AuthScreenProps> = ({
  themePreference,
  onChangeTheme,
  onOpenJoinGuest,
}) => {
  const [mode, setMode] = useState<AuthMode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleGoogleSignIn = async () => {
    setError(null);
    setSuccessMsg(null);
    setLoading(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(formatAuthErrorDutch(err));
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setLoading(true);
    try {
      if (mode === 'login') {
        await loginWithEmail(email, password);
      } else if (mode === 'register') {
        if (!name.trim()) {
          setError('Vul je voor- en achternaam of roepnaam in.');
          setLoading(false);
          return;
        }
        await registerWithEmail(name, email, password);
      } else {
        await resetPasswordEmail(email);
        setSuccessMsg(
          'Als dit e-mailadres bekend is, heb je een link ontvangen om je wachtwoord te herstellen.'
        );
      }
    } catch (err) {
      setError(formatAuthErrorDutch(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100">
      {/* Top Bar */}
      <header className="w-full border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-[#0B0F17]/80 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between gap-8">
          <div className="flex items-center gap-2.5 whitespace-nowrap shrink-0">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-sm">
              SF
            </div>
            <span className="text-lg font-bold tracking-tight">StudyFlow</span>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <ThemeSelector value={themePreference} onChange={onChangeTheme} compact />
            <button
              type="button"
              onClick={onOpenJoinGuest}
              className="px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition-colors whitespace-nowrap shrink-0 flex items-center gap-2"
            >
              <Gamepad2 className="w-4 h-4" />
              <span>Spel joinen met code</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Split Content */}
      <main className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
          {/* Left Editorial Pitch */}
          <div className="lg:col-span-6 flex flex-col justify-between py-2">
            <div>
              <p className="text-xs font-medium text-indigo-600 dark:text-indigo-400 tracking-wide">
                Slimme leer- en studieomgeving
              </p>
              <h1 className="mt-3 text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 dark:text-slate-50 leading-tight [text-wrap:balance]">
                Studeer effectiever met actieve herinnering en AI-ondersteuning.
              </h1>
              <p className="mt-4 text-base text-slate-600 dark:text-slate-400 leading-relaxed max-w-lg">
                Organiseer al je notities en PDF&apos;s per vak, plan automatisch je oefenschema
                en overhoor jezelf met AI-samenvattingen en realtime multiplayer-quizzen.
              </p>

              <div className="mt-8 space-y-4">
                <div className="flex items-start gap-3.5">
                  <div className="p-2 rounded-lg bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 text-indigo-600 dark:text-indigo-400 shrink-0">
                    <Layers className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      Gespreide oefenschema&apos;s &amp; mappen per vak
                    </h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
                      Genereer een realistisch leerplan tot aan je toetsdatum en bewaar alles overzichtelijk.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3.5">
                  <div className="p-2 rounded-lg bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 text-indigo-600 dark:text-indigo-400 shrink-0">
                    <BookOpen className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      Studie-Notebook op basis van jouw eigen bronnen
                    </h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
                      Vink notities of PDF&apos;s aan en krijg stapsgewijze uitleg zonder ruis.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3.5">
                  <div className="p-2 rounded-lg bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 text-indigo-600 dark:text-indigo-400 shrink-0">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      Solo mini-games &amp; live multiplayer battles
                    </h3>
                    <p className="text-sm text-slate-600 dark:text-slate-400 mt-0.5">
                      Zet leerstof om in flashcards, memory of een realtime quizkamer met 6-cijferige code.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Guest Multiplayer Banner */}
            <div className="mt-8 p-5 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  Heb je alleen een 6-cijferige gamecode?
                </h2>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                  Doe direct mee aan een multiplayer-spel zonder account.
                </p>
              </div>
              <button
                type="button"
                onClick={onOpenJoinGuest}
                className="px-4 py-2.5 rounded-lg text-sm font-medium border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0 flex items-center gap-2"
              >
                <span>Meedoen als gast</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Right Auth Card */}
          <div className="lg:col-span-6 flex items-center">
            <div className="w-full rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-7 sm:p-8">
              {/* Segmented Switch */}
              <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setError(null);
                    setSuccessMsg(null);
                  }}
                  className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
                    mode === 'login'
                      ? 'bg-white dark:bg-[#161D2B] text-slate-900 dark:text-slate-100 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  Inloggen
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode('register');
                    setError(null);
                    setSuccessMsg(null);
                  }}
                  className={`flex-1 py-2 px-3 rounded-md text-sm font-medium transition-colors whitespace-nowrap ${
                    mode === 'register'
                      ? 'bg-white dark:bg-[#161D2B] text-slate-900 dark:text-slate-100 shadow-xs'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  Account aanmaken
                </button>
              </div>

              <div className="mt-6">
                <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                  {mode === 'login' && 'Welkom terug bij StudyFlow'}
                  {mode === 'register' && 'Maak je gratis leerlingaccount'}
                  {mode === 'reset' && 'Wachtwoord herstellen'}
                </h2>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                  {mode === 'login' && 'Log in om verder te gaan met je schema, mappen en samenvattingen.'}
                  {mode === 'register' && 'Sla je voortgang, notities en leerresultaten veilig op.'}
                  {mode === 'reset' && 'Vul je e-mailadres in om een herstellink te ontvangen.'}
                </p>
              </div>

              {mode !== 'reset' && (
                <div className="mt-6">
                  <button
                    type="button"
                    onClick={handleGoogleSignIn}
                    disabled={loading}
                    className="gsi-material-button"
                  >
                    <div className="gsi-material-button-content-wrapper">
                      <div className="gsi-material-button-icon">
                        <svg
                          version="1.1"
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 48 48"
                          style={{ display: 'block' }}
                        >
                          <path
                            fill="#EA4335"
                            d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
                          />
                          <path
                            fill="#4285F4"
                            d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
                          />
                          <path
                            fill="#FBBC05"
                            d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
                          />
                          <path
                            fill="#34A853"
                            d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
                          />
                          <path fill="none" d="M0 0h48v48H0z" />
                        </svg>
                      </div>
                      <span className="gsi-material-button-contents">Inloggen met Google</span>
                    </div>
                  </button>

                  <div className="my-5 flex items-center gap-3">
                    <div className="flex-1 h-px bg-slate-200 dark:bg-slate-800" />
                    <span className="text-xs text-slate-500 dark:text-slate-400">of met e-mailadres</span>
                    <div className="flex-1 h-px bg-slate-200 dark:bg-slate-800" />
                  </div>
                </div>
              )}

              {error && (
                <div className="mt-4 p-3.5 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300 leading-relaxed">
                  {error}
                </div>
              )}

              {successMsg && (
                <div className="mt-4 p-3.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-xs text-emerald-700 dark:text-emerald-300 leading-relaxed">
                  {successMsg}
                </div>
              )}

              <form onSubmit={handleSubmit} className="mt-4 space-y-4">
                {mode === 'register' && (
                  <div>
                    <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                      Naam
                    </label>
                    <div className="relative">
                      <UserPlus className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        placeholder="Bijv. Lotte de Vries"
                        className="w-full pl-9 pr-3.5 py-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                    E-mailadres
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="naam@school.nl"
                      className="w-full pl-9 pr-3.5 py-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
                    />
                  </div>
                </div>

                {mode !== 'reset' && (
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-medium text-slate-700 dark:text-slate-300">
                        Wachtwoord
                      </label>
                      {mode === 'login' && (
                        <button
                          type="button"
                          onClick={() => {
                            setMode('reset');
                            setError(null);
                            setSuccessMsg(null);
                          }}
                          className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
                        >
                          Wachtwoord vergeten?
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="password"
                        required
                        minLength={6}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Minimaal 6 tekens"
                        className="w-full pl-9 pr-3.5 py-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
                      />
                    </div>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium transition-colors disabled:opacity-60"
                >
                  {loading
                    ? 'Bezig...'
                    : mode === 'login'
                      ? 'Inloggen'
                      : mode === 'register'
                        ? 'Account aanmaken'
                        : 'Herstellink versturen'}
                </button>

                {mode === 'reset' && (
                  <button
                    type="button"
                    onClick={() => {
                      setMode('login');
                      setError(null);
                      setSuccessMsg(null);
                    }}
                    className="w-full py-2 text-xs font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                  >
                    Terug naar inloggen
                  </button>
                )}
              </form>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};
