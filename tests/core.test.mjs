import test from 'node:test';
import assert from 'node:assert/strict';

import {
    countWheelTriggers,
    parseControlOptions,
    shouldBlockCharacterTrigger,
    stripWheelTriggerTokens,
    uniquePresetName,
    validatePresetEnvelope,
} from '../v13/core.js';

test('parses quoted preset and advanced trigger options', () => {
    const value = parseControlOptions('Okay. [[SPIN_WHEEL preset="Deep Secrets" mode=blind level=4 seconds=12]]');
    assert.deepEqual(value, {
        preset: 'Deep Secrets',
        visibility: 'blind',
        level: 4,
        seconds: 12,
    });
});

test('normalizes visibility aliases from trigger options', () => {
    assert.equal(parseControlOptions('[[SPIN_WHEEL mode=mystery]]').visibility, 'hidden-wheel');
    assert.equal(parseControlOptions('[[SPIN_WHEEL visibility=secret]]').visibility, 'hidden-result');
});

test('removes technical wheel triggers while preserving surrounding prose', () => {
    const original = 'Fine. We let fate decide.\n[[SPIN_WHEEL preset="Secrets" mode=blind]]';
    assert.equal(stripWheelTriggerTokens(original), 'Fine. We let fate decide.');
});

test('removes all duplicate triggers but counts them for first-only execution', () => {
    const text = 'A [[SPIN_WHEEL]] B [[SPIN_WHEEL preset="Chaos"]] C';
    assert.equal(countWheelTriggers(text), 2);
    assert.equal(stripWheelTriggerTokens(text), 'A  B  C');
});

test('supports a literal custom trigger token without regex interpretation', () => {
    const token = 'SPIN+NOW?';
    const text = `Before ${token} after`;
    assert.equal(countWheelTriggers(text, token), 1);
    assert.equal(stripWheelTriggerTokens(text, token), 'Before  after');
});

test('hard anti-loop guard blocks character trigger but not user turn', () => {
    assert.equal(shouldBlockCharacterTrigger({ locked: true, isUser: false }), true);
    assert.equal(shouldBlockCharacterTrigger({ locked: true, isUser: true }), false);
    assert.equal(shouldBlockCharacterTrigger({ locked: false, isUser: false }), false);
});

test('preset import envelope validates supported schema', () => {
    const checked = validatePresetEnvelope({
        format: 'sillytavern-wheel-preset',
        schemaVersion: 1,
        preset: { name: 'Secrets', config: { wheelTitle: 'Secrets' } },
    });
    assert.equal(checked.valid, true);
    assert.equal(checked.name, 'Secrets');
});

test('preset import rejects unrelated JSON', () => {
    assert.equal(validatePresetEnvelope({ hello: 'world' }).valid, false);
    assert.equal(validatePresetEnvelope({ format: 'sillytavern-wheel-preset', schemaVersion: 99, preset: {} }).valid, false);
});

test('imported preset names are made unique case-insensitively', () => {
    assert.equal(uniquePresetName('Secrets', ['General', 'Secrets']), 'Secrets (2)');
    assert.equal(uniquePresetName('secrets', ['Secrets', 'secrets (2)']), 'secrets (3)');
    assert.equal(uniquePresetName('Chaos', ['General']), 'Chaos');
});
