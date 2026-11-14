import React, { useEffect, useMemo, useState } from 'react';
import {
  Box,
  CheckCircle2,
  Eye,
  Flame,
  HelpCircle,
  Lightbulb,
  RotateCcw,
  Send,
  Sparkles,
  Trophy,
  XCircle,
} from 'lucide-react';
import { StudySet } from '../../types';
import {
  ConceptItem,
  extractConcepts,
  extractQuestions,
  isCloseAnswer,
  normalizeForCompare,
  shuffleArray,
  SoloGameMode,
} from '../../lib/gameData';
import { playGameSound } from '../../lib/gameAudio';

interface RecallGamesStageProps {
  mode: SoloGameMode;
  studySet: StudySet;
  soundEnabled: boolean;
}

export const RecallGamesStage: React.FC<RecallGamesStageProps> = ({
  mode,
  studySet,
  soundEnabled,
}) => {
  const concepts = useMemo(() => extractConcepts(studySet), [studySet]);
  const questions = useMemo(() => extractQuestions(studySet), [studySet]);

  if (mode === 'leitner') {
    return <LeitnerGame concepts={concepts} soundEnabled={soundEnabled} />;
  }
  if (mode === 'type-recall') {
    return <TypeRecallGame concepts={concepts} soundEnabled={soundEnabled} />;
  }
  if (mode === 'cloze') {
    return <ClozeGame concepts={concepts} soundEnabled={soundEnabled} />;
  }
  if (mode === 'confidence') {
    return <ConfidenceBetGame questions={questions} soundEnabled={soundEnabled} />;
  }
  if (mode === 'feynman') {
    return <FeynmanCheckGame concepts={concepts} soundEnabled={soundEnabled} />;
  }
  return null;
};

/* ============================================================================
   1. LEITNER BOXEN (Spaced Repetition met 4 Leerdozen)
   ============================================================================ */
const LeitnerGame: React.FC<{ concepts: ConceptItem[]; soundEnabled: boolean }> = ({
  concepts,
  soundEnabled,
}) => {
  const [boxes, setBoxes] = useState<Record<string, number>>({});
  const [queue, setQueue] = useState<string[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [moves, setMoves] = useState(0);

  const reset = () => {
    const initial: Record<string, number> = {};
    concepts.forEach((c) => {
      initial[c.id] = 1;
    });
    setBoxes(initial);
    setQueue(shuffleArray(concepts.map((c) => c.id)));
    setRevealed(false);
    setMoves(0);
  };

  useEffect(() => {
    reset();
  }, [concepts]);

  if (concepts.length === 0) {
    return <p className="text-sm text-slate-500">Geen begrippen beschikbaar in deze spelset.</p>;
  }

  const currentId = queue[0];
  const current = concepts.find((c) => c.id === currentId);
  const counts = [1, 2, 3, 4].map(
    (b) => Object.values(boxes).filter((v) => v === b).length
  );
  const allMastered = queue.length === 0 && Object.keys(boxes).length > 0;

  const handleGrade = (knewIt: boolean) => {
    if (!current) return;
    setMoves((m) => m + 1);
    const curBox = boxes[current.id] || 1;
    const nextBox = knewIt ? Math.min(4, curBox + 1) : 1;
    const nextBoxes = { ...boxes, [current.id]: nextBox };
    setBoxes(nextBoxes);

    const rest = queue.slice(1);
    if (nextBox < 4) {
      // Lower boxes come back sooner; Box 1 after 2 cards, Box 2 after 4, Box 3 at end
      const insertAt =
        nextBox === 1 ? Math.min(2, rest.length) : nextBox === 2 ? Math.min(4, rest.length) : rest.length;
      const updated = [...rest];
      updated.splice(insertAt, 0, current.id);
      setQueue(updated);
    } else {
      setQueue(rest);
    }

    playGameSound(knewIt ? 'correct' : 'wrong', soundEnabled);
    setRevealed(false);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* 4 Leitner Boxes Overview */}
      <div className="grid grid-cols-4 gap-2.5">
        {[
          { box: 1, label: 'Doos 1 · Nieuw' },
          { box: 2, label: 'Doos 2 · Oefenen' },
          { box: 3, label: 'Doos 3 · Bijna vast' },
          { box: 4, label: 'Doos 4 · Meester' },
        ].map((b, i) => {
          const isCurrent = current && boxes[current.id] === b.box;
          return (
            <div
              key={b.box}
              className={`rounded-xl border p-3 text-center transition-colors ${
                b.box === 4
                  ? 'border-emerald-300 dark:border-emerald-800 bg-emerald-50/70 dark:bg-emerald-950/30'
                  : isCurrent
                    ? 'border-indigo-400 dark:border-indigo-700 bg-indigo-50/70 dark:bg-indigo-950/30'
                    : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900'
              }`}
            >
              <div className="flex items-center justify-center gap-1 text-xs font-medium text-slate-600 dark:text-slate-400">
                <Box className="w-3.5 h-3.5" />
                <span className="truncate">{b.label}</span>
              </div>
              <p className="mt-1 text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-slate-100">
                {counts[i]}
              </p>
            </div>
          );
        })}
      </div>

      {allMastered ? (
        <div className="py-10 text-center space-y-4">
          <Trophy className="w-10 h-10 text-amber-500 mx-auto" />
          <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            Alle {concepts.length} begrippen zitten in Doos 4!
          </h3>
          <p className="text-sm text-slate-600 dark:text-slate-400 tabular-nums">
            Voltooid in {moves} herhalingen.
          </p>
          <button
            type="button"
            onClick={() => {
              playGameSound('click', soundEnabled);
              reset();
            }}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium inline-flex items-center gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Opnieuw spelen</span>
          </button>
        </div>
      ) : (
        current && (
          <div className="space-y-4">
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              <span>Huidig niveau: Doos {boxes[current.id] || 1} van 4</span>
              <span>Nog in omloop: {queue.length}</span>
            </div>

            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-7 text-center space-y-4 min-h-[210px] flex flex-col items-center justify-center">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Begrip
              </span>
              <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">
                {current.term}
              </h3>

              {revealed ? (
                <div className="pt-4 border-t border-slate-200 dark:border-slate-800 w-full space-y-1">
                  <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400">
                    Betekenis
                  </span>
                  <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                    {current.definition}
                  </p>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    playGameSound('click', soundEnabled);
                    setRevealed(true);
                  }}
                  className="px-4 py-2 rounded-lg bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:border-indigo-500 inline-flex items-center gap-2"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>Antwoord tonen</span>
                </button>
              )}
            </div>

            {revealed && (
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => handleGrade(false)}
                  className="py-3 px-4 rounded-xl border border-red-300 dark:border-red-900 bg-red-50/70 dark:bg-red-950/30 text-red-700 dark:text-red-300 text-sm font-semibold hover:bg-red-100 dark:hover:bg-red-950/50"
                >
                  Vergeten (terug naar Doos 1)
                </button>
                <button
                  type="button"
                  onClick={() => handleGrade(true)}
                  className="py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold"
                >
                  Geweeten! (+1 doos)
                </button>
              </div>
            )}
          </div>
        )
      )}
    </div>
  );
};

/* ============================================================================
   2. TYP & TOETS (Actief Typen met Fuzzy Spelling Tolerantie)
   ============================================================================ */
const TypeRecallGame: React.FC<{ concepts: ConceptItem[]; soundEnabled: boolean }> = ({
  concepts,
  soundEnabled,
}) => {
  const [deck, setDeck] = useState<ConceptItem[]>([]);
  const [idx, setIdx] = useState(0);
  const [answer, setAnswer] = useState('');
  const [hintUsed, setHintUsed] = useState(false);
  const [status, setStatus] = useState<'idle' | 'correct' | 'wrong'>('idle');
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [correctCount, setCorrectCount] = useState(0);

  const reset = () => {
    setDeck(shuffleArray(concepts));
    setIdx(0);
    setAnswer('');
    setHintUsed(false);
    setStatus('idle');
    setScore(0);
    setStreak(0);
    setCorrectCount(0);
  };

  useEffect(() => {
    reset();
  }, [concepts]);

  if (concepts.length === 0) {
    return <p className="text-sm text-slate-500">Geen begrippen beschikbaar.</p>;
  }

  const finished = idx >= deck.length && deck.length > 0;
  const current = deck[idx];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!current || status !== 'idle' || !answer.trim()) return;
    const ok = isCloseAnswer(answer, current.term);
    if (ok) {
      const nextStreak = streak + 1;
      setStreak(nextStreak);
      setCorrectCount((c) => c + 1);
      setScore((s) => s + (hintUsed ? 60 : 100) + nextStreak * 15);
      setStatus('correct');
      playGameSound('correct', soundEnabled);
    } else {
      setStreak(0);
      setStatus('wrong');
      playGameSound('wrong', soundEnabled);
    }
  };

  const handleNext = () => {
    setIdx((i) => i + 1);
    setAnswer('');
    setHintUsed(false);
    setStatus('idle');
  };

  if (finished) {
    return (
      <div className="py-10 text-center space-y-4">
        <Trophy className="w-10 h-10 text-amber-500 mx-auto" />
        <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">
          Typ &amp; Toets afgerond!
        </h3>
        <p className="text-sm text-slate-600 dark:text-slate-400 tabular-nums">
          {correctCount} van {deck.length} begrippen goed · Score: {score} punten
        </p>
        <button
          type="button"
          onClick={reset}
          className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium inline-flex items-center gap-2"
        >
          <RotateCcw className="w-4 h-4" />
          <span>Opnieuw spelen</span>
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto space-y-5">
      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 tabular-nums">
        <span>Vraag {idx + 1} van {deck.length}</span>
        <div className="flex items-center gap-4">
          <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
            <Flame className="w-3.5 h-3.5" />
            Streak {streak}x
          </span>
          <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
            {score} ptn
          </span>
        </div>
      </div>

      {current && (
        <>
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-6 space-y-2">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Welk begrip hoort bij deze omschrijving?
            </span>
            <p className="text-base font-semibold text-slate-900 dark:text-slate-100 leading-relaxed">
              {current.definition}
            </p>
            {hintUsed && (
              <p className="text-xs font-mono text-indigo-600 dark:text-indigo-400 pt-1">
                Hint: begint met "{current.term.slice(0, 2)}..." ({current.term.length} tekens)
              </p>
            )}
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div className="flex gap-2">
              <input
                type="text"
                value={answer}
                disabled={status !== 'idle'}
                onChange={(e) => setAnswer(e.target.value)}
                placeholder="Typ het begrip..."
                autoFocus
                className="flex-1 px-4 py-2.5 rounded-xl bg-white dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              {status === 'idle' && (
                <button
                  type="submit"
                  className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold inline-flex items-center gap-1.5"
                >
                  <Send className="w-4 h-4" />
                  <span>Check</span>
                </button>
              )}
            </div>

            {status === 'idle' && !hintUsed && (
              <button
                type="button"
                onClick={() => setHintUsed(true)}
                className="text-xs font-medium text-slate-500 hover:text-indigo-600 inline-flex items-center gap-1"
              >
                <Lightbulb className="w-3.5 h-3.5" />
                <span>Geef beginletter-hint</span>
              </button>
            )}
          </form>

          {status !== 'idle' && (
            <div
              className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                status === 'correct'
                  ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800'
                  : 'bg-red-50 dark:bg-red-950/30 border-red-300 dark:border-red-900'
              }`}
            >
              <div className="flex items-start gap-2.5">
                {status === 'correct' ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                )}
                <div>
                  <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
                    {status === 'correct' ? 'Helemaal goed!' : `Juiste begrip: ${current.term}`}
                  </p>
                  {status === 'correct' && normalizeForCompare(answer) !== normalizeForCompare(current.term) && (
                    <p className="text-xs text-slate-600 dark:text-slate-400">
                      Exacte schrijfwijze: {current.term}
                    </p>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={handleNext}
                className="px-4 py-2 rounded-lg bg-slate-900 dark:bg-indigo-600 text-white text-xs font-semibold whitespace-nowrap"
              >
                Volgende
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

/* ============================================================================
   3. GATENVULLER (Cloze Test — Contextueel Invullen)
   ============================================================================ */
interface ClozeRound {
  promptSentence: string;
  missingWord: string;
  options: string[];
  fullExplanation: string;
}

const ClozeGame: React.FC<{ concepts: ConceptItem[]; soundEnabled: boolean }> = ({
  concepts,
  soundEnabled,
}) => {
  const rounds = useMemo<ClozeRound[]>(() => {
    if (concepts.length < 2) return [];
    return concepts.map((c, idx) => {
      // Try masking a substantive word inside definition, or build a context sentence
      const defWords = c.definition.split(/\s+/);
      const longCandidates = defWords
        .map((w) => w.replace(/[^a-zA-ZÀ-ÿ0-9-]/g, ''))
        .filter((w) => w.length >= 5 && normalizeForCompare(w) !== normalizeForCompare(c.term));

      let missing = c.term;
      let sentence = `${c.definition} — Dit hoort bij het begrip [ _____ ].`;

      if (c.definition.toLowerCase().includes(c.term.toLowerCase())) {
        const re = new RegExp(c.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        sentence = c.definition.replace(re, '[ _____ ]');
        missing = c.term;
      } else if (longCandidates.length > 0 && concepts.length >= 4) {
        const picked = longCandidates[Math.floor(longCandidates.length / 2)];
        const re = new RegExp(`\\b${picked.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
        if (re.test(c.definition)) {
          sentence = `${c.term}: ${c.definition.replace(re, '[ _____ ]')}`;
          missing = picked;
        }
      }

      const poolWords = concepts
        .filter((_, j) => j !== idx)
        .map((other) => (missing === c.term ? other.term : other.definition.split(/\s+/).find((w) => w.length >= 5)?.replace(/[^a-zA-ZÀ-ÿ0-9-]/g, '') || other.term))
        .filter((w) => w && normalizeForCompare(w) !== normalizeForCompare(missing));

      const uniqueDistractors = Array.from(new Set(poolWords)).slice(0, 3);
      for (const candidate of concepts) {
        if (uniqueDistractors.length >= 3) break;
        if (!uniqueDistractors.includes(candidate.term) && candidate.term !== missing) {
          uniqueDistractors.push(candidate.term);
        }
      }

      return {
        promptSentence: sentence,
        missingWord: missing,
        options: shuffleArray([missing, ...uniqueDistractors]),
        fullExplanation: `${c.term}: ${c.definition}`,
      };
    });
  }, [concepts]);

  const [idx, setIdx] = useState(0);
  const [chosen, setChosen] = useState<string | null>(null);
  const [score, setScore] = useState(0);

  const reset = () => {
    setIdx(0);
    setChosen(null);
    setScore(0);
  };

  useEffect(() => {
    reset();
  }, [rounds]);

  if (rounds.length === 0) {
    return <p className="text-sm text-slate-500">Minimaal 2 begrippen nodig voor Gatenvuller.</p>;
  }

  const finished = idx >= rounds.length;
  const current = rounds[idx];

  const pickOption = (opt: string) => {
    if (chosen !== null || !current) return;
    setChosen(opt);
    const ok = opt === current.missingWord;
    if (ok) {
      setScore((s) => s + 100);
      playGameSound('correct', soundEnabled);
    } else {
      playGameSound('wrong', soundEnabled);
    }
  };

  if (finished) {
    return (
      <div className="py-10 text-center space-y-4">
        <Trophy className="w-10 h-10 text-amber-500 mx-auto" />
        <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">
          Alle gaten ingevuld!
        </h3>
        <p className="text-sm font-mono font-bold tabular-nums text-indigo-600 dark:text-indigo-400">
          Eindscore: {score} / {rounds.length * 100} punten
        </p>
        <button
          type="button"
          onClick={reset}
          className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium inline-flex items-center gap-2"
        >
          <RotateCcw className="w-4 h-4" />
          <span>Opnieuw spelen</span>
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 tabular-nums">
        <span>Zin {idx + 1} van {rounds.length}</span>
        <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">{score} ptn</span>
      </div>

      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-6">
        <p className="text-base font-medium text-slate-900 dark:text-slate-100 leading-relaxed">
          {current.promptSentence.split('[ _____ ]').map((part, i, arr) => (
            <React.Fragment key={i}>
              {part}
              {i < arr.length - 1 && (
                <span
                  className={`inline-block mx-1 px-2.5 py-0.5 rounded-md font-bold border ${
                    chosen === null
                      ? 'bg-indigo-50 dark:bg-indigo-950/50 border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300'
                      : chosen === current.missingWord
                        ? 'bg-emerald-100 dark:bg-emerald-950/60 border-emerald-400 text-emerald-800 dark:text-emerald-300'
                        : 'bg-amber-100 dark:bg-amber-950/60 border-amber-400 text-amber-800 dark:text-amber-300'
                  }`}
                >
                  {chosen === null ? '_____' : current.missingWord}
                </span>
              )}
            </React.Fragment>
          ))}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {current.options.map((opt) => {
          const isRight = opt === current.missingWord;
          const isPicked = chosen === opt;
          const reveal = chosen !== null;
          return (
            <button
              key={opt}
              type="button"
              disabled={reveal}
              onClick={() => pickOption(opt)}
              className={`p-3.5 rounded-xl border text-left text-sm font-medium flex items-center justify-between gap-2 transition-colors ${
                !reveal
                  ? 'bg-white dark:bg-[#111827] border-slate-200 dark:border-slate-800 hover:border-indigo-500'
                  : isRight
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500 text-emerald-900 dark:text-emerald-200'
                    : isPicked
                      ? 'bg-red-50 dark:bg-red-950/40 border-red-500 text-red-900 dark:text-red-200'
                      : 'bg-slate-50/50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800 text-slate-400'
              }`}
            >
              <span>{opt}</span>
              {reveal && isRight && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
              {reveal && isPicked && !isRight && <XCircle className="w-4 h-4 text-red-600 shrink-0" />}
            </button>
          );
        })}
      </div>

      {chosen !== null && (
        <div className="flex items-center justify-between gap-4 p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <p className="text-xs text-slate-600 dark:text-slate-400">{current.fullExplanation}</p>
          <button
            type="button"
            onClick={() => {
              setIdx((i) => i + 1);
              setChosen(null);
            }}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shrink-0"
          >
            Volgende
          </button>
        </div>
      )}
    </div>
  );
};

/* ============================================================================
   4. ZEKERHEIDSWEDLOOP (Confidence Bet — Metacognitie)
   ============================================================================ */
type BetTier = { id: 'low' | 'mid' | 'high'; label: string; win: number; lose: number };

const BET_TIERS: BetTier[] = [
  { id: 'low', label: 'Gokje (+25 / -0)', win: 25, lose: 0 },
  { id: 'mid', label: 'Redelijk zeker (+75 / -35)', win: 75, lose: 35 },
  { id: 'high', label: '100% zeker (+150 / -100)', win: 150, lose: 100 },
];

const ConfidenceBetGame: React.FC<{
  questions: ReturnType<typeof extractQuestions>;
  soundEnabled: boolean;
}> = ({ questions, soundEnabled }) => {
  const [idx, setIdx] = useState(0);
  const [bet, setBet] = useState<BetTier>(BET_TIERS[1]);
  const [chosen, setChosen] = useState<number | null>(null);
  const [score, setScore] = useState(100);
  const [highConfCorrect, setHighConfCorrect] = useState(0);
  const [highConfTotal, setHighConfTotal] = useState(0);

  const reset = () => {
    setIdx(0);
    setBet(BET_TIERS[1]);
    setChosen(null);
    setScore(100);
    setHighConfCorrect(0);
    setHighConfTotal(0);
  };

  useEffect(() => {
    reset();
  }, [questions]);

  if (questions.length === 0) {
    return <p className="text-sm text-slate-500">Geen quizvragen gevonden in deze set.</p>;
  }

  const finished = idx >= questions.length;
  const current = questions[idx];

  const handleAnswer = (optIdx: number) => {
    if (chosen !== null || !current) return;
    setChosen(optIdx);
    const ok = optIdx === current.correctIndex;
    if (bet.id === 'high') {
      setHighConfTotal((t) => t + 1);
      if (ok) setHighConfCorrect((c) => c + 1);
    }
    if (ok) {
      setScore((s) => s + bet.win);
      playGameSound('correct', soundEnabled);
    } else {
      setScore((s) => Math.max(0, s - bet.lose));
      playGameSound('wrong', soundEnabled);
    }
  };

  if (finished) {
    return (
      <div className="py-10 text-center space-y-4">
        <Trophy className="w-10 h-10 text-amber-500 mx-auto" />
        <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">
          Zekerheidswedloop voltooid!
        </h3>
        <p className="text-lg font-mono font-bold tabular-nums text-indigo-600 dark:text-indigo-400">
          Eindbalans: {score} punten
        </p>
        {highConfTotal > 0 && (
          <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            Kalibratie (100% zeker): {highConfCorrect} van {highConfTotal} daadwerkelijk goed.
          </p>
        )}
        <button
          type="button"
          onClick={reset}
          className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium inline-flex items-center gap-2"
        >
          <RotateCcw className="w-4 h-4" />
          <span>Opnieuw spelen</span>
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 tabular-nums">
        <span>Vraag {idx + 1} van {questions.length}</span>
        <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
          Balans: {score} ptn
        </span>
      </div>

      <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
        {current.question}
      </h3>

      {/* Step 1: Confidence Bet */}
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
          <HelpCircle className="w-3.5 h-3.5" />
          <span>Stap 1: Hoe zeker ben je van je antwoord?</span>
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {BET_TIERS.map((tier) => (
            <button
              key={tier.id}
              type="button"
              disabled={chosen !== null}
              onClick={() => {
                playGameSound('click', soundEnabled);
                setBet(tier);
              }}
              className={`py-2 px-3 rounded-lg border text-xs font-semibold transition-colors ${
                bet.id === tier.id
                  ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300'
                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111827] text-slate-600 dark:text-slate-400'
              }`}
            >
              {tier.label}
            </button>
          ))}
        </div>
      </div>

      {/* Step 2: Options */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {current.options.map((opt, optIdx) => {
          const isRight = optIdx === current.correctIndex;
          const isPicked = chosen === optIdx;
          const reveal = chosen !== null;
          return (
            <button
              key={optIdx}
              type="button"
              disabled={reveal}
              onClick={() => handleAnswer(optIdx)}
              className={`p-4 rounded-xl border text-left text-sm font-medium flex items-start justify-between gap-2 transition-colors ${
                !reveal
                  ? 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-indigo-500'
                  : isRight
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-500 text-emerald-900 dark:text-emerald-200'
                    : isPicked
                      ? 'bg-red-50 dark:bg-red-950/40 border-red-500 text-red-900 dark:text-red-200'
                      : 'bg-slate-50/50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800 text-slate-400'
              }`}
            >
              <span>{opt}</span>
              {reveal && isRight && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />}
              {reveal && isPicked && !isRight && <XCircle className="w-4 h-4 text-red-600 shrink-0" />}
            </button>
          );
        })}
      </div>

      {chosen !== null && (
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-xs text-slate-600 dark:text-slate-400">
            <strong className="text-slate-900 dark:text-slate-100">
              {chosen === current.correctIndex ? `+${bet.win} punten!` : `-${bet.lose} punten.`}
            </strong>{' '}
            {current.explanation}
          </p>
          <button
            type="button"
            onClick={() => {
              setIdx((i) => i + 1);
              setChosen(null);
            }}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shrink-0"
          >
            Volgende vraag
          </button>
        </div>
      )}
    </div>
  );
};

/* ============================================================================
   5. FEYNMAN-CHECK (Blinde Herinnering & Zelfvergelijking)
   ============================================================================ */
const STOP_WORDS = new Set([
  'een', 'het', 'dat', 'die', 'voor', 'met', 'van', 'naar', 'door', 'wordt',
  'zijn', 'heeft', 'deze', 'maar', 'ook', 'als', 'bij', 'uit', 'over', 'waar',
]);

const FeynmanCheckGame: React.FC<{ concepts: ConceptItem[]; soundEnabled: boolean }> = ({
  concepts,
  soundEnabled,
}) => {
  const [idx, setIdx] = useState(0);
  const [draft, setDraft] = useState('');
  const [compared, setCompared] = useState(false);
  const [mastered, setMastered] = useState(0);

  const reset = () => {
    setIdx(0);
    setDraft('');
    setCompared(false);
    setMastered(0);
  };

  useEffect(() => {
    reset();
  }, [concepts]);

  if (concepts.length === 0) {
    return <p className="text-sm text-slate-500">Geen begrippen beschikbaar.</p>;
  }

  const finished = idx >= concepts.length;
  const current = concepts[idx];

  const keywords = useMemo(() => {
    if (!current) return [];
    const words = normalizeForCompare(current.definition)
      .split(' ')
      .filter((w) => w.length >= 4 && !STOP_WORDS.has(w));
    return Array.from(new Set(words)).slice(0, 8);
  }, [current]);

  const matchedKeywords = useMemo(() => {
    const normDraft = normalizeForCompare(draft);
    return keywords.filter((kw) => normDraft.includes(kw));
  }, [keywords, draft]);

  if (finished) {
    return (
      <div className="py-10 text-center space-y-4">
        <Sparkles className="w-10 h-10 text-indigo-500 mx-auto" />
        <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">
          Feynman-Check voltooid!
        </h3>
        <p className="text-sm text-slate-600 dark:text-slate-400 tabular-nums">
          Je beheerste {mastered} van {concepts.length} begrippen volledig in eigen woorden.
        </p>
        <button
          type="button"
          onClick={reset}
          className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium inline-flex items-center gap-2"
        >
          <RotateCcw className="w-4 h-4" />
          <span>Opnieuw oefenen</span>
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 tabular-nums">
        <span>Begrip {idx + 1} van {concepts.length}</span>
        <span>Beheerst: {mastered}</span>
      </div>

      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-6 space-y-2">
        <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400">
          Leg dit begrip uit alsof je het aan een klasgenoot vertelt:
        </span>
        <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">
          {current.term}
        </h3>
      </div>

      <textarea
        rows={3}
        disabled={compared}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder="Typ eerst kort uit je hoofd wat dit begrip betekent..."
        className="w-full px-4 py-3 rounded-xl bg-white dark:bg-[#0B0F17] border border-slate-200 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />

      {!compared ? (
        <button
          type="button"
          disabled={draft.trim().length < 3}
          onClick={() => {
            playGameSound('click', soundEnabled);
            setCompared(true);
          }}
          className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold disabled:opacity-50"
        >
          Vergelijk met modelantwoord
        </button>
      ) : (
        <div className="space-y-4">
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B0F17] space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-900 dark:text-slate-100">
                Officiële omschrijving
              </span>
              <span className="font-mono tabular-nums text-indigo-600 dark:text-indigo-400">
                {matchedKeywords.length} / {keywords.length} sleutelwoorden geraakt
              </span>
            </div>
            <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
              {current.definition}
            </p>
            {keywords.length > 0 && (
              <p className="text-xs text-slate-500 dark:text-slate-400 pt-1">
                Sleutelwoorden:{' '}
                {keywords.map((kw, i) => (
                  <span key={kw}>
                    <span
                      className={
                        matchedKeywords.includes(kw)
                          ? 'font-semibold text-emerald-600 dark:text-emerald-400 underline'
                          : 'text-slate-500 dark:text-slate-400'
                      }
                    >
                      {kw}
                    </span>
                    {i < keywords.length - 1 ? ' · ' : ''}
                  </span>
                ))}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => {
                playGameSound('wrong', soundEnabled);
                setIdx((i) => i + 1);
                setDraft('');
                setCompared(false);
              }}
              className="py-2.5 px-4 rounded-xl border border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-300 text-sm font-semibold hover:bg-amber-50 dark:hover:bg-amber-950/30"
            >
              Nog eens herhalen
            </button>
            <button
              type="button"
              onClick={() => {
                playGameSound('correct', soundEnabled);
                setMastered((m) => m + 1);
                setIdx((i) => i + 1);
                setDraft('');
                setCompared(false);
              }}
              className="py-2.5 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold"
            >
              Ik snap dit helemaal
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
