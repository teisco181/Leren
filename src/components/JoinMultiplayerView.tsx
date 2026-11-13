import React, { useState } from 'react';
import { ArrowLeft, Gamepad2, Hash, User } from 'lucide-react';
import { formatAuthErrorDutch, signInGuestAnonymously } from '../lib/firebase';
import { joinMultiplayerRoom } from '../lib/studyStore';
import { MultiplayerRoomView } from './MultiplayerRoomView';

const AVATARS = ['🦊', '🦉', '🚀', '⚡', '🧠', '🎯', '🐙', '🦁'];

interface JoinMultiplayerViewProps {
  initialRoomCode?: string;
  isModal?: boolean;
  onClose: () => void;
}

export const JoinMultiplayerView: React.FC<JoinMultiplayerViewProps> = ({
  initialRoomCode = '',
  isModal = false,
  onClose,
}) => {
  const [roomCode, setRoomCode] = useState(initialRoomCode.replace(/\D/g, '').slice(0, 6));
  const [nickname, setNickname] = useState('');
  const [avatar, setAvatar] = useState(AVATARS[0]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joinedRoomCode, setJoinedRoomCode] = useState<string | null>(null);
  const [playerUid, setPlayerUid] = useState<string | null>(null);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const cleanCode = roomCode.replace(/\D/g, '');
    if (cleanCode.length !== 6) {
      setError('Vul een geldige 6-cijferige gamecode in.');
      return;
    }
    if (!nickname.trim()) {
      setError('Kies eerst een bijnaam.');
      return;
    }

    setLoading(true);
    try {
      const guestUser = await signInGuestAnonymously();
      await joinMultiplayerRoom(cleanCode, {
        uid: guestUser.uid,
        nickname: nickname.trim(),
        avatar,
      });
      setPlayerUid(guestUser.uid);
      setJoinedRoomCode(cleanCode);
    } catch (err) {
      const formatted = formatAuthErrorDutch(err);
      setError(formatted);
    } finally {
      setLoading(false);
    }
  };

  const innerContent =
    joinedRoomCode && playerUid ? (
      <MultiplayerRoomView
        roomCode={joinedRoomCode}
        currentUserId={playerUid}
        isHost={false}
        onExit={() => {
          setJoinedRoomCode(null);
          onClose();
        }}
      />
    ) : (
      <div className="max-w-md mx-auto rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-7 sm:p-8">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
              <Gamepad2 className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">
                Meedoen aan spel
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Direct spelen zonder account
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="px-3 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-1.5"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Terug</span>
          </button>
        </div>

        {error && (
          <div className="mt-5 p-3.5 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-xs text-red-700 dark:text-red-300 leading-relaxed">
            {error}
          </div>
        )}

        <form onSubmit={handleJoin} className="mt-6 space-y-5">
          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              6-cijferige gamecode
            </label>
            <div className="relative">
              <Hash className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                required
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
                className="w-full pl-9 pr-4 py-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 font-mono text-lg tracking-widest tabular-nums focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
              />
            </div>
          </div>

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
                placeholder="Bijv. QuizMaster"
                className="w-full pl-9 pr-4 py-2.5 rounded-lg bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-2">
              Kies een avatar
            </label>
            <div className="grid grid-cols-4 gap-2">
              {AVATARS.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setAvatar(item)}
                  className={`py-2.5 rounded-lg border text-xl transition-colors ${
                    avatar === item
                      ? 'bg-indigo-50 dark:bg-indigo-950/50 border-indigo-500'
                      : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-400'
                  }`}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors disabled:opacity-60"
          >
            {loading ? 'Verbinden...' : 'Spel binnengaan'}
          </button>
        </form>
      </div>
    );

  if (isModal) {
    return (
      <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/60 backdrop-blur-xs p-4 sm:p-8 flex items-center justify-center">
        <div className={joinedRoomCode ? 'w-full max-w-5xl' : 'w-full max-w-md'}>{innerContent}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#0B0F17] text-slate-900 dark:text-slate-100 px-4 py-10">
      <div className={joinedRoomCode ? 'max-w-5xl mx-auto' : 'max-w-md mx-auto'}>{innerContent}</div>
    </div>
  );
};
