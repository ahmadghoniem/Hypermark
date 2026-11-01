import { describe, expect, it } from 'bun:test';
import {
  buildDecisionSpec,
  type DecisionSpec,
  type DecisionSpecInput,
} from './decisionSpec';

/** Every input combination the spec can receive, for the invariant sweeps. */
function allInputs(): DecisionSpecInput[] {
  const inputs: DecisionSpecInput[] = [];
  for (const hasFeedback of [false, true])
    for (const count of [0, 1, 3])
      inputs.push({ count, hasFeedback });
  return inputs;
}

function itemIds(spec: DecisionSpec): string[] {
  return spec.items.map((item) => item.id);
}

describe('buildDecisionSpec state matrix', () => {
  it('no feedback → All good + Close only', () => {
    const spec = buildDecisionSpec({ count: 0, hasFeedback: false });
    expect(spec.primary.label).toBe('All good');
    expect(spec.primary.tone).toBe('neutral');
    expect(spec.primary.icon).toBeUndefined();
    expect(itemIds(spec)).toEqual(['close-session']);
  });

  it('feedback (n) → Send Feedback + a confirming close', () => {
    const spec = buildDecisionSpec({ count: 3, hasFeedback: true });
    expect(spec.primary.label).toBe('Send Feedback');
    expect(spec.primary.tone).toBe('primary');
    expect(spec.primary.icon).toBe('send');
    expect(itemIds(spec)).toEqual(['close-session']);
    expect(spec.items[0].label).toContain('3');
    expect(spec.items[0].confirm?.confirmText).toBe('Close anyway');
  });
});

describe('buildDecisionSpec invariants', () => {
  it('never yields two primaries, in any input combination', () => {
    for (const input of allInputs()) {
      const spec = buildDecisionSpec(input);
      expect(spec.primary.id).toBe('primary');
      expect(itemIds(spec)).not.toContain('primary');
      expect(spec.primary.label).toBe(input.hasFeedback ? 'Send Feedback' : 'All good');
    }
  });

  // Close only asks when leaving actually costs the reviewer something.
  it('the close item confirms exactly when annotations would be lost', () => {
    for (const input of allInputs()) {
      const close = buildDecisionSpec(input).items.find((item) => item.id === 'close-session');
      expect(close).toBeDefined();
      if (input.count > 0) {
        expect(close!.confirm).toBeDefined();
        expect(close!.tone).toBe('destructive');
      } else {
        expect(close!.confirm).toBeUndefined();
        expect(close!.tone).toBe('neutral');
      }
    }
  });

  // Close is the only exit, so no spec cell may omit it.
  it('every spec offers exactly one close item', () => {
    for (const input of allInputs()) {
      const ids = itemIds(buildDecisionSpec(input));
      expect(ids.filter((id) => id === 'close-session')).toHaveLength(1);
    }
  });

  it('interpolates the live count into the pill and the close copy', () => {
    const zero = buildDecisionSpec({ count: 0, hasFeedback: true });
    expect(zero.primary.count).toBeUndefined();
    expect(zero.items[0].label).toBe('Close session');

    const three = buildDecisionSpec({ count: 3, hasFeedback: true });
    expect(three.primary.count).toBe(3);
    expect(three.items[0].label).toContain('3');
    expect(three.items[0].confirm!.title).toContain('3');

    const one = buildDecisionSpec({ count: 1, hasFeedback: true });
    expect(one.items[0].confirm!.title).toContain('1 annotation');
    expect(one.items[0].label).toContain('1');
  });
});
