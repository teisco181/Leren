import React, { useEffect, useMemo, useState } from 'react';
import {
  Archive,
  BookOpen,
  CheckCircle2,
  ClipboardList,
  FileSearch,
  Footprints,
  Search,
  UserCheck,
} from 'lucide-react';
import { isCloseAnswer, shuffleArray } from '../../../lib/gameData';
import {
  checkSoloGameSufficiency,
  getStrictConcepts,
  getStrictPuzzles,
  getStrictQuestions,
} from '../../../lib/newGamesData';
import { playGameSound } from '../../../lib/gameAudio';
import {
  calculateDutchGrade,
  GAME_THEMES,
  GameDifficulty,
  GameResultScreen,
  GameStartScreen,
} from '../GameShell';
import type { OriginalGameProps } from './OriginalGamesStage';

interface ClueSpot {
  id: number;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  clueFoundText: string;
}

const theme = GAME_THEMES.indigo;

export const DetectiveAcademyGame: React.FC<OriginalGameProps> = ({
  material,
  studySet,
  soundEnabled,
  onSaveProgress,
  onExit,
}) => {
  const source = material ?? studySet;
  const concepts = useMemo(() => getStrictConcepts(source), [source]);
  const questions = useMemo(() => getStrictQuestions(source), [source]);
  const puzzles = useMemo(() => getStrictPuzzles(source), [source]);

  const insufficientReason = useMemo(() => {
    if (material) {
      const check = checkSoloGameSufficiency('detective-academy', material);
      if (!check.ok) return check.reason;
    }
    if (concepts.length < 3 && questions.length + puzzles.length < 3) {
      return 'Detective Academy vereist minimaal 3 begrippen of vragen/puzzels uit jouw geselecteerde leerstof.';
    }
    return undefined;
  }, [material, concepts.length, questions.length, puzzles.length]);

  const sourceLabel = material
    ? material.fileStatuses.filter((f) => f.readable).map((f) => f.title).join(', ') || material.title
    : studySet?.sourceTitle || studySet?.title || 'Geselecteerde leerstof';

  const [phase, setPhase] = useState<'start' | 'play' | 'result'>('start');
  const [difficulty, setDifficulty] = useState<GameDifficulty>('normal');
  const [activeSpot, setActiveSpot] = useState<number>(1);
  const [solvedSpots, setSolvedSpots] = useState<number[]>([]);
  const [correct, setCorrect] = useState(0);
  const [wrong, setWrong] = useState(0);
  const [score, setScore] = useState(0);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [wordGuess, setWordGuess] = useState('');
  const [caseSolved, setCaseSolved] = useState(false);

  const q1 = questions[0];
  const clueConcept = concepts[0];
  const scrambledTerm = useMemo(() => {
    if (!clueConcept) return '';
    return shuffleArray(clueConcept.cleanWord.split('')).join(' · ');
  }, [clueConcept]);

  const c3 = concepts[1] || concepts[0];
  const c3Options = useMemo(() => {
    if (!c3) return [];
    const others = shuffleArray(concepts.filter((c) => c.id !== c3.id)).slice(0, 3);
    return shuffleArray([c3, ...others]);
  }, [concepts, c3]);

  const q4 = questions[1] || questions[0];

  // Grounded final deduction — strictly from analyzed puzzles/questions/concepts (NO invented suspects)
  const finalDeduction = useMemo(() => {
    const p = puzzles[0];
    if (p) {
      return {
        title: 'Einddeductie uit jouw bronnen',
        prompt: p.prompt,
        options: p.options,
        answer: p.answer,
        explanation: p.explanation,
        sourceTitle: p.sourceTitle,
        sourceSection: p.sourceSection,
      };
    }
    const q = questions[2] || questions[0];
    if (q) {
      return {
        title: 'Einddeductie uit jouw bronnen',
        prompt: q.question,
        options: q.options,
        answer: q.options[q.correctIndex],
        explanation: q.explanation,
        sourceTitle: q.sourceTitle,
        sourceSection: q.sourceSection,
      };
    }
    if (c3) {
      return {
        title: 'Einddeductie uit jouw bronnen',
        prompt: `Welk kernbegrip past het best bij deze omschrijving: "${c3.definition}"?`,
        options: c3Options.map((o) => o.term),
        answer: c3.term,
        explanation: `${c3.term}: ${c3.definition}`,
        sourceTitle: c3.sourceTitle,
        sourceSection: c3.sourceSection,
      };
    }
    return null;
  }, [puzzles, questions, c3, c3Options]);

  // Build dossier spots 100% grounded in selected material
  const spots = useMemo<ClueSpot[]>(() => {
    const list: ClueSpot[] = [];
    if (q1) {
      list.push({
        id: 1,
        name: '1. Dossierstuk A',
        icon: ClipboardList,
        clueFoundText: `${q1.explanation} (Bron: ${q1.sourceTitle} · ${q1.sourceSection})`,
      });
    }
    if (clueConcept && clueConcept.cleanWord.length >= 3) {
      list.push({
        id: 2,
        name: `${list.length + 1}. Ontcijferde Notitie`,
        icon: Archive,
        clueFoundText: `${clueConcept.term}: ${clueConcept.definition} (Bron: ${clueConcept.sourceTitle} · ${clueConcept.sourceSection})`,
      });
    }
    if (c3 && c3Options.length >= 2) {
      list.push({
        id: 3,
        name: `${list.length + 1}. Begripsspoor`,
        icon: Footprints,
        clueFoundText: `${c3.term}: ${c3.definition} (Bron: ${c3.sourceTitle} · ${c3.sourceSection})`,
      });
    }
    if (q4 && q4.question !== q1?.question) {
      list.push({
        id: 4,
        name: `${list.length + 1}. Archiefcheck`,
        icon: FileSearch,
        clueFoundText: `${q4.explanation} (Bron: ${q4.sourceTitle} · ${q4.sourceSection})`,
      });
    }
    return list;
  }, [q1, clueConcept, c3, c3Options.length, q4]);

  const startGame = () => {
    if (insufficientReason || spots.length === 0) return;
    setActiveSpot(spots[0].id);
    setSolvedSpots([]);
    setCorrect(0);
    setWrong(0);
    setScore(0);
    setFeedback(null);
    setWordGuess('');
    setCaseSolved(false);
    setPhase('play');
  };

  useEffect(() => {
    if (phase === 'result') {
      onSaveProgress?.({
        difficulty,
        score,
        completed: true,
        progress: JSON.stringify({ caseSolved, correct, wrong, score }),
      });
    }
  }, [phase]);

  const unlockSpot = (spotId: number, msg: string) => {
    playGameSound('correct', soundEnabled);
    setCorrect((c) => c + 1);
    setScore((s) => s + 200);
    setFeedback(msg);
    setSolvedSpots((prev) => {
      const next = prev.includes(spotId) ? prev : [...prev, spotId];
      const nextOpen = spots.find((sp) => !next.includes(sp.id));
      if (nextOpen) setActiveSpot(nextOpen.id);
      return next;
    });
  };

  const failAttempt = (msg: string) => {
    playGameSound('wrong', soundEnabled);
    setWrong((w) => w + 1);
    setFeedback(msg);
  };

  const submitConclusion = (chosen: string) => {
    if (!finalDeduction) return;
    if (chosen === finalDeduction.answer) {
      playGameSound('win', soundEnabled);
      setCorrect((c) => c + 1);
      setScore((s) => s + 300);
      setCaseSolved(true);
      setPhase('result');
    } else {
      failAttempt(
        `Die conclusie klopt niet met de brontekst in je dossier. Hint: bekijk "${finalDeduction.sourceTitle} · ${finalDeduction.sourceSection}" in je bewijsstukken rechts.`
      );
    }
  };

  if (phase === 'start') {
    return (
      <GameStartScreen
        title="Detective Academy – Los de zaak op"
        description="Onderzoek alle dossierstukken uit jouw geselecteerde bestanden, ontcijfer de begrippen en trek op basis van de verzamelde bewijzen de juiste eindconclusie!"
        durationLabel="6–9 min · Deductie"
        theme={theme}
        icon={<Search className="w-6 h-6" />}
        difficulty={difficulty}
        onChangeDifficulty={setDifficulty}
        sourceLabel={sourceLabel}
        insufficientReason={insufficientReason}
        onStart={startGame}
      />
    );
  }

  if (phase === 'result') {
    const grade = calculateDutchGrade(correct, wrong, caseSolved ? 0.5 : 0);
    return (
      <GameResultScreen
        title="Detective Academy"
        score={score}
        correct={correct}
        wrong={wrong}
        grade={grade}
        evaluation={`Onderzoek geslaagd! ${finalDeduction?.explanation || ''}`}
        sourceSummary={sourceLabel}
        theme={theme}
        onReplay={startGame}
        onExit={onExit}
      />
    );
  }

  const allCluesCollected = spots.every((sp) => solvedSpots.includes(sp.id));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
      <div className="lg:col-span-7 space-y-4">
        <div className="flex items-center justify-between text-xs tabular-nums">
          <span className="font-semibold text-indigo-600 dark:text-indigo-400">
            Aanwijzingen gevonden: {solvedSpots.length} / {spots.length}
          </span>
          <span className="font-mono font-bold text-indigo-600 dark:text-indigo-400">
            {score} ptn
          </span>
        </div>

        <div
          className={`grid grid-cols-2 gap-2.5 ${
            spots.length >= 4
              ? 'sm:grid-cols-4'
              : spots.length === 3
                ? 'sm:grid-cols-3'
                : 'sm:grid-cols-2'
          }`}
        >
          {spots.map((sp) => {
            const Icon = sp.icon;
            const done = solvedSpots.includes(sp.id);
            const active = activeSpot === sp.id && !allCluesCollected;
            return (
              <button
                key={sp.id}
                type="button"
                onClick={() => {
                  setFeedback(null);
                  setActiveSpot(sp.id);
                }}
                className={`p-3 rounded-xl border text-left space-y-1.5 transition-colors ${
                  done
                    ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-400 text-emerald-800 dark:text-emerald-300'
                    : active
                      ? 'bg-indigo-600 border-indigo-600 text-white'
                      : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-indigo-400'
                }`}
              >
                <div className="flex items-center justify-between">
                  <Icon className="w-4 h-4" />
                  {done && <CheckCircle2 className="w-4 h-4 text-emerald-500" />}
                </div>
                <span className="block text-xs font-bold">{sp.name}</span>
              </button>
            );
          })}
        </div>

        {feedback && (
          <div className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-800 dark:text-slate-200">
            {feedback}
          </div>
        )}

        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0B0F17] p-5 space-y-4">
          {allCluesCollected && finalDeduction ? (
            <div className="space-y-4">
              <p className="text-[11px] font-medium text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
                <BookOpen className="w-3.5 h-3.5" />
                <span>Bron: {finalDeduction.sourceTitle} · {finalDeduction.sourceSection}</span>
              </p>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <UserCheck className="w-5 h-5 text-indigo-500" />
                <span>{finalDeduction.title}</span>
              </h3>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                {finalDeduction.prompt}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {finalDeduction.options.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => submitConclusion(opt)}
                    className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 hover:border-indigo-500 text-left text-sm font-semibold transition-colors"
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>
          ) : solvedSpots.includes(activeSpot) ? (
            <p className="text-sm text-slate-600 dark:text-slate-400 py-4 text-center">
              Je hebt dit dossierstuk al onderzocht. Klik op een volgend spoor hierboven!
            </p>
          ) : activeSpot === 1 && q1 ? (
            <div className="space-y-3">
              <p className="text-[11px] font-medium text-indigo-600 dark:text-indigo-400">
                Bron: {q1.sourceTitle} · {q1.sourceSection}
              </p>
              <h3 className="text-sm font-bold text-indigo-600 dark:text-indigo-400">
                Dossierstuk onderzoeken
              </h3>
              <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{q1.question}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {q1.options.map((opt, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() =>
                      idx === q1.correctIndex
                        ? unlockSpot(1, `Aanwijzing toegevoegd aan dossier! (${q1.explanation})`)
                        : failAttempt(`Niet juist. Uitleg uit je bron: ${q1.explanation}`)
                    }
                    className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 hover:border-indigo-500 text-left text-xs font-medium"
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </div>
          ) : activeSpot === 2 && clueConcept ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (
                  isCloseAnswer(wordGuess, clueConcept.cleanWord) ||
                  isCloseAnswer(wordGuess, clueConcept.term)
                ) {
                  unlockSpot(2, `Notitie ontcijferd! (${clueConcept.term})`);
                } else {
                  failAttempt(`Nog niet goed. Hint: het begint met "${clueConcept.cleanWord.slice(0, 2)}".`);
                }
              }}
              className="space-y-3"
            >
              <p className="text-[11px] font-medium text-indigo-600 dark:text-indigo-400">
                Bron: {clueConcept.sourceTitle} · {clueConcept.sourceSection}
              </p>
              <h3 className="text-sm font-bold text-indigo-600 dark:text-indigo-400">
                Ontcijfer het begrip uit de brontekst
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Betekenis: <strong>{clueConcept.definition}</strong>
              </p>
              <p className="font-mono text-sm font-bold text-slate-900 dark:text-slate-100">
                Letters: {scrambledTerm}
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={wordGuess}
                  onChange={(e) => setWordGuess(e.target.value)}
                  placeholder="Typ het ontcijferde woord..."
                  className="flex-1 px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm"
                />
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold"
                >
                  Ontcijfer
                </button>
              </div>
            </form>
          ) : activeSpot === 3 && c3 ? (
            <div className="space-y-3">
              <p className="text-[11px] font-medium text-indigo-600 dark:text-indigo-400">
                Bron: {c3.sourceTitle} · {c3.sourceSection}
              </p>
              <h3 className="text-sm font-bold text-indigo-600 dark:text-indigo-400">
                Koppel het begripsspoor
              </h3>
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Welk begrip past bij: "{c3.definition}"?
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {c3Options.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() =>
                      opt.id === c3.id
                        ? unlockSpot(3, `Begripsspoor toegevoegd aan dossier! (${c3.term})`)
                        : failAttempt('Verkeerde match! Kijk goed naar de definitie uit je bron.')
                    }
                    className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 hover:border-indigo-500 text-left text-xs font-bold"
                  >
                    {opt.term}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            q4 && (
              <div className="space-y-3">
                <p className="text-[11px] font-medium text-indigo-600 dark:text-indigo-400">
                  Bron: {q4.sourceTitle} · {q4.sourceSection}
                </p>
                <h3 className="text-sm font-bold text-indigo-600 dark:text-indigo-400">
                  Archiefcheck uitvoeren
                </h3>
                <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{q4.question}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {q4.options.map((opt, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() =>
                        idx === q4.correctIndex
                          ? unlockSpot(4, `Archiefbewijs vrijgespeeld! (${q4.explanation})`)
                          : failAttempt(`Fout! Uitleg uit je bron: ${q4.explanation}`)
                      }
                      className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 hover:border-indigo-500 text-left text-xs font-medium"
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            )
          )}
        </div>
      </div>

      <div className="lg:col-span-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 p-5 space-y-3">
        <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <ClipboardList className="w-4 h-4 text-indigo-500" />
          <span>Onderzoeksdossier (uit jouw bronnen)</span>
        </h3>
        <div className="space-y-2.5">
          {spots.map((sp) => {
            const unlocked = solvedSpots.includes(sp.id);
            return (
              <div
                key={sp.id}
                className={`p-3 rounded-xl border text-xs leading-relaxed ${
                  unlocked
                    ? 'bg-white dark:bg-[#111827] border-emerald-300 dark:border-emerald-800 text-slate-800 dark:text-slate-200'
                    : 'bg-slate-100/70 dark:bg-slate-950/40 border-dashed border-slate-300 dark:border-slate-800 text-slate-400'
                }`}
              >
                {unlocked ? sp.clueFoundText : `${sp.name}: Nog niet onderzocht...`}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
