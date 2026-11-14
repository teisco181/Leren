import React from 'react';
import {
  Brain,
  Castle,
  DoorOpen,
  Flame,
  FolderKanban,
  Puzzle,
  Rocket,
  Search,
  Swords,
  Zap,
} from 'lucide-react';
import { AnalyzedMaterial, StudySet } from '../../../types';
import { GAME_THEMES, GameDifficulty, GameTheme } from '../GameShell';
import { WordBlitzGame } from './WordBlitzGame';
import { MemoryMastersGame } from './MemoryMastersGame';
import { EscapeClassroomGame } from './EscapeClassroomGame';
import { TowerDefenseGame } from './TowerDefenseGame';
import { WordBuilderGame } from './WordBuilderGame';
import { BrainBattleGame } from './BrainBattleGame';
import { MissionControlGame } from './MissionControlGame';
import { SortItGame } from './SortItGame';
import { FloorIsLavaGame } from './FloorIsLavaGame';
import { DetectiveAcademyGame } from './DetectiveAcademyGame';

export type OriginalGameMode =
  | 'word-blitz'
  | 'memory-masters'
  | 'escape-classroom'
  | 'tower-defense'
  | 'word-builder'
  | 'brain-battle'
  | 'mission-control'
  | 'sort-it'
  | 'floor-is-lava'
  | 'detective-academy';

export interface OriginalGameProps {
  material?: AnalyzedMaterial | null;
  studySet: StudySet | null;
  soundEnabled: boolean;
  initialProgress?: string;
  onSaveProgress?: (payload: {
    difficulty: GameDifficulty;
    progress: string;
    score: number;
    completed: boolean;
  }) => void;
  onExit: () => void;
}

export interface OriginalGameMeta {
  id: OriginalGameMode;
  title: string;
  genre: string;
  duration: string;
  shortDesc: string;
  themeKey: keyof typeof GAME_THEMES;
  theme: GameTheme;
  icon: React.ComponentType<{ className?: string }>;
}

export const ORIGINAL_GAMES: OriginalGameMeta[] = [
  {
    id: 'word-blitz',
    title: 'Word Blitz – Snelheid en kennis',
    genre: 'Reactiespel / Arcade',
    duration: '5–6 min',
    shortDesc: 'Klik razendsnel op de bewegende juiste antwoorden uit jouw leerstof voordat de timer afloopt.',
    themeKey: 'amber',
    theme: GAME_THEMES.amber,
    icon: Zap,
  },
  {
    id: 'memory-masters',
    title: 'Memory Masters – Slim onthouden',
    genre: 'Geheugenspel',
    duration: '5–8 min',
    shortDesc: 'Draai 3D-kaarten om en koppel begrippen en definities uit jouw gekozen bestanden.',
    themeKey: 'emerald',
    theme: GAME_THEMES.emerald,
    icon: Brain,
  },
  {
    id: 'escape-classroom',
    title: 'Escape the Classroom',
    genre: 'Mini-Escape Room',
    duration: '6–10 min',
    shortDesc: 'Kraak klikbare sloten en puzzels die volledig uit jouw geselecteerde leerstof komen.',
    themeKey: 'violet',
    theme: GAME_THEMES.violet,
    icon: DoorOpen,
  },
  {
    id: 'tower-defense',
    title: 'Tower Defense: Knowledge Edition',
    genre: 'Strategie',
    duration: '6–9 min',
    shortDesc: 'Verdien goud met bronvragen uit jouw leerstof, bouw torens en overleef 3 golven.',
    themeKey: 'cyan',
    theme: GAME_THEMES.cyan,
    icon: Castle,
  },
  {
    id: 'word-builder',
    title: 'Word Builder – Bouw het woord',
    genre: 'Woordpuzzel',
    duration: '5–7 min',
    shortDesc: 'Sleep of klik losse letters tot kernbegrippen uit jouw geselecteerde documenten.',
    themeKey: 'pink',
    theme: GAME_THEMES.pink,
    icon: Puzzle,
  },
  {
    id: 'brain-battle',
    title: 'Brain Battle – De kennisarena',
    genre: 'Snelle Competitie',
    duration: '5 min',
    shortDesc: 'Speel rechtstreeks tegen een virtuele tegenstander op vragen uit jouw gekozen bronnen.',
    themeKey: 'rose',
    theme: GAME_THEMES.rose,
    icon: Swords,
  },
  {
    id: 'mission-control',
    title: 'Mission Control – Ruimtemissie',
    genre: 'Ruimte-avontuur',
    duration: '6–8 min',
    shortDesc: 'Herstel alle boordsystemen via begrippen, puzzels en vragen uit jouw lesstof.',
    themeKey: 'sky',
    theme: GAME_THEMES.sky,
    icon: Rocket,
  },
  {
    id: 'sort-it',
    title: 'Sort It! – Snel sorteren',
    genre: 'Sorteer- & Reactiespel',
    duration: '5–7 min',
    shortDesc: 'Sleep of tik vallende begrippen naar de juiste categorie uit jouw geselecteerde bronnen.',
    themeKey: 'lime',
    theme: GAME_THEMES.lime,
    icon: FolderKanban,
  },
  {
    id: 'floor-is-lava',
    title: 'The Floor is Lava – Denk snel!',
    genre: '2D Platformspel',
    duration: '5–8 min',
    shortDesc: 'Spring over bewegende platformen en speel veilige routes vrij met vragen uit jouw leerstof.',
    themeKey: 'orange',
    theme: GAME_THEMES.orange,
    icon: Flame,
  },
  {
    id: 'detective-academy',
    title: 'Detective Academy – Los de zaak op',
    genre: 'Deductiepuzzel',
    duration: '6–9 min',
    shortDesc: 'Verzamel dossierbewijzen uit jouw bronteksten en los de einddeductie uit de leerstof op.',
    themeKey: 'indigo',
    theme: GAME_THEMES.indigo,
    icon: Search,
  },
];

interface OriginalGamesStageProps extends OriginalGameProps {
  mode: OriginalGameMode;
}

export const OriginalGamesStage: React.FC<OriginalGamesStageProps> = ({
  mode,
  material,
  studySet,
  soundEnabled,
  initialProgress,
  onSaveProgress,
  onExit,
}) => {
  const sharedProps: OriginalGameProps = {
    material,
    studySet,
    soundEnabled,
    initialProgress,
    onSaveProgress,
    onExit,
  };

  switch (mode) {
    case 'word-blitz':
      return <WordBlitzGame {...sharedProps} />;
    case 'memory-masters':
      return <MemoryMastersGame {...sharedProps} />;
    case 'escape-classroom':
      return <EscapeClassroomGame {...sharedProps} />;
    case 'tower-defense':
      return <TowerDefenseGame {...sharedProps} />;
    case 'word-builder':
      return <WordBuilderGame {...sharedProps} />;
    case 'brain-battle':
      return <BrainBattleGame {...sharedProps} />;
    case 'mission-control':
      return <MissionControlGame {...sharedProps} />;
    case 'sort-it':
      return <SortItGame {...sharedProps} />;
    case 'floor-is-lava':
      return <FloorIsLavaGame {...sharedProps} />;
    case 'detective-academy':
      return <DetectiveAcademyGame {...sharedProps} />;
    default:
      return null;
  }
};
