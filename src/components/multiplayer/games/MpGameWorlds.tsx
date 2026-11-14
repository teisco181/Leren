import React, { useState } from 'react';
import {
  ArrowLeftRight,
  BookOpen,
  Building2,
  Castle,
  CheckCircle2,
  Compass,
  Cpu,
  DoorOpen,
  Flame,
  Heart,
  Leaf,
  Send,
  Sparkles,
  Star,
  Trophy,
  Wrench,
  XCircle,
} from 'lucide-react';
import { MpChallengeItem, MpPlayerPublic, MpRoomSnapshot } from '../../../types';

interface ChallengeFeedback {
  correct: boolean;
  explanation: string;
  correctOption: string;
  sourceTitle: string;
  sourceSection: string;
}

interface MpGameWorldsProps {
  snapshot: MpRoomSnapshot;
  myPlayer: MpPlayerPublic;
  challenges: MpChallengeItem[];
  answeredIds: string[];
  busyAction: boolean;
  onAnswerChallenge: (
    challengeId: string,
    optionIndex: number,
    extra?: Record<string, unknown>
  ) => Promise<ChallengeFeedback | null>;
  onAction: (type: string, payload?: Record<string, unknown>) => Promise<void>;
}

const ChallengeCard: React.FC<{
  challenges: MpChallengeItem[];
  answeredIds: string[];
  busyAction: boolean;
  titleLabel?: string;
  accentBg?: string;
  onAnswer: (
    challengeId: string,
    optionIndex: number
  ) => Promise<ChallengeFeedback | null>;
}> = ({
  challenges,
  answeredIds,
  busyAction,
  titleLabel = 'Bronopdracht uit geselecteerde leerstof',
  accentBg = 'bg-indigo-600 hover:bg-indigo-700',
  onAnswer,
}) => {
  const [cursor, setCursor] = useState(0);
  const [feedback, setFeedback] = useState<ChallengeFeedback | null>(null);

  const unanswered = challenges.filter((c) => !answeredIds.includes(c.id));
  const pool = unanswered.length > 0 ? unanswered : challenges;
  const current = pool[cursor % Math.max(1, pool.length)];

  if (!current) {
    return (
      <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-500">
        Geen verdere opdrachten beschikbaar in deze kamer.
      </div>
    );
  }

  const handlePick = async (idx: number) => {
    if (busyAction || feedback) return;
    const res = await onAnswer(current.id, idx);
    if (res) setFeedback(res);
  };

  const handleNext = () => {
    setFeedback(null);
    setCursor((c) => c + 1);
  };

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B0F17] p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="font-bold text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
          <Sparkles className="w-4 h-4" />
          <span>{titleLabel}</span>
        </span>
        <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1">
          <BookOpen className="w-3.5 h-3.5" />
          <span>Bron: {current.sourceTitle} · {current.sourceSection}</span>
        </span>
      </div>

      {current.hint && !feedback && (
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          Tip: {current.hint}
        </p>
      )}

      <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 leading-snug">
        {current.prompt}
      </h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {current.options.map((opt, idx) => {
          const isRight = feedback && opt === feedback.correctOption;
          return (
            <button
              key={idx}
              type="button"
              disabled={busyAction || Boolean(feedback)}
              onClick={() => handlePick(idx)}
              className={`p-3.5 rounded-xl border text-left text-xs sm:text-sm font-medium transition-colors flex items-start justify-between gap-2 ${
                !feedback
                  ? 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-indigo-500'
                  : isRight
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500 text-emerald-900 dark:text-emerald-200'
                    : 'bg-slate-50/50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800 text-slate-400'
              }`}
            >
              <span>{opt}</span>
              {feedback && isRight && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
            </button>
          );
        })}
      </div>

      {feedback && (
        <div
          className={`p-4 rounded-xl border space-y-2 ${
            feedback.correct
              ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800'
              : 'bg-red-50 dark:bg-red-950/30 border-red-300 dark:border-red-800'
          }`}
        >
          <div className="flex items-center gap-1.5 text-xs font-bold">
            {feedback.correct ? (
              <>
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span className="text-emerald-800 dark:text-emerald-300">Goed antwoord!</span>
              </>
            ) : (
              <>
                <XCircle className="w-4 h-4 text-red-600" />
                <span className="text-red-800 dark:text-red-300">
                  Helaas fout · Juiste antwoord: {feedback.correctOption}
                </span>
              </>
            )}
          </div>
          <p className="text-xs text-slate-700 dark:text-slate-300">{feedback.explanation}</p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Bronvermelding: {feedback.sourceTitle} · {feedback.sourceSection}
          </p>
          <div className="flex justify-end pt-1">
            <button
              type="button"
              onClick={handleNext}
              className={`px-4 py-1.5 rounded-lg text-white text-xs font-semibold ${accentBg}`}
            >
              Volgende opdracht
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const ClueShareBar: React.FC<{
  placeholder: string;
  buttonLabel: string;
  busyAction: boolean;
  onShare: (text: string) => Promise<void>;
}> = ({ placeholder, buttonLabel, busyAction, onShare }) => {
  const [text, setText] = useState('');
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!text.trim()) return;
        await onShare(text.trim());
        setText('');
      }}
      className="flex gap-2"
    >
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={placeholder}
        maxLength={200}
        className="flex-1 px-3.5 py-2 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-700 text-xs"
      />
      <button
        type="submit"
        disabled={busyAction || !text.trim()}
        className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center gap-1.5 shrink-0"
      >
        <Send className="w-3.5 h-3.5" />
        <span>{buttonLabel}</span>
      </button>
    </form>
  );
};

export const MpGameWorlds: React.FC<MpGameWorldsProps> = ({
  snapshot,
  myPlayer,
  challenges,
  answeredIds,
  busyAction,
  onAnswerChallenge,
  onAction,
}) => {
  const wd = myPlayer.worldData || {};
  const [selectedCityBuilding, setSelectedCityBuilding] = useState('huis');
  const [ecoItem, setEcoItem] = useState('boom');
  const [selectedPart, setSelectedPart] = useState('gear');
  const [machineName, setMachineName] = useState(String(wd.machineName || 'Mijn Uitvinding'));
  const [blueprint, setBlueprint] = useState<Array<string | null>>(
    Array.isArray(wd.blueprint) ? (wd.blueprint as Array<string | null>) : Array(12).fill(null)
  );
  const [offerRes, setOfferRes] = useState<'gold' | 'food' | 'knowledge'>('gold');
  const [requestRes, setRequestRes] = useState<'gold' | 'food' | 'knowledge'>('knowledge');

  // 1. ESCAPE TOGETHER
  if (snapshot.gameId === 'escape-together') {
    const solvedStations = Array.isArray(wd.solvedStations) ? (wd.solvedStations as number[]) : [];
    const stations = [1, 2, 3, 4, 5];
    return (
      <div className="space-y-5">
        <div className="rounded-2xl border border-violet-200 dark:border-violet-900 bg-violet-50/70 dark:bg-violet-950/25 p-5 space-y-4">
          <div className="flex items-center justify-between text-xs font-bold text-violet-700 dark:text-violet-300">
            <span className="flex items-center gap-1.5">
              <DoorOpen className="w-4 h-4" />
              Samen Ontsnappen: {Math.min(5, solvedStations.length)} / 5 Sloten Gekraakt
            </span>
            <span>{myPlayer.completed ? 'Ontsnapt!' : 'Bezig'}</span>
          </div>
          <div className="grid grid-cols-5 gap-2">
            {stations.map((st) => {
              const unlocked = solvedStations.includes(st) || solvedStations.length >= st;
              return (
                <div
                  key={st}
                  className={`p-3 rounded-xl border text-center text-xs font-bold ${
                    unlocked
                      ? 'bg-emerald-500 text-white border-emerald-400'
                      : 'bg-white dark:bg-[#111827] border-slate-200 dark:border-slate-800 text-slate-500'
                  }`}
                >
                  Slot {st}
                </div>
              );
            })}
          </div>
          <ClueShareBar
            placeholder="Deel een aanwijzing uit de bronnen met je team..."
            buttonLabel="Deel tip"
            busyAction={busyAction}
            onShare={(text) => onAction('share_clue', { text })}
          />
        </div>

        <ChallengeCard
          challenges={challenges}
          answeredIds={answeredIds}
          busyAction={busyAction}
          titleLabel="Kraak het volgende slot met jouw leerstof"
          accentBg="bg-violet-600 hover:bg-violet-700"
          onAnswer={(id, opt) =>
            onAnswerChallenge(id, opt, { station: Math.min(5, solvedStations.length + 1) })
          }
        />
      </div>
    );
  }

  // 2. BUILD A CITY
  if (snapshot.gameId === 'build-a-city') {
    const coins = Number(wd.coins ?? 120);
    const energy = Number(wd.energy ?? 2);
    const citizens = Number(wd.citizens ?? 20);
    const grid = Array.isArray(wd.grid) ? (wd.grid as Array<string | null>) : Array(16).fill(null);

    const BUILDINGS = [
      { id: 'huis', label: 'Huis', cost: 40, icon: '🏠' },
      { id: 'school', label: 'School', cost: 80, icon: '🏫' },
      { id: 'park', label: 'Park', cost: 50, icon: '🌳' },
      { id: 'zonnepaneel', label: 'Zonnepark', cost: 60, icon: '☀️' },
      { id: 'bieb', label: 'Bibliotheek', cost: 90, icon: '📚' },
      { id: 'metro', label: 'Metro', cost: 110, icon: '🚇' },
    ];

    const others = snapshot.players.filter((p) => p.uid !== myPlayer.uid);

    return (
      <div className="space-y-5">
        <div className="rounded-2xl border border-cyan-200 dark:border-cyan-900 bg-cyan-50/50 dark:bg-cyan-950/20 p-5 space-y-4">
          <div className="grid grid-cols-3 gap-3 text-center text-xs tabular-nums">
            <div className="p-2.5 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800">
              <p className="text-[11px] text-slate-500">Bouwmunten</p>
              <p className="text-base font-bold font-mono text-amber-600">{coins}</p>
            </div>
            <div className="p-2.5 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800">
              <p className="text-[11px] text-slate-500">Energie</p>
              <p className="text-base font-bold font-mono text-cyan-600">{energy}</p>
            </div>
            <div className="p-2.5 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800">
              <p className="text-[11px] text-slate-500">Inwoners</p>
              <p className="text-base font-bold font-mono text-emerald-600">{citizens}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {BUILDINGS.map((b) => (
              <button
                key={b.id}
                type="button"
                onClick={() => setSelectedCityBuilding(b.id)}
                className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 ${
                  selectedCityBuilding === b.id
                    ? 'bg-cyan-600 border-cyan-600 text-white'
                    : 'bg-white dark:bg-[#111827] border-slate-200 dark:border-slate-800'
                }`}
              >
                <span>{b.icon}</span>
                <span>{b.label} ({b.cost}m)</span>
              </button>
            ))}
          </div>

          <div className="grid grid-cols-4 gap-2 max-w-md mx-auto">
            {grid.map((cell, idx) => {
              const spec = BUILDINGS.find((b) => b.id === cell);
              return (
                <button
                  key={idx}
                  type="button"
                  disabled={busyAction}
                  onClick={() =>
                    onAction('build_city_tile', { slotIndex: idx, buildingId: selectedCityBuilding })
                  }
                  className={`aspect-square rounded-xl border flex flex-col items-center justify-center text-xs transition-colors ${
                    spec
                      ? 'bg-white dark:bg-[#111827] border-cyan-400 shadow-xs'
                      : 'bg-slate-100/80 dark:bg-slate-900 border-dashed border-slate-300 dark:border-slate-700 hover:border-cyan-500'
                  }`}
                >
                  {spec ? (
                    <>
                      <span className="text-xl">{spec.icon}</span>
                      <span className="text-[10px] font-bold truncate max-w-full px-1">
                        {spec.label}
                      </span>
                    </>
                  ) : (
                    <span className="text-[10px] text-slate-400">+ Bouw</span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <ChallengeCard
          challenges={challenges}
          answeredIds={answeredIds}
          busyAction={busyAction}
          titleLabel="Verdien +65 Bouwmunten & +2 Energie met een bronvraag"
          accentBg="bg-cyan-600 hover:bg-cyan-700"
          onAnswer={(id, opt) => onAnswerChallenge(id, opt)}
        />

        {others.length > 0 && (
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-4 space-y-2.5">
            <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
              <Building2 className="w-4 h-4 text-cyan-600" />
              <span>Beoordeel steden van andere spelers</span>
            </h4>
            <div className="space-y-2">
              {others.map((p) => {
                const pGrid = Array.isArray(p.worldData?.grid)
                  ? (p.worldData.grid as Array<string | null>).filter(Boolean).length
                  : 0;
                const myRating = snapshot.cityRatings?.[p.uid]?.[myPlayer.uid] || 0;
                return (
                  <div
                    key={p.uid}
                    className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 text-xs"
                  >
                    <span>
                      {p.avatar} <strong>{p.nickname}</strong> · {pGrid} gebouwen ·{' '}
                      {Number(p.worldData?.citizens ?? 20)} inwoners
                    </span>
                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((st) => (
                        <button
                          key={st}
                          type="button"
                          onClick={() => onAction('rate_city', { targetUid: p.uid, stars: st })}
                          className={`p-1 rounded ${
                            myRating >= st ? 'text-amber-500' : 'text-slate-300 dark:text-slate-600'
                          }`}
                        >
                          <Star className="w-3.5 h-3.5 fill-current" />
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  }

  // 3. DETECTIVE AGENCY
  if (snapshot.gameId === 'detective-agency') {
    const investigated = Array.isArray(wd.investigatedSpots)
      ? (wd.investigatedSpots as number[])
      : [];
    return (
      <div className="space-y-5">
        <div className="rounded-2xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50/50 dark:bg-indigo-950/20 p-5 space-y-4">
          <div className="flex items-center justify-between text-xs font-bold text-indigo-700 dark:text-indigo-300">
            <span>Dossierbewijzen onderzocht: {Math.min(5, investigated.length)} / 5</span>
            <span>{myPlayer.completed ? 'Zaak opgelost!' : 'Onderzoek loopt'}</span>
          </div>
          <div className="grid grid-cols-5 gap-2">
            {[1, 2, 3, 4, 5].map((s) => (
              <div
                key={s}
                className={`p-2.5 rounded-xl border text-center text-xs font-bold ${
                  investigated.includes(s) || investigated.length >= s
                    ? 'bg-indigo-600 text-white border-indigo-500'
                    : 'bg-white dark:bg-[#111827] border-slate-200 dark:border-slate-800 text-slate-500'
                }`}
              >
                Spoor {s}
              </div>
            ))}
          </div>
          <ClueShareBar
            placeholder="Deel een ontdekt bewijsstuk uit de brontekst..."
            buttonLabel="Naar prikbord"
            busyAction={busyAction}
            onShare={(text) => onAction('share_clue', { text })}
          />
        </div>

        <ChallengeCard
          challenges={challenges}
          answeredIds={answeredIds}
          busyAction={busyAction}
          titleLabel="Onderzoek volgend bewijsstuk"
          onAnswer={(id, opt) =>
            onAnswerChallenge(id, opt, { spot: Math.min(5, investigated.length + 1) })
          }
        />
      </div>
    );
  }

  // 4. KINGDOMS
  if (snapshot.gameId === 'kingdoms') {
    const gold = Number(wd.gold ?? 120);
    const food = Number(wd.food ?? 100);
    const knowledge = Number(wd.knowledge ?? 40);
    const castleLevel = Number(wd.castleLevel ?? 1);
    const techs = Array.isArray(wd.techs) ? (wd.techs as string[]) : [];
    const openTrades = snapshot.trades.filter((t) => !t.acceptedBy);

    return (
      <div className="space-y-5">
        <div className="rounded-2xl border border-amber-200 dark:border-amber-900 bg-amber-50/50 dark:bg-amber-950/20 p-5 space-y-4">
          <div className="grid grid-cols-4 gap-2 text-center text-xs tabular-nums">
            <div className="p-2 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800">
              <p className="text-[11px] text-slate-500">Goud</p>
              <p className="font-bold font-mono text-amber-600">{gold}</p>
            </div>
            <div className="p-2 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800">
              <p className="text-[11px] text-slate-500">Voedsel</p>
              <p className="font-bold font-mono text-emerald-600">{food}</p>
            </div>
            <div className="p-2 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800">
              <p className="text-[11px] text-slate-500">Kennis</p>
              <p className="font-bold font-mono text-indigo-600">{knowledge}</p>
            </div>
            <div className="p-2 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800">
              <p className="text-[11px] text-slate-500">Kasteel</p>
              <p className="font-bold font-mono">Lv.{castleLevel}/5</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busyAction || castleLevel >= 5}
              onClick={() => onAction('kingdom_upgrade', { upgradeKind: 'castle' })}
              className="px-3.5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs font-bold inline-flex items-center gap-1.5"
            >
              <Castle className="w-3.5 h-3.5" />
              <span>
                {castleLevel >= 5
                  ? 'Kasteel Max'
                  : `Upgrade Kasteel (${80 * castleLevel}g · ${30 * castleLevel}k)`}
              </span>
            </button>
            {['Akkerbouw', 'Bibliotheek', 'Handelsgilde'].map((tech) => (
              <button
                key={tech}
                type="button"
                disabled={busyAction || techs.includes(tech)}
                onClick={() => onAction('kingdom_upgrade', { upgradeKind: 'tech', techId: tech })}
                className={`px-3 py-2 rounded-xl border text-xs font-semibold ${
                  techs.includes(tech)
                    ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-400 text-emerald-700 dark:text-emerald-300'
                    : 'bg-white dark:bg-[#111827] border-slate-200 dark:border-slate-700 hover:border-amber-500'
                }`}
              >
                {techs.includes(tech) ? `✓ ${tech}` : `${tech} (50 kennis)`}
              </button>
            ))}
          </div>

          {/* Async Marketplace */}
          <div className="pt-3 border-t border-amber-200/70 dark:border-amber-900/50 space-y-2.5">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                <ArrowLeftRight className="w-3.5 h-3.5" />
                Handelsaanbod (30 voor 30):
              </span>
              <select
                value={offerRes}
                onChange={(e) => setOfferRes(e.target.value as 'gold' | 'food' | 'knowledge')}
                className="px-2 py-1 rounded-lg bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-700"
              >
                <option value="gold">Bied 30 Goud</option>
                <option value="food">Bied 30 Voedsel</option>
                <option value="knowledge">Bied 30 Kennis</option>
              </select>
              <span>voor</span>
              <select
                value={requestRes}
                onChange={(e) => setRequestRes(e.target.value as 'gold' | 'food' | 'knowledge')}
                className="px-2 py-1 rounded-lg bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-700"
              >
                <option value="knowledge">30 Kennis</option>
                <option value="gold">30 Goud</option>
                <option value="food">30 Voedsel</option>
              </select>
              <button
                type="button"
                disabled={busyAction || offerRes === requestRes}
                onClick={() =>
                  onAction('trade_offer', {
                    offerResource: offerRes,
                    offerAmount: 30,
                    requestResource: requestRes,
                    requestAmount: 30,
                  })
                }
                className="px-3 py-1 rounded-lg bg-slate-900 dark:bg-slate-700 text-white font-semibold disabled:opacity-45"
              >
                Plaats aanbod
              </button>
            </div>

            {openTrades.length > 0 && (
              <div className="space-y-1.5">
                {openTrades.map((tr) => (
                  <div
                    key={tr.id}
                    className="flex items-center justify-between gap-2 p-2 rounded-lg bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800 text-xs"
                  >
                    <span>
                      <strong>{tr.fromName}</strong> biedt {tr.offerAmount} {tr.offerResource} voor{' '}
                      {tr.requestAmount} {tr.requestResource}
                    </span>
                    {tr.fromUid !== myPlayer.uid && (
                      <button
                        type="button"
                        disabled={busyAction}
                        onClick={() => onAction('trade_accept', { tradeId: tr.id })}
                        className="px-2.5 py-1 rounded-lg bg-emerald-600 text-white font-semibold"
                      >
                        Ruil accepteren
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <ChallengeCard
          challenges={challenges}
          answeredIds={answeredIds}
          busyAction={busyAction}
          titleLabel="Verzamel +55 Goud, +30 Kennis & +25 Voedsel"
          accentBg="bg-amber-600 hover:bg-amber-700"
          onAnswer={(id, opt) => onAnswerChallenge(id, opt)}
        />
      </div>
    );
  }

  // 5. KNOWLEDGE LEAGUE
  if (snapshot.gameId === 'knowledge-league') {
    const roundIdx = Number(wd.roundIndex ?? 0);
    return (
      <div className="space-y-5">
        <div className="rounded-2xl border border-rose-200 dark:border-rose-900 bg-rose-50/50 dark:bg-rose-950/20 p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
          <span className="font-bold text-rose-700 dark:text-rose-300 flex items-center gap-1.5">
            <Trophy className="w-4 h-4" />
            Toernooironde {Math.min(4, roundIdx + 1)} / 4
          </span>
          <span className="flex items-center gap-1 text-amber-600 font-bold">
            <Flame className="w-3.5 h-3.5" />
            Reeks {myPlayer.streak}x
          </span>
          <span className="font-mono font-bold text-slate-900 dark:text-slate-100">
            Cijfer: {myPlayer.grade.toFixed(1).replace('.', ',')} / 10
          </span>
        </div>

        <ChallengeCard
          challenges={challenges}
          answeredIds={answeredIds}
          busyAction={busyAction}
          titleLabel="Knowledge League Wedstrijdvraag"
          accentBg="bg-rose-600 hover:bg-rose-700"
          onAnswer={(id, opt) => onAnswerChallenge(id, opt)}
        />
      </div>
    );
  }

  // 6. EXPEDITION EARTH
  if (snapshot.gameId === 'expedition-earth') {
    const stage = Number(wd.stage ?? 0);
    const supplies = Number(wd.supplies ?? 100);
    const stages = ['Basiskamp', 'Vallei', 'Bergpas', 'Gletsjer', 'Observatorium', 'Poolstation', 'Top!'];

    return (
      <div className="space-y-5">
        <div className="rounded-2xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50/50 dark:bg-emerald-950/20 p-5 space-y-4">
          <div className="flex items-center justify-between text-xs font-bold">
            <span className="text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
              <Compass className="w-4 h-4" />
              Etappe {stage} / 6: {stages[Math.min(6, stage)]}
            </span>
            <span className="font-mono text-slate-700 dark:text-slate-300">
              Voorraden: {supplies}%
            </span>
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {stages.map((label, idx) => (
              <div
                key={label}
                className={`p-2 rounded-lg text-center text-[10px] font-bold border ${
                  idx <= stage
                    ? 'bg-emerald-600 text-white border-emerald-500'
                    : 'bg-white dark:bg-[#111827] border-slate-200 dark:border-slate-800 text-slate-400'
                }`}
              >
                {label}
              </div>
            ))}
          </div>
          <ClueShareBar
            placeholder="Deel een ontdekking uit de bronnen in het expeditielog..."
            buttonLabel="Logboek"
            busyAction={busyAction}
            onShare={(text) => onAction('share_clue', { text })}
          />
        </div>

        <ChallengeCard
          challenges={challenges}
          answeredIds={answeredIds}
          busyAction={busyAction}
          titleLabel="Expeditie-opdracht voor de volgende etappe"
          accentBg="bg-emerald-600 hover:bg-emerald-700"
          onAnswer={(id, opt) => onAnswerChallenge(id, opt)}
        />
      </div>
    );
  }

  // 7. ECOSYSTEM
  if (snapshot.gameId === 'ecosystem') {
    const flora = Number(wd.flora ?? 40);
    const fauna = Number(wd.fauna ?? 35);
    const water = Number(wd.water ?? 55);
    const energy = Number(wd.energy ?? 50);
    const slots = Array.isArray(wd.slots) ? (wd.slots as Array<string | null>) : Array(8).fill(null);

    const ECO_ITEMS = [
      { id: 'boom', label: 'Bos (15E)', icon: '🌲' },
      { id: 'meer', label: 'Zoetwatermeer (15E)', icon: '💧' },
      { id: 'vogel', label: 'Vogels (20E)', icon: '🦅' },
      { id: 'bijen', label: 'Bijenkorf (15E)', icon: '🐝' },
    ];

    return (
      <div className="space-y-5">
        <div className="rounded-2xl border border-lime-200 dark:border-lime-900 bg-lime-50/50 dark:bg-lime-950/20 p-5 space-y-4">
          <div className="grid grid-cols-4 gap-2 text-center text-xs tabular-nums">
            <div className="p-2 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800">
              <p className="text-[11px] text-slate-500">Flora</p>
              <p className="font-bold text-emerald-600">{flora}%</p>
            </div>
            <div className="p-2 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800">
              <p className="text-[11px] text-slate-500">Fauna</p>
              <p className="font-bold text-amber-600">{fauna}%</p>
            </div>
            <div className="p-2 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800">
              <p className="text-[11px] text-slate-500">Water</p>
              <p className="font-bold text-sky-600">{water}%</p>
            </div>
            <div className="p-2 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-800">
              <p className="text-[11px] text-slate-500">Bio-energie</p>
              <p className="font-bold text-lime-600">{energy}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {ECO_ITEMS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setEcoItem(item.id)}
                className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 ${
                  ecoItem === item.id
                    ? 'bg-lime-600 border-lime-600 text-white'
                    : 'bg-white dark:bg-[#111827] border-slate-200 dark:border-slate-800'
                }`}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </button>
            ))}
          </div>

          <div className="grid grid-cols-4 gap-2">
            {slots.map((cell, idx) => {
              const spec = ECO_ITEMS.find((i) => i.id === cell);
              return (
                <button
                  key={idx}
                  type="button"
                  disabled={busyAction}
                  onClick={() => onAction('ecosystem_place', { slotIndex: idx, itemKind: ecoItem })}
                  className="h-20 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] hover:border-lime-500 flex flex-col items-center justify-center text-xs"
                >
                  {spec ? (
                    <>
                      <span className="text-xl">{spec.icon}</span>
                      <span className="text-[10px] font-bold">{spec.label.split(' ')[0]}</span>
                    </>
                  ) : (
                    <span className="text-[10px] text-slate-400 flex items-center gap-0.5">
                      <Leaf className="w-3 h-3" /> Plaats
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <ChallengeCard
          challenges={challenges}
          answeredIds={answeredIds}
          busyAction={busyAction}
          titleLabel="Verdien +25 Bio-energie met een bronvraag"
          accentBg="bg-lime-600 hover:bg-lime-700"
          onAnswer={(id, opt) => onAnswerChallenge(id, opt)}
        />
      </div>
    );
  }

  // 8. THE ULTIMATE WORKSHOP
  const inv = (wd.partsInventory || {}) as Record<string, number>;
  const PARTS = [
    { id: 'gear', label: 'Tandwiel', icon: '⚙️' },
    { id: 'battery', label: 'Batterij', icon: '🔋' },
    { id: 'sensor', label: 'Sensor', icon: '📡' },
    { id: 'thruster', label: 'Aandrijving', icon: '🚀' },
    { id: 'shield', label: 'Schild', icon: '🛡️' },
  ];

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-orange-200 dark:border-orange-900 bg-orange-50/50 dark:bg-orange-950/20 p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Wrench className="w-4 h-4 text-orange-600" />
            <input
              type="text"
              value={machineName}
              onChange={(e) => setMachineName(e.target.value)}
              maxLength={40}
              className="px-3 py-1.5 rounded-lg bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-700 text-xs font-bold"
              placeholder="Naam van jouw uitvinding"
            />
          </div>
          <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
            Laatste test: {Number(wd.lastTestScore ?? 0)}%
          </span>
        </div>

        <div className="flex flex-wrap gap-2">
          {PARTS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setSelectedPart(p.id)}
              className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 ${
                selectedPart === p.id
                  ? 'bg-orange-600 border-orange-600 text-white'
                  : 'bg-white dark:bg-[#111827] border-slate-200 dark:border-slate-800'
              }`}
            >
              <span>{p.icon}</span>
              <span>{p.label} ({inv[p.id] || 0})</span>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-4 gap-2 max-w-md mx-auto">
          {blueprint.map((cell, idx) => {
            const spec = PARTS.find((p) => p.id === cell);
            return (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  const next = [...blueprint];
                  next[idx] = next[idx] ? null : selectedPart;
                  setBlueprint(next);
                }}
                className="h-16 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] hover:border-orange-500 flex flex-col items-center justify-center text-xs"
              >
                {spec ? (
                  <>
                    <span className="text-lg">{spec.icon}</span>
                    <span className="text-[10px] font-bold">{spec.label}</span>
                  </>
                ) : (
                  <span className="text-[10px] text-slate-400">Blauwdruk</span>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex justify-end">
          <button
            type="button"
            disabled={busyAction}
            onClick={() =>
              onAction('workshop_update', { blueprint, machineName, runTest: true })
            }
            className="px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold inline-flex items-center gap-1.5"
          >
            <Cpu className="w-4 h-4" />
            <span>Ontwerp testen &amp; delen in teamgalerij</span>
          </button>
        </div>
      </div>

      <ChallengeCard
        challenges={challenges}
        answeredIds={answeredIds}
        busyAction={busyAction}
        titleLabel="Verdien extra onderdelen met opdrachten uit de leerstof"
        accentBg="bg-orange-600 hover:bg-orange-700"
        onAnswer={(id, opt) => onAnswerChallenge(id, opt)}
      />

      {snapshot.workshopGallery.length > 0 && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] p-4 space-y-2.5">
          <h4 className="text-xs font-bold text-slate-900 dark:text-slate-100">
            Teamgalerij van Uitvindingen
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {snapshot.workshopGallery.map((entry) => (
              <div
                key={entry.uid}
                className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 text-xs"
              >
                <div>
                  <p className="font-bold text-slate-900 dark:text-slate-100">
                    {entry.avatar} {entry.machineName}
                  </p>
                  <p className="text-[11px] text-slate-500">
                    Door {entry.nickname} · {entry.efficiencyScore}% efficiëntie
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onAction('workshop_like', { targetUid: entry.uid })}
                  className="px-2.5 py-1 rounded-lg bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-700 flex items-center gap-1 text-rose-600 font-semibold"
                >
                  <Heart className="w-3.5 h-3.5 fill-current" />
                  <span>{entry.likes.length}</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
