// Настройки игрока: звук и тема. Хранятся только на устройстве, отдельно от прогресса.

const KEY = 'slova_prefs_v1';

export function defaultPrefs() {
  return { sound: true, theme: null }; // theme: null (как в системе), 'light' или 'dark'
}

export function normalizePrefs(raw) {
  const base = defaultPrefs();
  if (!raw || typeof raw !== 'object') return base;
  return {
    sound: typeof raw.sound === 'boolean' ? raw.sound : base.sound,
    theme: raw.theme === 'light' || raw.theme === 'dark' ? raw.theme : base.theme,
  };
}

// Тема, которую нужно показать: выбранная игроком или системная.
export function resolveTheme(prefs, systemDark) {
  return prefs.theme ?? (systemDark ? 'dark' : 'light');
}

export function loadPrefs() {
  try {
    return normalizePrefs(JSON.parse(localStorage.getItem(KEY)));
  } catch {
    return defaultPrefs();
  }
}

export function savePrefs(prefs) {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // хранилище недоступно: настройки просто не запомнятся
  }
}
