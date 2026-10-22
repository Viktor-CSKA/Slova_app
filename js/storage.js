// Сохранение прогресса. localStorage может быть недоступен (режим инкогнито и т. п.),
// тогда игра работает без сохранения.

const KEY = 'slova_save_v1';

export const defaultSave = () => ({ level: 1, found: [], hints: 3 });

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultSave();
    const data = JSON.parse(raw);
    const level = Number.isInteger(data.level) && data.level >= 1 ? data.level : 1;
    const found = Array.isArray(data.found) ? data.found.filter((w) => typeof w === 'string') : [];
    const hints = Number.isInteger(data.hints) && data.hints >= 0 ? data.hints : 3;
    return { level, found, hints };
  } catch {
    return defaultSave();
  }
}

export function writeSave(save) {
  try {
    localStorage.setItem(KEY, JSON.stringify(save));
  } catch {
    // нет места или запрещено: не критично
  }
}
