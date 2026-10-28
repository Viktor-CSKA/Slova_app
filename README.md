# Слова из слова

Казуальная игра-головоломка для Яндекс Игр: из букв длинного слова нужно составить как можно больше русских существительных. Чистый HTML и JavaScript-модули, без сборки и зависимостей.

## Запуск локально

```bash
node tools/serve.mjs . 5180
```

Открыть http://127.0.0.1:5180/. Вне Яндекс Игр SDK подменяется заглушкой: реклама показывается простым окном.

## Тесты

```bash
node --test test/logic.test.mjs test/progress.test.mjs test/prefs.test.mjs
```

## Архив для консоли Яндекс Игр

```bash
C:/Windows/System32/tar.exe -a -c -f dist/slova.zip index.html css js data
```

`index.html` должен лежать в корне архива, имена файлов без пробелов и кириллицы.

## Структура

- `js/logic.js` — чистая логика (слова, уровни, цели), покрыта тестами.
- `js/sdk.js` — обёртка Yandex Games SDK с заглушкой для локальной проверки.
- `js/progress.js` — чистая логика сохранений: слияние локального и облачного, серия дней, защита рекламы (под тестами).
- `js/storage.js` — сохранение прогресса в localStorage (облако Яндекса — через `js/sdk.js`).
- `js/main.js` — интерфейс и ход игры.
- `data/words.txt` — словарь существительных (14 735 слов, порядок по частотности).
- `tools/build-dict.mjs` — сборка словаря из `nouns.csv`; `tools/stoplist.txt` — исключённые имена, аббревиатуры и грубые слова; `tools/apply-stoplist.mjs` — применить стоп-лист к готовому `words.txt` без `nouns.csv`.
- `tools/make-store-art.mjs` — иконка, обложка и скриншоты для карточки в `store/` (нужен Chrome); тексты карточки: `store/card-text.md`.

## Словарь и лицензия данных

`data/words.txt` получен из [Badestrand/russian-dictionary](https://github.com/Badestrand/russian-dictionary) (данные OpenRussian и Wiktionary) и распространяется на условиях **CC BY-SA 4.0**; подробности и перечень изменений в `data/NOTICE.txt`, текст лицензии в `data/LICENSE-CC-BY-SA-4.0.txt`. Лицензия на код проекта пока не выбрана.

## Требования Яндекс Игр

Правила модерации: https://yandex.com/dev/games/doc/dg/concepts/requirements.html. Главное для этой игры: реклама только через SDK, показ в логических паузах, без таймеров; `LoadingAPI.ready()` когда игрок может начать; игра не должна копировать игры из каталога.
