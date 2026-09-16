import { describe, test, expect } from 'bun:test';
import {
  AGREED_LABEL,
  DEFAULT_QUICK_LABELS,
  parseQuickLabels,
  quickLabelId,
  QUICK_LABEL_MAX_TIP,
} from './quickLabels';

describe('parseQuickLabels', () => {
  test('missing or malformed storage falls back to the defaults', () => {
    expect(parseQuickLabels(null)).toEqual(DEFAULT_QUICK_LABELS);
    expect(parseQuickLabels('{')).toEqual(DEFAULT_QUICK_LABELS);
    expect(parseQuickLabels('{"a":1}')).toEqual(DEFAULT_QUICK_LABELS);
  });

  test('Agreed is first and is never taken from storage', () => {
    const stored = JSON.stringify([
      { id: 'agreed', emoji: '', text: 'Hacked', color: 'red' },
      { id: 'needs-tests', emoji: '', text: 'Needs tests', color: 'blue' },
    ]);
    const labels = parseQuickLabels(stored);
    expect(labels[0]).toEqual(AGREED_LABEL);
    expect(labels).toHaveLength(2);
    expect(labels[1]?.text).toBe('Needs tests');
  });

  test('a long tip is truncated', () => {
    const stored = JSON.stringify([
      { id: 'x', emoji: '', text: 'X', color: 'blue', tip: 'y'.repeat(400) },
    ]);
    expect(parseQuickLabels(stored)[1]?.tip).toHaveLength(QUICK_LABEL_MAX_TIP);
  });
});

describe('quickLabelId', () => {
  test('kebab-cases the text', () => {
    expect(quickLabelId('Needs tests!', [])).toBe('needs-tests');
  });
  test('makes it unique', () => {
    expect(quickLabelId('Needs tests', ['needs-tests'])).toBe('needs-tests-2');
  });
});
