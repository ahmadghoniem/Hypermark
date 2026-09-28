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

  test('a stored list replaces the defaults outright, Agreed included', () => {
    const stored = JSON.stringify([
      { id: 'needs-tests', emoji: '', text: 'Needs tests', color: 'blue' },
      { id: 'agreed', emoji: '', text: 'Sounds right', color: 'green' },
    ]);
    const labels = parseQuickLabels(stored);
    expect(labels).toHaveLength(2);
    expect(labels[0]?.text).toBe('Needs tests');
    expect(labels[1]?.text).toBe('Sounds right');
  });

  test('Agreed seeds the defaults', () => {
    expect(parseQuickLabels(null)[0]).toEqual(AGREED_LABEL);
  });

  test('an emptied list stays empty', () => {
    expect(parseQuickLabels('[]')).toEqual([]);
  });

  test('a long tip is truncated', () => {
    const stored = JSON.stringify([
      { id: 'x', emoji: '', text: 'X', color: 'blue', tip: 'y'.repeat(400) },
    ]);
    expect(parseQuickLabels(stored)[0]?.tip).toHaveLength(QUICK_LABEL_MAX_TIP);
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
