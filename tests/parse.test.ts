import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanTitle, parseEpisodeNumber, similarity, slugify } from '../src/server/parse.ts';

test('numéro d’épisode : formats courants', () => {
  const cases: Array<[string, number | null]> = [
    ['[SubsPlease] Sousou no Frieren - 05 (1080p) [A1B2C3D4].mkv', 5],
    ['Frieren - 12v2 [1080p].mkv', 12],
    ['Spy x Family S02E07.mp4', 7],
    ['Spy.x.Family.s2e7.1080p.WEB.x264.mp4', 7],
    ['One Piece 1x1089.mp4', 1089],
    ['Episode 3.mp4', 3],
    ['Épisode 03 VOSTFR.mp4', 3],
    ['ep.14.webm', 14],
    ['EP05', 5],
    ['E09 - Le départ.mp4', 9],
    ['07 - Le héros.mp4', 7],
    ['01', 1],
    ['Jujutsu Kaisen 2023 - 13.5.mkv', 13.5],
    ['Mob Psycho 100 - 04 [1080p].mkv', 4],
    ['Bleach 366.mp4', 366],
    ['index.m3u8', null],
  ];
  for (const [input, expected] of cases) assert.equal(parseEpisodeNumber(input), expected, input);
});

test('nettoyage du titre de dossier', () => {
  assert.equal(cleanTitle('[SubsPlease] Sousou no Frieren (2023) [1080p]'), 'Sousou no Frieren');
  assert.equal(cleanTitle('Spy.x.Family.Season.2.1080p.WEB'), 'Spy x Family Season 2');
  assert.equal(cleanTitle('Kimetsu_no_Yaiba VOSTFR'), 'Kimetsu no Yaiba');
});

test('slug et similarité', () => {
  assert.equal(slugify('Shingeki no Kyojin : Saison Finale'), 'shingeki-no-kyojin-saison-finale');
  assert.equal(slugify('Ōkami to Kōshinryō'), 'okami-to-koshinryo');
  assert.ok(similarity('Frieren', 'Sousou no Frieren') > similarity('Frieren', 'Fire Force'));
  assert.equal(similarity('Spy x Family', 'SPY×FAMILY'.replace('×', ' x ')), 1);
});
