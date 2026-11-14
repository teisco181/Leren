import { MultiplayerGameId } from '../../types';
import imgEscape from '../../assets/images/mp_escape_together_1794605218913.jpg';
import imgCity from '../../assets/images/mp_build_city_1794605218791.jpg';
import imgDetective from '../../assets/images/mp_detective_agency_1794605219392.jpg';
import imgKingdoms from '../../assets/images/mp_kingdoms_1794605220149.jpg';
import imgLeague from '../../assets/images/mp_knowledge_league_1794605220149.jpg';
import imgExpedition from '../../assets/images/mp_expedition_earth_1794605220480.jpg';
import imgEcosystem from '../../assets/images/mp_ecosystem_1794605220814.jpg';
import imgWorkshop from '../../assets/images/mp_ultimate_workshop_1794605220999.jpg';

export interface MpGameCatalogItem {
  id: MultiplayerGameId;
  title: string;
  genre: string;
  minPlayers: number;
  maxPlayers: number;
  duration: string;
  minConcepts: number;
  minQuestions: number;
  image: string;
  shortDesc: string;
  accentClass: string;
}

export const MP_AVATARS = ['🦊', '🦉', '🚀', '⚡', '🧠', '🎯', '🐙', '🦁'];

export const MP_GAME_CATALOG: MpGameCatalogItem[] = [
  {
    id: 'escape-together',
    title: 'Escape Together',
    genre: 'Co-op Escape Room',
    minPlayers: 2,
    maxPlayers: 6,
    duration: '10–25 min',
    minConcepts: 3,
    minQuestions: 2,
    image: imgEscape,
    shortDesc:
      'Kraak samen 5 vergrendelde ruimtes op basis van jouw leerstof en deel aanwijzingen met je team.',
    accentClass: 'bg-violet-600 hover:bg-violet-700',
  },
  {
    id: 'build-a-city',
    title: 'Build a City',
    genre: 'Stadsbouw & Strategie',
    minPlayers: 2,
    maxPlayers: 6,
    duration: '15–30 min',
    minConcepts: 3,
    minQuestions: 3,
    image: imgCity,
    shortDesc:
      'Verdien bouwmunten en energie met bronvragen, bouw je 4×4 stad en beoordeel elkaars steden met sterren.',
    accentClass: 'bg-cyan-600 hover:bg-cyan-700',
  },
  {
    id: 'detective-agency',
    title: 'Detective Agency',
    genre: 'Mysterie & Onderzoek',
    minPlayers: 2,
    maxPlayers: 5,
    duration: '15–25 min',
    minConcepts: 3,
    minQuestions: 2,
    image: imgDetective,
    shortDesc:
      'Verzamel 5 dossierbewijzen uit jouw geselecteerde bestanden en deel teamtips op de live prikbord-feed.',
    accentClass: 'bg-indigo-600 hover:bg-indigo-700',
  },
  {
    id: 'kingdoms',
    title: 'Kingdoms',
    genre: 'Rijken & Handel',
    minPlayers: 2,
    maxPlayers: 6,
    duration: '20–35 min',
    minConcepts: 3,
    minQuestions: 3,
    image: imgKingdoms,
    shortDesc:
      'Verzamel goud, voedsel en kennis uit bronopdrachten, upgrade je kasteel en ruil grondstoffen met anderen.',
    accentClass: 'bg-amber-600 hover:bg-amber-700',
  },
  {
    id: 'knowledge-league',
    title: 'Knowledge League',
    genre: 'Kenniscompetitie',
    minPlayers: 2,
    maxPlayers: 8,
    duration: '10–20 min',
    minConcepts: 4,
    minQuestions: 3,
    image: imgLeague,
    shortDesc:
      'Speel 4 toernooirondes op je eigen tempo met reeksbonussen en strijd om de hoogste plek op het scorebord.',
    accentClass: 'bg-rose-600 hover:bg-rose-700',
  },
  {
    id: 'expedition-earth',
    title: 'Expedition Earth',
    genre: 'Avonturenkaart',
    minPlayers: 2,
    maxPlayers: 6,
    duration: '15–30 min',
    minConcepts: 3,
    minQuestions: 3,
    image: imgExpedition,
    shortDesc:
      'Reis door 6 etappes naar de top, beheer je voorraden en deel ontdekkingen uit jouw bronnen.',
    accentClass: 'bg-emerald-600 hover:bg-emerald-700',
  },
  {
    id: 'ecosystem',
    title: 'Ecosystem',
    genre: 'Balans & Simulatie',
    minPlayers: 2,
    maxPlayers: 6,
    duration: '15–25 min',
    minConcepts: 3,
    minQuestions: 3,
    image: imgEcosystem,
    shortDesc:
      'Verdien bio-energie met opdrachten uit de lesstof en houd Flora, Fauna en Water in perfect evenwicht.',
    accentClass: 'bg-lime-600 hover:bg-lime-700',
  },
  {
    id: 'ultimate-workshop',
    title: 'The Ultimate Workshop',
    genre: 'Ontwerp & Teamgalerij',
    minPlayers: 2,
    maxPlayers: 5,
    duration: '15–30 min',
    minConcepts: 3,
    minQuestions: 3,
    image: imgWorkshop,
    shortDesc:
      'Verdien machine-onderdelen via kennisopdrachten, ontwerp een blauwdruk, test de efficiëntie en like elkaars uitvindingen.',
    accentClass: 'bg-orange-600 hover:bg-orange-700',
  },
];
