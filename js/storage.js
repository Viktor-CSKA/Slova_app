// Сохранение прогресса в localStorage (быстро, без сети) и в облако Яндекса (через sdk.js).
// localStorage может быть недоступен (режим инкогнито и т. п.), тогда игра работает без него.
import { defaultSave, normalizeSave } from './progress.js';

const KEY = 'slova_save_v1';

export { defaultSave };

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? normalizeSave(JSON.parse(raw)) : defaultSave();
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
