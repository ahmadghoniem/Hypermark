import { describe, test, expect } from 'bun:test';
import {
  DEFAULT_QUICK_LABELS,
  parseQuickLabels,
  quickLabelId,
} from './quickLabels';

describe('parseQuickLabels', () => {
  test('missing or malformed storage falls back to the defaults', () => {
    expect(parseQuickLabels(null)).toEqual(DEFAULT_QUICK_LABELS);
    expect(parseQuickLabels('{')).toEqual(DEFAULT_QUICK_LABELS);
    expect(parseQuickLabels('{"a":1}')).toEqual(DEFAULT_QUICK_LABELS);
  });

  test('a stored list replaces the defaults outright, Agreed included', () => {
    const stored = JSON.stringify([
      { id: 'needs-tests', text: 'Needs tests', color: 'blue' },
      { id: 'agreed', text: 'Sounds right', color: 'green' },
    ]);
    const labels = parseQuickLabels(stored);
    expect(labels).toHaveLength(2);
    expect(labels[0]?.text).toBe('Needs tests');
    expect(labels[1]?.text).toBe('Sounds right');
  });

  test('an emptied list stays empty', () => {
    expect(parseQuickLabels('[]')).toEqual([]);
  });

  test('a stored tip is dropped', () => {
    const stored = JSON.stringify([{ id: 'x', text: 'X', tip: 'y' }]);
    expect(parseQuickLabels(stored)).toEqual([{ id: 'x', text: 'X' }]);
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
