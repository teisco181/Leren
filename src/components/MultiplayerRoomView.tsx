import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  CheckCircle2,
  Copy,
  Crown,
  Flame,
  LogOut,
  Play,
  Timer,
  Trophy,
  Users,
  XCircle,
} from 'lucide-react';
import { GamePlayer, GameRoom } from '../types';
import {
  submitMultiplayerAnswer,
  subscribeGamePlayers,
  subscribeGameRoom,
  updateMultiplayerRoomState,
} from '../lib/studyStore';

interface MultiplayerRoomViewProps {
  roomCode: string;
  currentUserId: string;
  isHost: boolean;
  onExit: () => void;
}

const QUESTION_SECONDS = 20;

export const MultiplayerRoomView: React.FC<MultiplayerRoomViewProps> = ({
  roomCode,
  currentUserId,
  isHost,
  onExit,
}) => {
  const [room, setRoom] = useState<GameRoom | null>(null);
  const [players, setPlayers] = useState<GamePlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(QUESTION_SECONDS);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
  const [matchedIds, setMatchedIds] = useState<string[]>([]);
  const [selectedTermId, setSelectedTermId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const unsubRoom = subscribeGameRoom(roomCode, (data) => {
      setRoom(data);
      setLoading(false);
    });
    const unsubPlayers = subscribeGamePlayers(roomCode, (list) => {
      setPlayers(list);
    });
    return () => {
      unsubRoom();
      unsubPlayers();
    };
  }, [roomCode]);

  // Reset local round selections when question index or status changes
  useEffect(() => {
    setSelectedIdx(null);
    setMatchedIds([]);
    setSelectedTermId(null);
  }, [room?.currentQuestionIndex, room?.status]);

  // Countdown timer synced to questionStartedAt
  useEffect(() => {
    if (!room || room.status !== 'question') return;
    const tick = () => {
      const elapsed = (Date.now() - room.questionStartedAt) / 1000;
      const rem = Math.max(0, Math.ceil(QUESTION_SECONDS - elapsed));
      setSecondsLeft(rem);
    };
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [room?.status, room?.questionStartedAt]);

  const currentPlayer = useMemo(
    () => players.find((p) => p.uid === currentUserId) || null,
    [players, currentUserId]
  );

  const shuffledDefinitions = useMemo(() => {
    if (!room?.pairs?.length) return [];
    const copy = [...room.pairs];
    // Deterministic shuffle per roomCode so pairs are mixed
    copy.sort((a, b) => a.definition.localeCompare(b.definition));
    return copy;
  }, [room?.pairs, room?.roomCode]);

  const handleCopyShareLink = async () => {
    const base = window.location.href.split('#')[0].split('?')[0].replace(/\/join\/?$/, '/');
    const url = `${base}?join=1&code=${roomCode}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const handleStartGame = async () => {
    if (!room) return;
    setErrorMsg(null);
    try {
      await updateMultiplayerRoomState(roomCode, {
        status: 'question',
        currentQuestionIndex: 0,
        questionStartedAt: Date.now(),
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Kon spel niet starten.');
    }
  };

  const handleShowLeaderboard = async () => {
    if (!room) return;
    try {
      await updateMultiplayerRoomState(roomCode, {
        status: 'leaderboard',
        currentQuestionIndex: room.currentQuestionIndex,
        questionStartedAt: room.questionStartedAt,
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Kon tussenstand niet tonen.');
    }
  };

  const handleNextQuestion = async () => {
    if (!room) return;
    const nextIdx = room.currentQuestionIndex + 1;
    const isQuizEnd = room.gameMode === 'quiz' && nextIdx >= room.questions.length;
    const isSpeedEnd = room.gameMode === 'speed-match';
    try {
      if (isQuizEnd || isSpeedEnd) {
        await updateMultiplayerRoomState(roomCode, {
          status: 'finished',
          currentQuestionIndex: room.currentQuestionIndex,
          questionStartedAt: room.questionStartedAt,
        });
      } else {
        await updateMultiplayerRoomState(roomCode, {
          status: 'question',
          currentQuestionIndex: nextIdx,
          questionStartedAt: Date.now(),
        });
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Kon volgende vraag niet laden.');
    }
  };

  const handleFinishGame = async () => {
    if (!room) return;
    try {
      await updateMultiplayerRoomState(roomCode, {
        status: 'finished',
        currentQuestionIndex: room.currentQuestionIndex,
        questionStartedAt: room.questionStartedAt,
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Kon spel niet beëindigen.');
    }
  };

  const handleAnswerQuiz = async (optionIdx: number) => {
    if (!room || !currentPlayer || selectedIdx !== null) return;
    if (currentPlayer.lastAnsweredQuestion === room.currentQuestionIndex) return;

    const q = room.questions[room.currentQuestionIndex];
    if (!q) return;

    setSelectedIdx(optionIdx);
    const isCorrect = optionIdx === q.correctIndex;
    const newStreak = isCorrect ? currentPlayer.streak + 1 : 0;
    const speedBonus = Math.round((secondsLeft / QUESTION_SECONDS) * 500);
    const streakBonus = isCorrect ? Math.min(newStreak - 1, 4) * 100 : 0;
    const earned = isCorrect ? 500 + speedBonus + streakBonus : 0;

    try {
      await submitMultiplayerAnswer(roomCode, currentUserId, {
        score: currentPlayer.score + earned,
        streak: newStreak,
        lastAnswerIndex: optionIdx,
        lastAnswerCorrect: isCorrect,
        lastAnsweredQuestion: room.currentQuestionIndex,
        lastPointsEarned: earned,
      });
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Kon antwoord niet versturen.');
    }
  };

  const handleMatchDefinition = async (defPairId: string) => {
    if (!room || !currentPlayer || !selectedTermId) return;
    if (matchedIds.includes(defPairId)) return;

    const isMatch = selectedTermId === defPairId;
    setSelectedTermId(null);

    if (isMatch) {
      const updatedMatched = [...matchedIds, defPairId];
      setMatchedIds(updatedMatched);
      const newStreak = currentPlayer.streak + 1;
      const earned = 250 + Math.min(newStreak, 5) * 50;
      await submitMultiplayerAnswer(roomCode, currentUserId, {
        score: currentPlayer.score + earned,
        streak: newStreak,
        lastAnswerIndex: updatedMatched.length,
        lastAnswerCorrect: true,
        lastAnsweredQuestion: 0,
        lastPointsEarned: earned,
      });
    } else {
      await submitMultiplayerAnswer(roomCode, currentUserId, {
        score: currentPlayer.score,
        streak: 0,
        lastAnswerIndex: -1,
        lastAnswerCorrect: false,
        lastAnsweredQuestion: 0,
        lastPointsEarned: 0,
      });
    }
  };

  if (loading) {
    return (
      <div className="p-8 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 text-center">
        <p className="text-sm text-slate-600 dark:text-slate-400">Spelkamer laden...</p>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="p-8 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 text-center space-y-4">
        <p className="text-base font-semibold text-slate-900 dark:text-slate-100">
          Deze spelkamer bestaat niet meer of is gesloten.
        </p>
        <button
          type="button"
          onClick={onExit}
          className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700"
        >
          Terug
        </button>
      </div>
    );
  }

  const currentQuestion = room.questions[room.currentQuestionIndex];
  const topThree = players.slice(0, 3);
  const alreadyAnsweredThisRound =
    currentPlayer && currentPlayer.lastAnsweredQuestion === room.currentQuestionIndex;

  return (
    <div className="space-y-6">
      {/* Room Top Status Bar */}
      <div className="rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span className="inline-flex items-center gap-1.5 font-medium text-emerald-600 dark:text-emerald-400">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              Live verbonden
            </span>
            <span aria-hidden="true">·</span>
            <span>{room.gameMode === 'quiz' ? 'Quiz Battle' : 'Speed-Match'}</span>
            <span aria-hidden="true">·</span>
            <span>Host: {room.hostName}</span>
          </div>
          <h2 className="mt-1 text-lg font-bold text-slate-900 dark:text-slate-100">{room.title}</h2>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          <div className="px-3.5 py-2 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center gap-3">
            <span className="text-xs text-slate-500 dark:text-slate-400">Code</span>
            <span className="font-mono text-lg font-bold tracking-widest tabular-nums text-indigo-600 dark:text-indigo-400">
              {room.roomCode}
            </span>
            <button
              type="button"
              onClick={handleCopyShareLink}
              className="p-1.5 rounded-md hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors"
              title="Deellink kopiëren"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>

          <button
            type="button"
            onClick={onExit}
            className="px-3.5 py-2 rounded-lg text-sm font-medium border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-2 whitespace-nowrap shrink-0"
          >
            <LogOut className="w-4 h-4" />
            <span>Verlaten</span>
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="p-3.5 rounded-lg bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 text-sm text-red-700 dark:text-red-300">
          {errorMsg}
        </div>
      )}

      {/* LOBBY */}
      {room.status === 'lobby' && (
        <div className="rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-6 sm:p-8 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Users className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <span>Spelers in de lobby ({players.length})</span>
              </h3>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                Deel code <span className="font-mono font-semibold">{room.roomCode}</span> of ga naar{' '}
                <span className="font-mono text-xs">/join</span> zodat medeleerlingen en gasten kunnen meedoen.
              </p>
            </div>

            {isHost ? (
              <button
                type="button"
                onClick={handleStartGame}
                disabled={players.length === 0}
                className="px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 disabled:opacity-50"
              >
                <Play className="w-4 h-4" />
                <span>Start Spel</span>
              </button>
            ) : (
              <span className="text-sm font-medium text-slate-500 dark:text-slate-400">
                Wachten tot de host het spel start...
              </span>
            )}
          </div>

          {players.length === 0 ? (
            <div className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
              Nog geen spelers binnengekomen. Deel de code of link om te beginnen.
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {players.map((p) => (
                <div
                  key={p.uid}
                  className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 flex items-center gap-3"
                >
                  <span className="text-2xl shrink-0">{p.avatar}</span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {p.nickname}
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {p.uid === currentUserId ? 'Jij' : 'Klaar'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ACTIVE QUESTION - QUIZ MODE */}
      {room.status === 'question' && room.gameMode === 'quiz' && currentQuestion && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-6 sm:p-8 space-y-6">
            <div className="flex items-center justify-between gap-4">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400 tabular-nums">
                Vraag {room.currentQuestionIndex + 1} van {room.questions.length}
              </span>
              <div className="flex items-center gap-3">
                {currentPlayer && (
                  <span className="text-xs font-medium text-amber-600 dark:text-amber-400 flex items-center gap-1 tabular-nums">
                    <Flame className="w-3.5 h-3.5" />
                    Streak {currentPlayer.streak}x
                  </span>
                )}
                <span
                  className={`font-mono text-sm font-semibold tabular-nums flex items-center gap-1.5 ${
                    secondsLeft <= 5
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-slate-700 dark:text-slate-300'
                  }`}
                >
                  <Timer className="w-4 h-4" />
                  {secondsLeft}s
                </span>
              </div>
            </div>

            <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100 leading-snug">
              {currentQuestion.question}
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {currentQuestion.options.map((opt, idx) => {
                const isChosen =
                  selectedIdx === idx ||
                  (alreadyAnsweredThisRound && currentPlayer?.lastAnswerIndex === idx);
                const isRight = idx === currentQuestion.correctIndex;
                const reveal = isHost || selectedIdx !== null || alreadyAnsweredThisRound;

                let btnStyle =
                  'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-indigo-500 text-slate-900 dark:text-slate-100';
                if (reveal) {
                  if (isRight) {
                    btnStyle =
                      'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500 text-emerald-900 dark:text-emerald-200';
                  } else if (isChosen) {
                    btnStyle =
                      'bg-red-50 dark:bg-red-950/40 border-red-500 text-red-900 dark:text-red-200';
                  } else {
                    btnStyle =
                      'bg-slate-50/50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-500';
                  }
                }

                return (
                  <button
                    key={idx}
                    type="button"
                    disabled={isHost || selectedIdx !== null || Boolean(alreadyAnsweredThisRound)}
                    onClick={() => handleAnswerQuiz(idx)}
                    className={`p-4 rounded-xl border text-left text-sm font-medium transition-colors flex items-start justify-between gap-3 ${btnStyle}`}
                  >
                    <span>
                      <span className="font-mono text-xs opacity-60 mr-2">
                        {String.fromCharCode(65 + idx)}.
                      </span>
                      {opt}
                    </span>
                    {reveal && isRight && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />}
                    {reveal && isChosen && !isRight && <XCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />}
                  </button>
                );
              })}
            </div>

            {(selectedIdx !== null || alreadyAnsweredThisRound || isHost) && (
              <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1.5">
                {!isHost && currentPlayer && (
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                    {currentPlayer.lastAnswerCorrect
                      ? `Goed gedaan! +${currentPlayer.lastPointsEarned} punten`
                      : 'Helaas, dat antwoord was niet juist.'}
                  </p>
                )}
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  {currentQuestion.explanation}
                </p>
              </div>
            )}

            {isHost && (
              <div className="pt-2 flex flex-wrap items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={handleShowLeaderboard}
                  className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap"
                >
                  Toon Tussenstand
                </button>
                <button
                  type="button"
                  onClick={handleNextQuestion}
                  className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium whitespace-nowrap"
                >
                  {room.currentQuestionIndex + 1 >= room.questions.length
                    ? 'Eindstand Tonen'
                    : 'Volgende Vraag'}
                </button>
              </div>
            )}
          </div>

          {/* Live Side Leaderboard */}
          <div className="lg:col-span-4 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5 space-y-4">
            <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Trophy className="w-4 h-4 text-amber-500" />
              <span>Live Scorebord</span>
            </h4>
            <div className="space-y-2">
              {players.map((p, idx) => (
                <div
                  key={p.uid}
                  className="px-3 py-2.5 rounded-lg bg-slate-50 dark:bg-slate-900/70 border border-slate-200/70 dark:border-slate-800 flex items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="font-mono text-xs text-slate-500 w-4 tabular-nums">{idx + 1}.</span>
                    <span className="text-base">{p.avatar}</span>
                    <span className="text-sm font-medium truncate">{p.nickname}</span>
                  </div>
                  <span className="font-mono text-sm font-semibold tabular-nums text-indigo-600 dark:text-indigo-400">
                    {p.score}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ACTIVE ROUND - SPEED MATCH MODE */}
      {room.status === 'question' && room.gameMode === 'speed-match' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-6 space-y-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                  Speed-Match: Koppel elk begrip aan de juiste definitie
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                  {matchedIds.length} van {room.pairs.length} gekoppeld
                </p>
              </div>
              {isHost && (
                <button
                  type="button"
                  onClick={handleFinishGame}
                  className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium whitespace-nowrap shrink-0"
                >
                  Ronde Afronden
                </button>
              )}
            </div>

            {isHost ? (
              <p className="text-sm text-slate-600 dark:text-slate-400 py-8 text-center">
                Spelers zijn live begrippen aan het koppelen. Bekijk het scorebord rechts en klik op
                &ldquo;Ronde Afronden&rdquo; wanneer iedereen klaar is.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Begrippen</p>
                  {room.pairs.map((pair) => {
                    const done = matchedIds.includes(pair.id);
                    const active = selectedTermId === pair.id;
                    return (
                      <button
                        key={pair.id}
                        type="button"
                        disabled={done}
                        onClick={() => setSelectedTermId(pair.id)}
                        className={`w-full p-3 rounded-lg border text-left text-sm font-medium transition-colors ${
                          done
                            ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 opacity-60'
                            : active
                              ? 'bg-indigo-50 dark:bg-indigo-950/50 border-indigo-500 text-indigo-700 dark:text-indigo-300'
                              : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-indigo-400'
                        }`}
                      >
                        {pair.term}
                      </button>
                    );
                  })}
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Definities</p>
                  {shuffledDefinitions.map((pair) => {
                    const done = matchedIds.includes(pair.id);
                    return (
                      <button
                        key={pair.id}
                        type="button"
                        disabled={done || !selectedTermId}
                        onClick={() => handleMatchDefinition(pair.id)}
                        className={`w-full p-3 rounded-lg border text-left text-xs leading-relaxed transition-colors ${
                          done
                            ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 opacity-60'
                            : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-indigo-400 disabled:opacity-70'
                        }`}
                      >
                        {pair.definition}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="lg:col-span-4 rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-5 space-y-4">
            <h4 className="text-sm font-semibold flex items-center gap-2">
              <Trophy className="w-4 h-4 text-amber-500" />
              <span>Live Scorebord</span>
            </h4>
            <div className="space-y-2">
              {players.map((p, idx) => (
                <div
                  key={p.uid}
                  className="px-3 py-2.5 rounded-lg bg-slate-50 dark:bg-slate-900/70 border border-slate-200/70 dark:border-slate-800 flex items-center justify-between gap-2"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="font-mono text-xs text-slate-500 w-4 tabular-nums">{idx + 1}.</span>
                    <span className="text-base">{p.avatar}</span>
                    <span className="text-sm font-medium truncate">{p.nickname}</span>
                  </div>
                  <span className="font-mono text-sm font-semibold tabular-nums text-indigo-600 dark:text-indigo-400">
                    {p.score}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* LEADERBOARD / PODIUM */}
      {(room.status === 'leaderboard' || room.status === 'finished') && (
        <div className="rounded-2xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 p-6 sm:p-8 space-y-8">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2.5">
                <Crown className="w-5 h-5 text-amber-500" />
                <span>{room.status === 'finished' ? 'Eindstand & Podium' : 'Tussenstand'}</span>
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                {room.status === 'finished'
                  ? 'Alle rondes zijn gespeeld! Hier zijn de winnaars.'
                  : `Stand na vraag ${room.currentQuestionIndex + 1} van ${room.questions.length}`}
              </p>
            </div>
            {isHost && room.status === 'leaderboard' && (
              <button
                type="button"
                onClick={handleNextQuestion}
                className="px-5 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold whitespace-nowrap shrink-0"
              >
                {room.currentQuestionIndex + 1 >= room.questions.length
                  ? 'Toon Eindpodium'
                  : 'Volgende Vraag'}
              </button>
            )}
          </div>

          {/* Top 3 Podium */}
          {topThree.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end pt-2">
              {topThree.map((player, index) => (
                <div
                  key={player.uid}
                  className={`p-5 rounded-xl border text-center space-y-2 ${
                    index === 0
                      ? 'bg-amber-50/70 dark:bg-amber-950/20 border-amber-300 dark:border-amber-700 sm:order-2 sm:pb-8'
                      : index === 1
                        ? 'bg-slate-50 dark:bg-slate-900 border-slate-300 dark:border-slate-700 sm:order-1'
                        : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 sm:order-3'
                  }`}
                >
                  <span className="text-xs font-mono font-semibold text-slate-500 dark:text-slate-400">
                    #{index + 1} Plaats
                  </span>
                  <div className="text-4xl">{player.avatar}</div>
                  <p className="text-base font-bold text-slate-900 dark:text-slate-100 truncate">
                    {player.nickname}
                  </p>
                  <p className="font-mono text-xl font-bold tabular-nums text-indigo-600 dark:text-indigo-400">
                    {player.score} ptn
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Full Ranking */}
          <div className="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
            {players.map((p, idx) => (
              <div
                key={p.uid}
                className="px-4 py-3 bg-white dark:bg-[#111827] flex items-center justify-between gap-4"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="font-mono text-sm text-slate-500 w-6 tabular-nums">{idx + 1}.</span>
                  <span className="text-xl">{p.avatar}</span>
                  <span className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">
                    {p.nickname}
                  </span>
                </div>
                <span className="font-mono text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">
                  {p.score} ptn
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
