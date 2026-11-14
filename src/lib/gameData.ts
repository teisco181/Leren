import { QuizQuestion, StudySet } from '../types';

export type SoloGameMode =
  | 'flashcards'
  | 'memory'
  | 'quiz'
  // 1. Actieve Herinnering & Herhaling (5)
  | 'leitner'
  | 'type-recall'
  | 'cloze'
  | 'confidence'
  | 'feynman'
  // 2. Snelheid & Arcade (5)
  | 'gravity'
  | 'speed-match'
  | 'true-false'
  | 'typeracer'
  | 'bomb'
  // 3. Woord- & Puzzelspellen (5)
  | 'wordle'
  | 'hangman'
  | 'anagram'
  | 'wordsearch'
  | 'domino'
  // 4. Strategie, RPG & Quizshow (5)
  | 'jeopardy'
  | 'bingo'
  | 'boss-battle'
  | 'gold-mine'
  | 'odd-one-out';

export type GameCategory = 'all' | 'classic' | 'recall' | 'arcade' | 'puzzle' | 'strategy';

export interface GameCatalogItem {
  id: SoloGameMode;
  title: string;
  category: Exclude<GameCategory, 'all'>;
  categoryLabel: string;
  shortDesc: string;
  retentionTip: string;
  isNew: boolean;
}

export const GAME_CATALOG: GameCatalogItem[] = [
  // Bestaande klassiekers
  {
    id: 'flashcards',
    title: 'Flashcards',
    category: 'classic',
    categoryLabel: 'Klassiek',
    shortDesc: 'Draai kaarten om en sorteer op beheersing.',
    retentionTip: 'Actieve herinnering zonder meerkeuze-hints.',
    isNew: false,
  },
  {
    id: 'memory',
    title: 'Memory',
    category: 'classic',
    categoryLabel: 'Klassiek',
    shortDesc: 'Koppel begrippen en definities op tijd.',
    retentionTip: 'Visueel-ruimtelijk geheugen + snelle associatie.',
    isNew: false,
  },
  {
    id: 'quiz',
    title: 'Quiz Battle',
    category: 'classic',
    categoryLabel: 'Klassiek',
    shortDesc: 'Meerkeuzevragen met streak-multiplier en uitleg.',
    retentionTip: 'Directe feedback corrigeert misvattingen meteen.',
    isNew: false,
  },

  // 1. Actieve Herinnering & Herhaling (5 nieuw)
  {
    id: 'leitner',
    title: 'Leitner Boxen',
    category: 'recall',
    categoryLabel: 'Diep onthouden',
    shortDesc: 'Promoveer kaarten door 4 leerdozen; fouten zakken terug.',
    retentionTip: 'Gespreide herhaling richt extra aandacht op moeilijke begrippen.',
    isNew: true,
  },
  {
    id: 'type-recall',
    title: 'Typ & Toets',
    category: 'recall',
    categoryLabel: 'Diep onthouden',
    shortDesc: 'Zie de omschrijving en typ het juiste begrip uit je hoofd.',
    retentionTip: 'Zelf produceren beklijft tot 2x sterker dan herkennen.',
    isNew: true,
  },
  {
    id: 'cloze',
    title: 'Gatenvuller',
    category: 'recall',
    categoryLabel: 'Diep onthouden',
    shortDesc: 'Vul het ontbrekende kernwoord in binnen de contextzin.',
    retentionTip: 'Context-gebaseerd ophalen versterkt semantische verbanden.',
    isNew: true,
  },
  {
    id: 'confidence',
    title: 'Zekerheidswedloop',
    category: 'recall',
    categoryLabel: 'Diep onthouden',
    shortDesc: 'Zet punten in op hoe zeker je bent vóór je antwoordt.',
    retentionTip: 'Metacognitie voorkomt een vals gevoel van beheersing.',
    isNew: true,
  },
  {
    id: 'feynman',
    title: 'Feynman-Check',
    category: 'recall',
    categoryLabel: 'Diep onthouden',
    shortDesc: 'Leg het begrip in eigen woorden uit en check sleutelwoorden.',
    retentionTip: 'De Feynman-techniek legt direct gaten in je begrip bloot.',
    isNew: true,
  },

  // 2. Snelheid & Arcade (5 nieuw)
  {
    id: 'gravity',
    title: 'Kometenregen',
    category: 'arcade',
    categoryLabel: 'Snelheid & Arcade',
    shortDesc: 'Schiet vallende begrippen neer voordat ze de aarde raken.',
    retentionTip: 'Tijdsdruk traint razendsnelle automatische kennisopslag.',
    isNew: true,
  },
  {
    id: 'speed-match',
    title: 'Speed-Match Sprint',
    category: 'arcade',
    categoryLabel: 'Snelheid & Arcade',
    shortDesc: 'Koppel zoveel mogelijk paren binnen 60 seconden.',
    retentionTip: 'Snelle flow-state verhoogt focus en reactiesnelheid.',
    isNew: true,
  },
  {
    id: 'true-false',
    title: 'Waar / Niet Waar Blitz',
    category: 'arcade',
    categoryLabel: 'Snelheid & Arcade',
    shortDesc: 'Beslis onder tijdsdruk of een koppeling klopt (ook met pijltoetsen).',
    retentionTip: 'Traint kritisch onderscheiden van verwarrende begrippen.',
    isNew: true,
  },
  {
    id: 'typeracer',
    title: 'Typeracer Sprint',
    category: 'arcade',
    categoryLabel: 'Snelheid & Arcade',
    shortDesc: 'Race naar de finish door begrippen foutloos over te typen.',
    retentionTip: 'Spiergeheugen + spellingvastheid onder speels tempo.',
    isNew: true,
  },
  {
    id: 'bomb',
    title: 'Bom Ontmantelen',
    category: 'arcade',
    categoryLabel: 'Snelheid & Arcade',
    shortDesc: 'Elke goede vraag geeft +4 seconden; fout kost een draad.',
    retentionTip: 'Hoge betrokkenheid en alerte herinnering in korte bursts.',
    isNew: true,
  },

  // 3. Woord- & Puzzelspellen (5 nieuw)
  {
    id: 'wordle',
    title: 'Begrippen Wordle',
    category: 'puzzle',
    categoryLabel: 'Woord & Puzzel',
    shortDesc: 'Raad het kernwoord in 6 beurten met kleur-aanwijzingen.',
    retentionTip: 'Actieve letterdeductie en definitie-koppeling.',
    isNew: true,
  },
  {
    id: 'hangman',
    title: 'Red de Raket',
    category: 'puzzle',
    categoryLabel: 'Woord & Puzzel',
    shortDesc: 'Ontcijfer het begrip letter voor letter voordat de brandstof op is.',
    retentionTip: 'Spelling en woordstructuur oefenen vanuit de betekenis.',
    isNew: true,
  },
  {
    id: 'anagram',
    title: 'Letterhussel',
    category: 'puzzle',
    categoryLabel: 'Woord & Puzzel',
    shortDesc: 'Zet gehusselde lettertegels weer in de juiste volgorde.',
    retentionTip: 'Herordenen van letters verankert vakjargon in het geheugen.',
    isNew: true,
  },
  {
    id: 'wordsearch',
    title: 'Woordzoeker',
    category: 'puzzle',
    categoryLabel: 'Woord & Puzzel',
    shortDesc: 'Vind de verborgen begrippen in het 10x10 letterrooster.',
    retentionTip: 'Visuele scanning verbindt definities rustig met vaktermen.',
    isNew: true,
  },
  {
    id: 'domino',
    title: 'Kettingreactie Domino',
    category: 'puzzle',
    categoryLabel: 'Woord & Puzzel',
    shortDesc: 'Leg dominostenen van definitie naar begrip in een sluitende keten.',
    retentionTip: 'Combinatorisch redeneren over meerdere begrippen tegelijk.',
    isNew: true,
  },

  // 4. Strategie, RPG & Quizshow (5 nieuw)
  {
    id: 'jeopardy',
    title: 'Jeopardy Bord',
    category: 'strategy',
    categoryLabel: 'Strategie & Quizshow',
    shortDesc: 'Kies vakjes van 100 tot 300 punten en zoek de Dagelijkse Dubbel.',
    retentionTip: 'Autonomie en risicokeuze verhogen intrinsieke motivatie.',
    isNew: true,
  },
  {
    id: 'bingo',
    title: 'Studie Bingo',
    category: 'strategy',
    categoryLabel: 'Strategie & Quizshow',
    shortDesc: 'Vink de juiste antwoorden aan op je 3x3 kaart voor een rij of volle kaart.',
    retentionTip: 'Herhalend scannen van alle antwoorden voorkomt tunnelvisie.',
    isNew: true,
  },
  {
    id: 'boss-battle',
    title: 'RPG Baasgevecht',
    category: 'strategy',
    categoryLabel: 'Strategie & Quizshow',
    shortDesc: 'Versla de Tentamen-Draak met comboschade en hersteldrankjes.',
    retentionTip: 'Gamified voortgang houdt motivatie hoog bij lastige stof.',
    isNew: true,
  },
  {
    id: 'gold-mine',
    title: 'Goudmijn Strategie',
    category: 'strategy',
    categoryLabel: 'Strategie & Quizshow',
    shortDesc: 'Verdien munten, koop multipliers en open schatkisten (Gimkit-stijl).',
    retentionTip: 'Strategische beloningslussen maken extra rondes leuk.',
    isNew: true,
  },
  {
    id: 'odd-one-out',
    title: 'Foutenjager',
    category: 'strategy',
    categoryLabel: 'Strategie & Quizshow',
    shortDesc: 'Spot de ene foutief gekoppelde stelling tussen 3 juiste feiten.',
    retentionTip: 'Fouten analyseren geeft 4x zoveel denkwerk per ronde.',
    isNew: true,
  },
];

export interface ConceptItem {
  id: string;
  term: string;
  definition: string;
  cleanWord: string; // Uppercase A-Z word suitable for Wordle/Hangman/Wordsearch/Anagram
}

export function stripAccents(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

export function normalizeForCompare(input: string): string {
  return stripAccents(input)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

export function isCloseAnswer(userInput: string, target: string): boolean {
  const a = normalizeForCompare(userInput);
  const b = normalizeForCompare(target);
  if (!a || !b) return false;
  if (a === b) return true;
  if (b.length >= 5 && levenshtein(a, b) <= 1) return true;
  if (b.length >= 9 && levenshtein(a, b) <= 2) return true;
  return false;
}

function pickCleanKeyword(rawTerm: string): string {
  const words = stripAccents(rawTerm)
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3 && /^[A-Z]+$/.test(w));

  if (words.length === 0) {
    const joined = stripAccents(rawTerm).toUpperCase().replace(/[^A-Z]/g, '');
    return joined.slice(0, 10);
  }
  // Prefer a word between 4 and 9 chars
  const ideal = words.find((w) => w.length >= 4 && w.length <= 9);
  if (ideal) return ideal;
  return words.sort((a, b) => b.length - a.length)[0].slice(0, 10);
}

export function extractConcepts(set: StudySet): ConceptItem[] {
  const map = new Map<string, ConceptItem>();

  set.pairs.forEach((p, idx) => {
    const term = (p.term || '').trim();
    const def = (p.definition || '').trim();
    if (!term || !def) return;
    const key = normalizeForCompare(term);
    if (!map.has(key)) {
      map.set(key, {
        id: p.id || `pair-${idx}`,
        term,
        definition: def,
        cleanWord: pickCleanKeyword(term),
      });
    }
  });

  set.flashcards.forEach((fc, idx) => {
    const term = (fc.front || '').trim();
    const def = (fc.back || '').trim();
    if (!term || !def) return;
    // Use shorter side as term if front is a long question
    const actualTerm = term.length <= 45 ? term : def.length <= 45 ? def : term.slice(0, 42);
    const actualDef = term.length <= 45 ? def : term;
    const key = normalizeForCompare(actualTerm);
    if (!map.has(key)) {
      map.set(key, {
        id: `fc-${idx}`,
        term: actualTerm,
        definition: actualDef,
        cleanWord: pickCleanKeyword(actualTerm),
      });
    }
  });

  if (map.size < 4) {
    set.questions.forEach((q, idx) => {
      const answer = (q.options[q.correctIndex] || '').trim();
      const def = (q.question || q.explanation || '').trim();
      if (!answer || !def) return;
      const key = normalizeForCompare(answer);
      if (!map.has(key)) {
        map.set(key, {
          id: `q-${idx}`,
          term: answer,
          definition: def,
          cleanWord: pickCleanKeyword(answer),
        });
      }
    });
  }

  return Array.from(map.values());
}

export function extractQuestions(set: StudySet): QuizQuestion[] {
  if (set.questions && set.questions.length > 0) {
    return set.questions.filter(
      (q) =>
        q.question &&
        Array.isArray(q.options) &&
        q.options.length >= 2 &&
        q.correctIndex >= 0 &&
        q.correctIndex < q.options.length
    );
  }

  // Fallback: build MCQs from concepts
  const concepts = extractConcepts(set);
  if (concepts.length < 2) return [];
  return concepts.map((c, idx) => {
    const distractors = concepts
      .filter((_, j) => j !== idx)
      .sort(() => Math.random() - 0.5)
      .slice(0, 3)
      .map((d) => d.term);
    const allOptions = [c.term, ...distractors].sort(() => Math.random() - 0.5);
    return {
      question: `Welk begrip past bij: "${c.definition}"?`,
      options: allOptions,
      correctIndex: allOptions.indexOf(c.term),
      explanation: `${c.term}: ${c.definition}`,
    };
  });
}

export function shuffleArray<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export interface WordSearchWord {
  word: string;
  term: string;
  definition: string;
  coords: Array<{ r: number; c: number }>;
}

export interface WordSearchPuzzle {
  size: number;
  grid: string[][];
  placed: WordSearchWord[];
}

export function generateWordSearch(concepts: ConceptItem[], size = 10): WordSearchPuzzle {
  const candidates = concepts
    .filter((c) => c.cleanWord.length >= 3 && c.cleanWord.length <= size)
    .slice(0, 8);

  const grid: string[][] = Array.from({ length: size }, () => Array(size).fill(''));
  const placed: WordSearchWord[] = [];
  const dirs = [
    [0, 1], // horizontal right
    [1, 0], // vertical down
    [1, 1], // diagonal down-right
    [1, -1], // diagonal down-left
  ];

  for (const item of candidates) {
    const word = item.cleanWord;
    let placedOk = false;

    for (let attempt = 0; attempt < 80 && !placedOk; attempt++) {
      const [dr, dc] = dirs[Math.floor(Math.random() * dirs.length)];
      const r0 = Math.floor(Math.random() * size);
      const c0 = Math.floor(Math.random() * size);
      const rEnd = r0 + dr * (word.length - 1);
      const cEnd = c0 + dc * (word.length - 1);

      if (rEnd < 0 || rEnd >= size || cEnd < 0 || cEnd >= size) continue;

      let fits = true;
      const coords: Array<{ r: number; c: number }> = [];
      for (let i = 0; i < word.length; i++) {
        const r = r0 + dr * i;
        const c = c0 + dc * i;
        if (grid[r][c] !== '' && grid[r][c] !== word[i]) {
          fits = false;
          break;
        }
        coords.push({ r, c });
      }

      if (fits) {
        coords.forEach(({ r, c }, i) => {
          grid[r][c] = word[i];
        });
        placed.push({
          word,
          term: item.term,
          definition: item.definition,
          coords,
        });
        placedOk = true;
      }
    }
  }

  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!grid[r][c]) {
        grid[r][c] = alphabet[Math.floor(Math.random() * alphabet.length)];
      }
    }
  }

  return { size, grid, placed };
}
