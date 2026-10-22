// Обёртка над Yandex Games SDK. Вне Яндекс Игр (локальная отладка) подставляется заглушка:
// реклама «показывается» как простое окно, чтобы игру можно было пройти целиком.

let ysdk = null;
const pauseListeners = { pause: () => {}, resume: () => {} };

export function onPauseResume(pause, resume) {
  pauseListeners.pause = pause;
  pauseListeners.resume = resume;
}

export function isRealSdk() {
  return ysdk !== null;
}

export async function initSdk() {
  if (typeof YaGames === 'undefined') return false;
  try {
    ysdk = await YaGames.init();
    ysdk.on?.('game_api_pause', () => pauseListeners.pause());
    ysdk.on?.('game_api_resume', () => pauseListeners.resume());
    return true;
  } catch (error) {
    console.warn('Yandex SDK не запустился, работаем без него', error);
    ysdk = null;
    return false;
  }
}

/** Игрок может начать играть (обязательно по требованиям модерации). */
export function loadingReady() {
  ysdk?.features?.LoadingAPI?.ready();
}

export function gameplayStart() {
  ysdk?.features?.GameplayAPI?.start();
}

export function gameplayStop() {
  ysdk?.features?.GameplayAPI?.stop();
}

function mockAd(title, withReward) {
  return new Promise((resolve) => {
    const box = document.createElement('div');
    box.className = 'mock-ad';
    box.innerHTML = `<div class="mock-ad__card"><p>${title}</p><small>Заглушка: в Яндекс Играх здесь настоящая реклама</small></div>`;
    const button = document.createElement('button');
    button.className = 'btn btn--primary';
    button.textContent = withReward ? 'Получить награду' : 'Закрыть';
    button.addEventListener('click', () => {
      box.remove();
      resolve(true);
    });
    box.firstElementChild.append(button);
    document.body.append(box);
  });
}

/** Полноэкранная реклама в логической паузе. true, если показана. */
export function showInterstitial() {
  if (!ysdk) return mockAd('Реклама', false);
  return new Promise((resolve) => {
    ysdk.adv.showFullscreenAdv({
      callbacks: {
        onOpen: () => pauseListeners.pause(),
        onClose: (wasShown) => {
          pauseListeners.resume();
          resolve(Boolean(wasShown));
        },
        onError: () => {
          pauseListeners.resume();
          resolve(false);
        },
      },
    });
  });
}

/** Реклама с наградой по желанию игрока. true, только если награда засчитана. */
export function showRewarded() {
  if (!ysdk) return mockAd('Видео за подсказку', true);
  return new Promise((resolve) => {
    let rewarded = false;
    ysdk.adv.showRewardedVideo({
      callbacks: {
        onOpen: () => pauseListeners.pause(),
        onRewarded: () => {
          rewarded = true;
        },
        onClose: () => {
          pauseListeners.resume();
          resolve(rewarded);
        },
        onError: () => {
          pauseListeners.resume();
          resolve(false);
        },
      },
    });
  });
}
