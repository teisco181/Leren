import {
  AnalyzedMaterial,
  GroundedConcept,
  GroundedPuzzle,
  GroundedQuestion,
  GroundedSortRound,
  StudySet,
} from '../types';
import { extractConcepts, extractQuestions, shuffleArray, stripAccents } from './gameData';

function isAnalyzedMaterial(
  source: AnalyzedMaterial | StudySet | null
): source is AnalyzedMaterial {
  return Boolean(source && 'fileStatuses' in source && Array.isArray(source.fileStatuses));
}

function cleanKeyword(raw: string): string {
  const words = stripAccents(raw)
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && /^[A-Z]+$/.test(w));
  if (words.length === 0) {
    return stripAccents(raw).toUpperCase().replace(/[^A-Z]/g, '').slice(0, 10);
  }
  const ideal = words.find((w) => w.length >= 4 && w.length <= 9);
  return (ideal || words.sort((a, b) => b.length - a.length)[0]).slice(0, 10);
}

export function analyzedMaterialToStudySet(m: AnalyzedMaterial): StudySet {
  return {
    id: m.id,
    ownerId: 'local',
    title: m.title,
    subject: m.subject,
    sourceTitle: m.fileStatuses
      .filter((f) => f.readable)
      .map((f) => f.title)
      .join(', ') || m.title,
    flashcards: m.concepts.map((c) => ({
      front: c.term,
      back: c.definition,
      sourceTitle: c.sourceTitle,
      sourceSection: c.sourceSection,
    })),
    pairs: m.concepts.map((c) => ({
      id: c.id,
      term: c.term,
      definition: c.definition,
      sourceTitle: c.sourceTitle,
      sourceSection: c.sourceSection,
    })),
    questions: m.questions,
    selectedFolderIds: m.selectedFolderIds,
    selectedItemIds: m.selectedItemIds,
    topics: m.topics,
    sortRounds: m.sortRounds,
    puzzles: m.puzzles,
  };
}

export function getStrictConcepts(
  source: AnalyzedMaterial | StudySet | null
): GroundedConcept[] {
  if (!source) return [];
  if (isAnalyzedMaterial(source)) {
    return source.concepts || [];
  }
  const base = extractConcepts(source);
  return base.map((c, idx) => {
    const pairMatch = source.pairs?.[idx];
    return {
      id: c.id,
      term: c.term,
      definition: c.definition,
      cleanWord: c.cleanWord || cleanKeyword(c.term),
      sourceTitle: pairMatch?.sourceTitle || source.sourceTitle || source.title,
      sourceSection: pairMatch?.sourceSection || 'Geselecteerde bron',
    };
  });
}

export function getStrictQuestions(
  source: AnalyzedMaterial | StudySet | null
): GroundedQuestion[] {
  if (!source) return [];
  if (isAnalyzedMaterial(source)) {
    if (source.questions && source.questions.length > 0) {
      return shuffleArray(source.questions);
    }
    const concepts = source.concepts || [];
    if (concepts.length < 2) return [];
    return shuffleArray(
      concepts.map((c, idx) => {
        const distractors = shuffleArray(concepts.filter((_, j) => j !== idx))
          .slice(0, 3)
          .map((d) => d.term);
        const options = shuffleArray([c.term, ...distractors]);
        return {
          question: `Welk begrip uit "${c.sourceTitle}" hoort bij: "${c.definition}"?`,
          options,
          correctIndex: options.indexOf(c.term),
          explanation: `${c.term}: ${c.definition} (Bron: ${c.sourceTitle} · ${c.sourceSection})`,
          difficulty: 'normal' as const,
          sourceTitle: c.sourceTitle,
          sourceSection: c.sourceSection,
        };
      })
    );
  }

  const rawQs = extractQuestions(source);
  return shuffleArray(
    rawQs.map((q) => ({
      question: q.question,
      options: q.options,
      correctIndex: q.correctIndex,
      explanation: q.explanation,
      difficulty: q.difficulty || 'normal',
      sourceTitle: q.sourceTitle || source.sourceTitle || source.title,
      sourceSection: q.sourceSection || 'Geselecteerde bron',
    }))
  );
}

export function getStrictSortRounds(
  source: AnalyzedMaterial | StudySet | null
): GroundedSortRound[] {
  if (!source) return [];
  const rounds = isAnalyzedMaterial(source) ? source.sortRounds || [] : source.sortRounds || [];
  if (rounds.length > 0) return rounds;

  // Fallback ONLY if the user selected >= 2 distinct readable source files and each has >= 2 concepts
  const concepts = getStrictConcepts(source);
  const byFile = new Map<string, GroundedConcept[]>();
  for (const c of concepts) {
    const list = byFile.get(c.sourceTitle) || [];
    list.push(c);
    byFile.set(c.sourceTitle, list);
  }
  const fileEntries = Array.from(byFile.entries()).filter(([, list]) => list.length >= 2);
  if (fileEntries.length >= 2) {
    const [fileA, itemsA] = fileEntries[0];
    const [fileB, itemsB] = fileEntries[1];
    return [
      {
        topicTitle: `Sorteer op geselecteerde bron: ${fileA} vs. ${fileB}`,
        buckets: [fileA, fileB],
        sourceTitle: `${fileA} & ${fileB}`,
        items: shuffleArray([
          ...itemsA.slice(0, 5).map((c) => ({
            label: c.term,
            bucketIndex: 0 as const,
            sourceTitle: c.sourceTitle,
            sourceSection: c.sourceSection,
          })),
          ...itemsB.slice(0, 5).map((c) => ({
            label: c.term,
            bucketIndex: 1 as const,
            sourceTitle: c.sourceTitle,
            sourceSection: c.sourceSection,
          })),
        ]),
      },
    ];
  }

  return [];
}

export function getStrictPuzzles(
  source: AnalyzedMaterial | StudySet | null
): GroundedPuzzle[] {
  if (!source) return [];
  return source.puzzles || [];
}

export function checkSoloGameSufficiency(
  gameId: string,
  mat: AnalyzedMaterial
): { ok: boolean; reason?: string } {
  const conceptsCount = (mat.concepts || []).length;
  const questionsCount = (mat.questions || []).length;
  const sortCount = getStrictSortRounds(mat).length;
  const puzzlesCount = (mat.puzzles || []).length;
  const wordCount = (mat.concepts || []).filter(
    (c) => c.cleanWord.length >= 3 && c.cleanWord.length <= 13
  ).length;

  if (conceptsCount === 0 && questionsCount === 0) {
    return {
      ok: false,
      reason:
        'Er zijn geen bruikbare begrippen of vragen uit de geselecteerde bestanden gehaald. Selecteer bronnen met meer leerstof.',
    };
  }

  switch (gameId) {
    case 'word-blitz':
    case 'memory-masters':
    case 'memory':
    case 'speed-match':
    case 'true-false':
      if (conceptsCount < 4) {
        return {
          ok: false,
          reason: `Voor dit spel zijn minimaal 4 begrippen uit jouw leerstof nodig (nu gevonden: ${conceptsCount}).`,
        };
      }
      return { ok: true };

    case 'sort-it':
      if (sortCount === 0) {
        return {
          ok: false,
          reason:
            'Sort It! heeft minstens twee te onderscheiden categorieën of bronnen in de geselecteerde leerstof nodig. Selecteer een extra bestand of tekst met twee deelonderwerpen.',
        };
      }
      return { ok: true };

    case 'word-builder':
    case 'wordle':
    case 'hangman':
    case 'anagram':
    case 'wordsearch':
      if (wordCount < 3) {
        return {
          ok: false,
          reason: `Dit woordspel vereist minimaal 3 losse kernwoorden (3–13 letters) uit de geselecteerde bronnen (gevonden: ${wordCount}).`,
        };
      }
      return { ok: true };

    case 'odd-one-out':
      if (conceptsCount < 4) {
        return {
          ok: false,
          reason: `Foutenjager vereist minimaal 4 begrippen uit je bronnen (gevonden: ${conceptsCount}).`,
        };
      }
      return { ok: true };

    case 'escape-classroom':
    case 'mission-control':
    case 'detective-academy':
      if (conceptsCount < 3 && questionsCount + puzzlesCount < 3) {
        return {
          ok: false,
          reason:
            'Dit puzzelspel heeft minimaal 3 begrippen en enkele bronvragen/puzzels uit jouw selectie nodig.',
        };
      }
      return { ok: true };

    case 'tower-defense':
    case 'brain-battle':
    case 'floor-is-lava':
    case 'quiz':
    case 'jeopardy':
    case 'boss-battle':
    case 'gold-mine':
    case 'bomb':
    case 'confidence':
      if (questionsCount < 2 && conceptsCount < 3) {
        return {
          ok: false,
          reason:
            'Er zijn minimaal 2 vragen of 3 begrippen uit jouw geselecteerde leerstof nodig voor dit spel.',
        };
      }
      return { ok: true };

    default:
      if (conceptsCount < 2 && questionsCount < 2) {
        return {
          ok: false,
          reason: 'Selecteer een bestand met voldoende begrippen of lesstof om dit spel te spelen.',
        };
      }
      return { ok: true };
  }
}
