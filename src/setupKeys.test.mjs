// src/setupKeys.test.mjs — the setup wizard's validation and .env merge.
//
// This module decides what a web form is allowed to write into a config file,
// so its rejection cases matter more than its happy path.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SETUP_KEYS, SETUP_KEY_NAMES, validateSetupValue, mergeEnv } from './setupKeys.js';

test('the wizard never offers a metered credential', () => {
  // The whole point of this build is zero running cost; a setup form that
  // invited a billable key would work against it.
  assert.ok(!SETUP_KEY_NAMES.has('GOOGLE_MAPS_API_KEY'));
  assert.ok(!SETUP_KEY_NAMES.has('OPENAI_API_KEY'));
  assert.ok(SETUP_KEYS.every((k) => k.url.startsWith('https://')));
  assert.ok(SETUP_KEYS.every((k) => k.target === 'globe' || k.target === 'osiris'));
});

test('unknown names are refused', () => {
  assert.equal(validateSetupValue('PATH', '/tmp').ok, false);
  assert.equal(validateSetupValue('NODE_OPTIONS', '--inspect').ok, false);
  assert.equal(validateSetupValue('', 'x').ok, false);
});

test('a newline can never smuggle a second variable in', () => {
  const attack = 'abcdef1234567890abcd\nPATH=/evil';
  const result = validateSetupValue('TOMTOM_API_KEY', attack);
  assert.equal(result.ok, false);
  assert.match(result.error, /line breaks/);
  assert.equal(validateSetupValue('TOMTOM_API_KEY', 'good\rbad').ok, false);
});

test('values are shape-checked against their provider', () => {
  assert.equal(validateSetupValue('TOMTOM_API_KEY', 'abcdef1234567890abcd').ok, true);
  // Too short, and containing characters no TomTom key has.
  assert.equal(validateSetupValue('TOMTOM_API_KEY', 'nope').ok, false);
  assert.equal(validateSetupValue('TOMTOM_API_KEY', 'has spaces in it here').ok, false);
  // Implausibly long input is refused before it reaches the file.
  assert.equal(validateSetupValue('TOMTOM_API_KEY', 'a'.repeat(900)).ok, false);
});

test('an empty value is a deliberate clear, not an error', () => {
  assert.equal(validateSetupValue('TOMTOM_API_KEY', '').ok, true);
  assert.equal(validateSetupValue('TOMTOM_API_KEY', '   ').ok, true);
});

test('merge updates in place and keeps everything it does not manage', () => {
  const before = [
    '# JP GOD EYE',
    'PORT=4173',
    'TOMTOM_API_KEY=old',
    '# CESIUM_ION_TOKEN=',
    'CUSTOM_THING=keepme',
  ].join('\n');
  const after = mergeEnv(before, { TOMTOM_API_KEY: 'newvalue', WINDY_WEBCAMS_KEY: 'windy123' });

  assert.match(after, /^PORT=4173$/m, 'unmanaged variables survive');
  assert.match(after, /^CUSTOM_THING=keepme$/m);
  assert.match(after, /^# JP GOD EYE$/m, 'comments survive');
  assert.match(after, /^TOMTOM_API_KEY=newvalue$/m, 'existing key updated in place');
  assert.match(after, /^WINDY_WEBCAMS_KEY=windy123$/m, 'new key appended');
  assert.doesNotMatch(after, /TOMTOM_API_KEY=old/, 'the old value is gone');
});

test('clearing a key comments it out rather than dropping the line', () => {
  const after = mergeEnv('TOMTOM_API_KEY=something', { TOMTOM_API_KEY: '' });
  assert.match(after, /^# TOMTOM_API_KEY=$/m);
  assert.doesNotMatch(after, /^TOMTOM_API_KEY=something$/m);
});

test('merging into an empty file produces a valid file', () => {
  const after = mergeEnv('', { WINDY_WEBCAMS_KEY: 'abc123def456ghi789' });
  assert.match(after, /^WINDY_WEBCAMS_KEY=abc123def456ghi789$/m);
  assert.ok(after.endsWith('\n'), 'file ends with exactly one newline');
  assert.doesNotMatch(after, /\n\n\n/, 'no runaway blank lines');
});

test('a key is never written twice', () => {
  const after = mergeEnv('WINDY_WEBCAMS_KEY=first', { WINDY_WEBCAMS_KEY: 'second' });
  const hits = after.split('\n').filter((l) => /^WINDY_WEBCAMS_KEY=/.test(l));
  assert.equal(hits.length, 1);
  assert.equal(hits[0], 'WINDY_WEBCAMS_KEY=second');
});
