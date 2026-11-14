export interface DetectedPlatform {
  matched: boolean;
  platformName: string;
  iconName: string;
  color: string;
  defaultSubject: string;
  defaultDescription: string;
}

export function detectExternalToolFromUrl(rawUrl: string): DetectedPlatform {
  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return {
      matched: false,
      platformName: '',
      iconName: 'Globe',
      color: '#4F46E5',
      defaultSubject: '',
      defaultDescription: '',
    };
  }

  let hostname = '';
  try {
    const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
    hostname = new URL(normalized).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    hostname = trimmed.toLowerCase();
  }

  if (hostname.includes('youtube.com') || hostname === 'youtu.be' || hostname.endsWith('.youtu.be')) {
    return {
      matched: true,
      platformName: 'YouTube',
      iconName: 'Youtube',
      color: '#DC2626',
      defaultSubject: "Uitlegvideo's",
      defaultDescription: 'Uitlegvideo’s, colleges en samenvattingen bekijken.',
    };
  }

  if (hostname.includes('studygo.com')) {
    return {
      matched: true,
      platformName: 'StudyGo',
      iconName: 'BookOpen',
      color: '#2563EB',
      defaultSubject: 'Woordjes & Toetsen',
      defaultDescription: 'Woordjes, definities en oefentoetsen stampen.',
    };
  }

  if (hostname.includes('quizlet.com')) {
    return {
      matched: true,
      platformName: 'Quizlet',
      iconName: 'Layers',
      color: '#6D28D9',
      defaultSubject: 'Flashcards',
      defaultDescription: 'Begrippen oefenen met flashcards en studeer-sets.',
    };
  }

  if (hostname.includes('netflix.com')) {
    return {
      matched: true,
      platformName: 'Netflix',
      iconName: 'Tv',
      color: '#991B1B',
      defaultSubject: 'Documentaires & Talen',
      defaultDescription: 'Documentaires en luistervaardigheid voor talen.',
    };
  }

  if (hostname.includes('gimkit.com')) {
    return {
      matched: true,
      platformName: 'Gimkit',
      iconName: 'Zap',
      color: '#16A34A',
      defaultSubject: 'Live Quiz Games',
      defaultDescription: 'Interactieve quizspellen om stof snel te herhalen.',
    };
  }

  const cleanHost = hostname.split('.')[0];
  const fallbackName = cleanHost
    ? cleanHost.charAt(0).toUpperCase() + cleanHost.slice(1)
    : '';

  return {
    matched: false,
    platformName: fallbackName,
    iconName: 'Globe',
    color: '#4F46E5',
    defaultSubject: '',
    defaultDescription: '',
  };
}
