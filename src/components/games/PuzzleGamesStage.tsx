import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Eye,
  EyeOff,
  Lightbulb,
  Link2,
  Puzzle,
  Rocket,
  RotateCcw,
  Sparkles,
  Trophy,
} from 'lucide-react';
import { StudySet } from '../../types';
import {
  ConceptItem,
  extractConcepts,
  generateWordSearch,
  shuffleArray,
  SoloGameMode,
} from '../../lib/gameData';
import { playGameSound } from '../../lib/gameAudio';

interface PuzzleGamesStageProps {
  mode: SoloGameMode;
  studySet: StudySet;
  soundEnabled: boolean;
}

export const PuzzleGamesStage: React.FC<PuzzleGamesStageProps> = ({
  mode,
  studySet,
  soundEnabled,
}) => {
  const concepts = useMemo(() => extractConcepts(studySet), [studySet]);

  if (mode === 'wordle') {
    return <WordleGame concepts={concepts} soundEnabled={soundEnabled} />;
  }
  if (mode === 'hangman') {
    return <RocketHangmanGame concepts={concepts} soundEnabled={soundEnabled} />;
  }
  if (mode === 'anagram') {
    return <AnagramGame concepts={concepts} soundEnabled={soundEnabled} />;
  }
  if (mode === 'wordsearch') {
    return <WordSearchGame concepts={concepts} soundEnabled={soundEnabled} />;
  }
  if (mode === 'domino') {
    return <DominoChainGame concepts={concepts} soundEnabled={soundEnabled} />;
  }
  return null;
};

const QWERTY_ROWS = [
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'],
  ['ENTER', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', 'WIS'],
];

/* ============================================================================
   11. BEGRIPPEN WORDLE (6 Beurten met Kleurfeedback)
   ============================================================================ */
type LetterState = 'correct' | 'present' | 'absent';

function scoreWordleGuess(guess: string, target: string): LetterState[] {
  const result: LetterState[] = Array(target.length).fill('absent');
  const remaining: Record<string, number> = {};

  for (let i = 0; i < target.length; i++) {
    if (guess[i] === target[i]) {
      result[i] = 'correct';
    } else {
      remaining[target[i]] = (remaining[target[i]] || 0) + 1;
    }
  }

  for (let i = 0; i < target.length; i++) {
    if (result[i] === 'correct') continue;
    const ch = guess[i];
    if (remaining[ch] && remaining[ch] > 0) {
      result[i] = 'present';
      remaining[ch] -= 1;
    }
  }
  return result;
}

const WordleGame: React.FC<{ concepts: ConceptItem[]; soundEnabled: boolean }> = ({
  concepts,
  soundEnabled,
}) => {
  const validWords = useMemo(
    () => concepts.filter((c) => c.cleanWord.length >= 3 && c.cleanWord.length <= 9),
    [concepts]
  );

  const [wordIdx, setWordIdx] = useState(0);
  const [guesses, setGuesses] = useState<string[]>([]);
  const [currentGuess, setCurrentGuess] = useState('');
  const [showClue, setShowClue] = useState(true);
  const [status, setStatus] = useState<'playing' | 'won' | 'lost'>('playing');

  const current = validWords[wordIdx % Math.max(validWords.length, 1)];
  const target = current?.cleanWord || '';

  const startWord = (nextIdx: number) => {
    setWordIdx(nextIdx);
    setGuesses([]);
    setCurrentGuess('');
    setStatus('playing');
  };

  const submitGuess = () => {
    if (status !== 'playing' || currentGuess.length !== target.length) return;
    const nextGuesses = [...guesses, currentGuess];
    setGuesses(nextGuesses);
    setCurrentGuess('');

    if (currentGuess === target) {
      setStatus('won');
      playGameSound('win', soundEnabled);
    } else if (nextGuesses.length >= 6) {
      setStatus('lost');
      playGameSound('wrong', soundEnabled);
    } else {
      playGameSound('click', soundEnabled);
    }
  };

  const handleKeyInput = (key: string) => {
    if (status !== 'playing') return;
    if (key === 'ENTER') {
      submitGuess();
    } else if (key === 'WIS' || key === 'BACKSPACE') {
      setCurrentGuess((g) => g.slice(0, -1));
    } else if (/^[A-Z]$/.test(key) && currentGuess.length < target.length) {
      setCurrentGuess((g) => g + key);
    }
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toUpperCase();
      if (k === 'ENTER') {
        e.preventDefault();
        handleKeyInput('ENTER');
      } else if (k === 'BACKSPACE') {
        e.preventDefault();
        handleKeyInput('BACKSPACE');
      } else if (/^[A-Z]$/.test(k)) {
        handleKeyInput(k);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  if (validWords.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        Geen geschikte enkelvoudige begrippen (3–9 letters) gevonden voor Wordle in deze set.
      </p>
    );
  }

  // Compute keyboard letter colors
  const keyStates: Record<string, LetterState> = {};
  guesses.forEach((g) => {
    const states = scoreWordleGuess(g, target);
    g.split('').forEach((ch, idx) => {
      const st = states[idx];
      if (st === 'correct') keyStates[ch] = 'correct';
      else if (st === 'present' && keyStates[ch] !== 'correct') keyStates[ch] = 'present';
      else if (!keyStates[ch]) keyStates[ch] = 'absent';
    });
  });

  return (
    <div className="max-w-lg mx-auto space-y-5">
      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
        <span>
          Kernwoord ({target.length} letters) · Woord {(wordIdx % validWords.length) + 1} van{' '}
          {validWords.length}
        </span>
        <button
          type="button"
          onClick={() => setShowClue((s) => !s)}
          className="inline-flex items-center gap-1 text-indigo-600 dark:text-indigo-400 font-medium"
        >
          {showClue ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          <span>{showClue ? 'Hint verbergen' : 'Hint tonen'}</span>
        </button>
      </div>

      {showClue && (
        <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300">
          <strong className="text-slate-900 dark:text-slate-100">Aanwijzing: </strong>
          {current.definition}
        </div>
      )}

      {/* 6 Rows Grid */}
      <div className="space-y-1.5 flex flex-col items-center">
        {Array.from({ length: 6 }).map((_, rowIdx) => {
          const submitted = guesses[rowIdx];
          const isCurrent = rowIdx === guesses.length && status === 'playing';
          const rowText = submitted ?? (isCurrent ? currentGuess : '');
          const states = submitted ? scoreWordleGuess(submitted, target) : null;

          return (
            <div key={rowIdx} className="flex gap-1.5">
              {Array.from({ length: target.length }).map((__, colIdx) => {
                const ch = rowText[colIdx] || '';
                const st = states?.[colIdx];
                return (
                  <div
                    key={colIdx}
                    className={`w-10 h-10 sm:w-11 sm:h-11 rounded-lg border flex items-center justify-center font-mono font-bold text-base select-none ${
                      st === 'correct'
                        ? 'bg-emerald-600 border-emerald-600 text-white'
                        : st === 'present'
                          ? 'bg-amber-500 border-amber-500 text-white'
                          : st === 'absent'
                            ? 'bg-slate-600 border-slate-600 text-white'
                            : ch
                              ? 'bg-white dark:bg-[#111827] border-indigo-500 text-slate-900 dark:text-slate-100'
                              : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100'
                    }`}
                  >
                    {ch}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>

      <p className="text-center text-[11px] text-slate-500 dark:text-slate-400">
        Groen = juiste plek · Oranje = andere plek · Grijs = komt niet voor
      </p>

      {status !== 'playing' ? (
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 text-center space-y-3">
          <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
            {status === 'won'
              ? `Gevonden in ${guesses.length} beurten! (${current.term})`
              : `Helaas! Het woord was: ${current.term} (${target})`}
          </p>
          <button
            type="button"
            onClick={() => startWord(wordIdx + 1)}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold inline-flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Volgende woord</span>
          </button>
        </div>
      ) : (
        /* On-screen keyboard */
        <div className="space-y-1.5">
          {QWERTY_ROWS.map((row, rIdx) => (
            <div key={rIdx} className="flex justify-center gap-1">
              {row.map((k) => {
                const st = keyStates[k];
                const isWide = k === 'ENTER' || k === 'WIS';
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => handleKeyInput(k)}
                    className={`${
                      isWide ? 'px-2.5 text-[11px]' : 'w-8 sm:w-9 text-xs'
                    } h-10 rounded-md font-semibold transition-colors ${
                      st === 'correct'
                        ? 'bg-emerald-600 text-white'
                        : st === 'present'
                          ? 'bg-amber-500 text-white'
                          : st === 'absent'
                            ? 'bg-slate-400 dark:bg-slate-700 text-white opacity-70'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 hover:bg-slate-200 dark:hover:bg-slate-700'
                    }`}
                  >
                    {k}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/* ============================================================================
   12. RED DE RAKET (Galgje met Brandstofmeter)
   ============================================================================ */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

const RocketHangmanGame: React.FC<{ concepts: ConceptItem[]; soundEnabled: boolean }> = ({
  concepts,
  soundEnabled,
}) => {
  const valid = useMemo(() => concepts.filter((c) => c.cleanWord.length >= 3), [concepts]);
  const [idx, setIdx] = useState(0);
  const [guessed, setGuessed] = useState<string[]>([]);
  const [solvedCount, setSolvedCount] = useState(0);

  const current = valid[idx % Math.max(valid.length, 1)];
  const word = current?.cleanWord || '';

  const wrongGuesses = guessed.filter((l) => !word.includes(l));
  const livesLeft = Math.max(0, 6 - wrongGuesses.length);
  const won = word.length > 0 && word.split('').every((ch) => guessed.includes(ch));
  const lost = livesLeft === 0 && !won;

  const pickLetter = (letter: string) => {
    if (won || lost || guessed.includes(letter) || !word) return;
    const next = [...guessed, letter];
    setGuessed(next);
    if (word.includes(letter)) {
      const nowWon = word.split('').every((ch) => next.includes(ch));
      if (nowWon) {
        setSolvedCount((c) => c + 1);
        playGameSound('win', soundEnabled);
      } else {
        playGameSound('correct', soundEnabled);
      }
    } else {
      playGameSound('wrong', soundEnabled);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toUpperCase();
      if (/^[A-Z]$/.test(k)) pickLetter(k);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (valid.length === 0) {
    return <p className="text-sm text-slate-500">Geen woorden gevonden voor Red de Raket.</p>;
  }

  return (
    <div className="max-w-xl mx-auto space-y-5">
      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 tabular-nums">
        <span className="flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-200">
          <Rocket className="w-4 h-4 text-indigo-500" />
          Brandstof: {livesLeft} / 6
        </span>
        <span>Opgelost: {solvedCount}</span>
      </div>

      {/* Fuel Bar */}
      <div className="grid grid-cols-6 gap-1.5">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className={`h-2 rounded-full ${
              i < livesLeft ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-800'
            }`}
          />
        ))}
      </div>

      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-6 text-center space-y-4">
        <p className="text-xs text-slate-600 dark:text-slate-400">
          <strong>Betekenis:</strong> {current.definition}
        </p>

        <div className="flex flex-wrap justify-center gap-2 pt-2">
          {word.split('').map((ch, i) => {
            const visible = guessed.includes(ch) || lost;
            return (
              <span
                key={i}
                className={`w-9 h-11 rounded-lg border-b-2 flex items-center justify-center font-mono text-xl font-bold ${
                  lost && !guessed.includes(ch)
                    ? 'border-red-500 text-red-600 dark:text-red-400'
                    : visible
                      ? 'border-indigo-500 text-slate-900 dark:text-slate-100 bg-white dark:bg-[#111827]'
                      : 'border-slate-300 dark:border-slate-700 text-transparent bg-white/60 dark:bg-[#111827]/60'
                }`}
              >
                {visible ? ch : '_'}
              </span>
            );
          })}
        </div>
      </div>

      {(won || lost) ? (
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B0F17] flex items-center justify-between gap-3">
          <p className="text-sm font-bold text-slate-900 dark:text-slate-100">
            {won ? `Raket gered! (${current.term})` : `Brandstof op! Het begrip was: ${current.term}`}
          </p>
          <button
            type="button"
            onClick={() => {
              setIdx((i) => i + 1);
              setGuessed([]);
            }}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold shrink-0"
          >
            Volgend woord
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap justify-center gap-1.5">
          {ALPHABET.map((l) => {
            const used = guessed.includes(l);
            const hit = used && word.includes(l);
            return (
              <button
                key={l}
                type="button"
                disabled={used}
                onClick={() => pickLetter(l)}
                className={`w-9 h-9 rounded-lg font-mono text-xs font-bold transition-colors ${
                  hit
                    ? 'bg-emerald-600 text-white'
                    : used
                      ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 opacity-50'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 hover:bg-indigo-100 dark:hover:bg-indigo-950'
                }`}
              >
                {l}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

/* ============================================================================
   13. LETTERHUSSEL (Anagram Reconstructie)
   ============================================================================ */
const AnagramGame: React.FC<{ concepts: ConceptItem[]; soundEnabled: boolean }> = ({
  concepts,
  soundEnabled,
}) => {
  const valid = useMemo(
    () => concepts.filter((c) => c.cleanWord.length >= 3 && c.cleanWord.length <= 12),
    [concepts]
  );
  const [idx, setIdx] = useState(0);
  const [pool, setPool] = useState<Array<{ id: number; ch: string }>>([]);
  const [picked, setPicked] = useState<Array<{ id: number; ch: string }>>([]);
  const [solved, setSolved] = useState(false);
  const [score, setScore] = useState(0);

  const current = valid[idx % Math.max(valid.length, 1)];
  const target = current?.cleanWord || '';

  const initRound = (word: string) => {
    const chars = word.split('').map((ch, i) => ({ id: i, ch }));
    let shuffled = shuffleArray(chars);
    if (shuffled.map((x) => x.ch).join('') === word && word.length > 2) {
      shuffled = [...shuffled.slice(1), shuffled[0]];
    }
    setPool(shuffled);
    setPicked([]);
    setSolved(false);
  };

  useEffect(() => {
    if (target) initRound(target);
  }, [idx, target]);

  if (valid.length === 0) {
    return <p className="text-sm text-slate-500">Geen woorden beschikbaar voor Letterhussel.</p>;
  }

  const pickTile = (tile: { id: number; ch: string }) => {
    if (solved) return;
    const nextPicked = [...picked, tile];
    setPool((p) => p.filter((x) => x.id !== tile.id));
    setPicked(nextPicked);

    const built = nextPicked.map((x) => x.ch).join('');
    if (built === target) {
      setSolved(true);
      setScore((s) => s + 100);
      playGameSound('correct', soundEnabled);
    } else if (nextPicked.length === target.length) {
      playGameSound('wrong', soundEnabled);
    } else {
      playGameSound('click', soundEnabled);
    }
  };

  const unpickTile = (tile: { id: number; ch: string }) => {
    if (solved) return;
    setPicked((p) => p.filter((x) => x.id !== tile.id));
    setPool((p) => [...p, tile]);
  };

  return (
    <div className="max-w-xl mx-auto space-y-5">
      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 tabular-nums">
        <span>Woord {(idx % valid.length) + 1} van {valid.length}</span>
        <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">{score} ptn</span>
      </div>

      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-6 text-center space-y-2">
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
          Bouw het begrip bij deze omschrijving:
        </span>
        <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
          {current.definition}
        </p>
      </div>

      {/* Answer Slots */}
      <div className="min-h-[56px] p-3 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 flex flex-wrap justify-center gap-2">
        {picked.length === 0 ? (
          <span className="text-xs text-slate-400 self-center">
            Klik op de lettertegels hieronder...
          </span>
        ) : (
          picked.map((tile) => (
            <button
              key={tile.id}
              type="button"
              onClick={() => unpickTile(tile)}
              className={`w-10 h-10 rounded-lg font-mono font-bold text-base border ${
                solved
                  ? 'bg-emerald-600 border-emerald-600 text-white'
                  : 'bg-indigo-600 border-indigo-600 text-white hover:bg-indigo-700'
              }`}
            >
              {tile.ch}
            </button>
          ))
        )}
      </div>

      {/* Scrambled Pool */}
      {!solved ? (
        <div className="space-y-3">
          <div className="flex flex-wrap justify-center gap-2">
            {pool.map((tile) => (
              <button
                key={tile.id}
                type="button"
                onClick={() => pickTile(tile)}
                className="w-10 h-10 rounded-lg font-mono font-bold text-base bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-700 hover:border-indigo-500 text-slate-900 dark:text-slate-100"
              >
                {tile.ch}
              </button>
            ))}
          </div>

          <div className="flex justify-center gap-3">
            <button
              type="button"
              onClick={() => initRound(target)}
              className="text-xs font-medium text-slate-500 hover:text-slate-900 dark:hover:text-slate-200"
            >
              Reset letters
            </button>
          </div>
        </div>
      ) : (
        <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-300 dark:border-emerald-800 flex items-center justify-between">
          <span className="text-sm font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            Goed opgelost: {current.term}
          </span>
          <button
            type="button"
            onClick={() => setIdx((i) => i + 1)}
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold"
          >
            Volgende
          </button>
        </div>
      )}
    </div>
  );
};

/* ============================================================================
   14. WOORDZOEKER (Interactief 10x10 Letterrooster)
   ============================================================================ */
const WordSearchGame: React.FC<{ concepts: ConceptItem[]; soundEnabled: boolean }> = ({
  concepts,
  soundEnabled,
}) => {
  const [seed, setSeed] = useState(0);
  const puzzle = useMemo(() => generateWordSearch(concepts, 10), [concepts, seed]);
  const [startCell, setStartCell] = useState<{ r: number; c: number } | null>(null);
  const [foundWords, setFoundWords] = useState<string[]>([]);
  const [hintCell, setHintCell] = useState<string | null>(null);

  useEffect(() => {
    setStartCell(null);
    setFoundWords([]);
    setHintCell(null);
  }, [puzzle]);

  if (puzzle.placed.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        Geen geschikte begrippen gevonden voor een Woordzoeker-rooster.
      </p>
    );
  }

  const foundCoordSet = new Set<string>();
  puzzle.placed
    .filter((w) => foundWords.includes(w.word))
    .forEach((w) => w.coords.forEach((pt) => foundCoordSet.add(`${pt.r}-${pt.c}`)));

  const handleCellClick = (r: number, c: number) => {
    if (!startCell) {
      setStartCell({ r, c });
      playGameSound('click', soundEnabled);
      return;
    }
    if (startCell.r === r && startCell.c === c) {
      setStartCell(null);
      return;
    }

    const dr = r - startCell.r;
    const dc = c - startCell.c;
    const steps = Math.max(Math.abs(dr), Math.abs(dc));
    const isStraight = dr === 0 || dc === 0 || Math.abs(dr) === Math.abs(dc);

    if (!isStraight) {
      setStartCell({ r, c });
      return;
    }

    const stepR = dr === 0 ? 0 : dr / Math.abs(dr);
    const stepC = dc === 0 ? 0 : dc / Math.abs(dc);
    let forward = '';
    for (let i = 0; i <= steps; i++) {
      forward += puzzle.grid[startCell.r + stepR * i][startCell.c + stepC * i];
    }
    const backward = forward.split('').reverse().join('');

    const match = puzzle.placed.find(
      (w) => !foundWords.includes(w.word) && (w.word === forward || w.word === backward)
    );

    if (match) {
      const next = [...foundWords, match.word];
      setFoundWords(next);
      setHintCell(null);
      playGameSound(next.length === puzzle.placed.length ? 'win' : 'correct', soundEnabled);
    } else {
      playGameSound('wrong', soundEnabled);
    }
    setStartCell(null);
  };

  const showHint = () => {
    const remaining = puzzle.placed.find((w) => !foundWords.includes(w.word));
    if (!remaining) return;
    const first = remaining.coords[0];
    setHintCell(`${first.r}-${first.c}`);
  };

  const allFound = foundWords.length === puzzle.placed.length;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      <div className="lg:col-span-7 space-y-3">
        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <span>
            {startCell
              ? 'Klik nu op de eindletter van het woord'
              : 'Klik op de beginletter en daarna op de eindletter'}
          </span>
          <button
            type="button"
            onClick={showHint}
            className="text-indigo-600 dark:text-indigo-400 font-medium inline-flex items-center gap-1"
          >
            <Lightbulb className="w-3.5 h-3.5" />
            <span>Hint eerste letter</span>
          </button>
        </div>

        <div className="grid grid-cols-10 gap-1 p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 max-w-[440px] mx-auto">
          {puzzle.grid.map((row, r) =>
            row.map((letter, c) => {
              const key = `${r}-${c}`;
              const isStart = startCell?.r === r && startCell?.c === c;
              const isFound = foundCoordSet.has(key);
              const isHint = hintCell === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleCellClick(r, c)}
                  className={`aspect-square rounded-md font-mono font-bold text-sm sm:text-base flex items-center justify-center transition-colors ${
                    isStart
                      ? 'bg-indigo-600 text-white'
                      : isFound
                        ? 'bg-emerald-600 text-white'
                        : isHint
                          ? 'bg-amber-200 dark:bg-amber-900/60 text-amber-900 dark:text-amber-200 border border-amber-400'
                          : 'bg-white dark:bg-[#111827] text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-800 hover:border-indigo-400'
                  }`}
                >
                  {letter}
                </button>
              );
            })
          )}
        </div>
      </div>

      <div className="lg:col-span-5 space-y-3">
        <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300 tabular-nums">
          <span>Te vinden begrippen ({foundWords.length} / {puzzle.placed.length})</span>
          <button
            type="button"
            onClick={() => setSeed((s) => s + 1)}
            className="text-indigo-600 dark:text-indigo-400 inline-flex items-center gap-1"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Nieuw rooster</span>
          </button>
        </div>

        {allFound && (
          <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-300 dark:border-emerald-800 text-xs font-semibold text-emerald-800 dark:text-emerald-300 flex items-center gap-2">
            <Trophy className="w-4 h-4 shrink-0" />
            <span>Alle verborgen begrippen gevonden!</span>
          </div>
        )}

        <div className="space-y-2">
          {puzzle.placed.map((w) => {
            const done = foundWords.includes(w.word);
            return (
              <div
                key={w.word}
                className={`p-3 rounded-xl border text-xs transition-colors ${
                  done
                    ? 'bg-emerald-50/70 dark:bg-emerald-950/20 border-emerald-300 dark:border-emerald-800 opacity-75'
                    : 'bg-white dark:bg-[#0B0F17] border-slate-200 dark:border-slate-800'
                }`}
              >
                <p className={`font-bold ${done ? 'line-through text-emerald-700 dark:text-emerald-300' : 'text-slate-900 dark:text-slate-100'}`}>
                  {done ? `${w.term} (${w.word})` : `${w.word.length} letters · Hint:`}
                </p>
                <p className="text-slate-600 dark:text-slate-400 mt-0.5">{w.definition}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

/* ============================================================================
   15. KETTINGREACTIE DOMINO (Verbind Definitie -> Begrip Ketting)
   ============================================================================ */
interface DominoTile {
  id: string;
  leftDef: string;
  rightTerm: string;
  expectsFromPrevId: string;
}

const DominoChainGame: React.FC<{ concepts: ConceptItem[]; soundEnabled: boolean }> = ({
  concepts,
  soundEnabled,
}) => {
  const [chainConcepts, setChainConcepts] = useState<ConceptItem[]>([]);
  const [placedCount, setPlacedCount] = useState(1);
  const [hand, setHand] = useState<DominoTile[]>([]);
  const [mistakes, setMistakes] = useState(0);

  const reset = () => {
    const slice = shuffleArray(concepts).slice(0, Math.min(6, concepts.length));
    setChainConcepts(slice);
    setPlacedCount(1);
    setMistakes(0);

    if (slice.length >= 2) {
      const tiles: DominoTile[] = [];
      for (let i = 1; i < slice.length; i++) {
        tiles.push({
          id: `dom-${i}`,
          leftDef: slice[i - 1].definition,
          rightTerm: slice[i].term,
          expectsFromPrevId: slice[i - 1].id,
        });
      }
      setHand(shuffleArray(tiles));
    } else {
      setHand([]);
    }
  };

  useEffect(() => {
    reset();
  }, [concepts]);

  if (concepts.length < 3) {
    return <p className="text-sm text-slate-500">Minimaal 3 begrippen nodig voor Domino.</p>;
  }

  const activeEndConcept = chainConcepts[placedCount - 1];
  const finished = hand.length === 0 && chainConcepts.length > 0;

  const pickDomino = (tile: DominoTile) => {
    if (!activeEndConcept) return;
    if (tile.expectsFromPrevId === activeEndConcept.id) {
      const nextHand = hand.filter((h) => h.id !== tile.id);
      setHand(nextHand);
      setPlacedCount((c) => c + 1);
      playGameSound(nextHand.length === 0 ? 'win' : 'correct', soundEnabled);
    } else {
      setMistakes((m) => m + 1);
      playGameSound('wrong', soundEnabled);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 tabular-nums">
        <span>Keten voortgang: {placedCount} / {chainConcepts.length}</span>
        <span>Foute pogingen: {mistakes}</span>
      </div>

      {/* Placed Chain */}
      <div className="flex flex-wrap items-center gap-2 p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
        {chainConcepts.slice(0, placedCount).map((c, idx) => (
          <React.Fragment key={c.id}>
            {idx > 0 && <Link2 className="w-4 h-4 text-emerald-500 shrink-0" />}
            <div className="px-3 py-2 rounded-xl bg-white dark:bg-[#111827] border border-slate-200 dark:border-slate-700 text-xs">
              <span className="font-bold text-indigo-600 dark:text-indigo-400">{c.term}</span>
              {idx === placedCount - 1 && !finished && (
                <span className="text-slate-500 dark:text-slate-400"> → zoek definitie</span>
              )}
            </div>
          </React.Fragment>
        ))}
      </div>

      {finished ? (
        <div className="py-8 text-center space-y-4">
          <Sparkles className="w-10 h-10 text-emerald-500 mx-auto" />
          <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100">
            Kettingreactie compleet ({mistakes} fouten)!
          </h3>
          <button
            type="button"
            onClick={reset}
            className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium inline-flex items-center gap-2"
          >
            <RotateCcw className="w-4 h-4" />
            <span>Nieuwe ketting</span>
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            Kies de dominosteen waarvan de linkerkant past bij{' '}
            <span className="text-indigo-600 dark:text-indigo-400">{activeEndConcept?.term}</span>:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {hand.map((tile) => (
              <button
                key={tile.id}
                type="button"
                onClick={() => pickDomino(tile)}
                className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B0F17] hover:border-indigo-500 grid grid-cols-12 gap-2 text-left items-center transition-colors"
              >
                <div className="col-span-7 text-xs text-slate-700 dark:text-slate-300 pr-2 border-r border-slate-200 dark:border-slate-800">
                  {tile.leftDef}
                </div>
                <div className="col-span-5 text-xs font-bold text-indigo-600 dark:text-indigo-400 pl-1">
                  {tile.rightTerm}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
