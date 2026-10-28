import assert from 'node:assert/strict';
import { test } from 'node:test';
import { defaultPrefs, normalizePrefs, resolveTheme } from '../js/prefs.js';

test('настройки по умолчанию: звук включён, тема системная', () => {
  assert.deepEqual(defaultPrefs(), { sound: true, theme: null });
});

test('мусор в хранилище заменяется значениями по умолчанию', () => {
  assert.deepEqual(normalizePrefs(null), defaultPrefs());
  assert.deepEqual(normalizePrefs('x'), defaultPrefs());
  assert.deepEqual(normalizePrefs({ sound: 'да', theme: 'pink' }), defaultPrefs());
});

test('корректные настройки сохраняются как есть', () => {
  assert.deepEqual(normalizePrefs({ sound: false, theme: 'dark' }), { sound: false, theme: 'dark' });
  assert.deepEqual(normalizePrefs({ sound: true, theme: 'light' }), { sound: true, theme: 'light' });
});

test('выбор игрока сильнее системной темы', () => {
  assert.equal(resolveTheme({ sound: true, theme: 'light' }, true), 'light');
  assert.equal(resolveTheme({ sound: true, theme: 'dark' }, false), 'dark');
  assert.equal(resolveTheme({ sound: true, theme: null }, true), 'dark');
  assert.equal(resolveTheme({ sound: true, theme: null }, false), 'light');
});
