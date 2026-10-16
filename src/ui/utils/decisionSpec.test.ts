import { describe, expect, it } from 'bun:test';
import {
  buildDecisionSpec,
  type DecisionSpec,
  type DecisionSpecInput,
} from './decisionSpec';

/** Every input combination the spec can receive, for the invariant sweeps. */
function allInputs(): DecisionSpecInput[] {
  const inputs: DecisionSpecInput[] = [];
  for (const app of ['annotate', 'review'] as const)
    for (const gate of [false, true])
      for (const hasFeedback of [false, true])
        for (const approvalNotesSupported of [false, true])
          for (const count of [0, 1, 3])
            inputs.push({ app, gate, count, hasFeedback, approvalNotesSupported });
  return inputs;
}

function itemIds(spec: DecisionSpec): string[] {
  return spec.items.map((item) => item.id);
}

describe('buildDecisionSpec state matrix', () => {
  // Guards the model itself: each row of the spec's state table produces the
  // expected primary and the expected ordered menu.
  it('annotate, no feedback, no gate → All good + Close only', () => {
    const spec = buildDecisionSpec({
      app: 'annotate', gate: false, count: 0, hasFeedback: false, approvalNotesSupported: false,
    });
    expect(spec.primary.label).toBe('All good'); // frozen copy, maintainer-approved
    // Maintainer ruling (post-demo): All good without a gate is NOT an approval —
    // it must never wear the success tone or check icon Approve wears.
    expect(spec.primary.tone).toBe('neutral');
    expect(spec.primary.icon).toBeUndefined();
    expect(itemIds(spec)).toEqual(['close-session']);
    expect(spec.items[0].dividerBefore).toBe(false);
  });

  it('annotate, no feedback, gate → Approve + Close, capability or not', () => {
    const withCap = buildDecisionSpec({
      app: 'annotate', gate: true, count: 0, hasFeedback: false, approvalNotesSupported: true,
    });
    expect(withCap.primary.label).toBe('Approve'); // frozen copy, maintainer-approved
    expect(withCap.primary.tone).toBe('success');
    expect(itemIds(withCap)).toEqual(['close-session']);

    const withoutCap = buildDecisionSpec({
      app: 'annotate', gate: true, count: 0, hasFeedback: false, approvalNotesSupported: false,
    });
    expect(itemIds(withoutCap)).toEqual(['close-session']);
    expect(withoutCap.items[0].dividerBefore).toBe(false);
  });

  it('annotate, feedback (n) → Send Feedback + (approve-with-notes)/close', () => {
    const nonGate = buildDecisionSpec({
      app: 'annotate', gate: false, count: 3, hasFeedback: true, approvalNotesSupported: true,
    });
    expect(nonGate.primary.label).toBe('Send Feedback'); // frozen copy, maintainer-approved
    expect(nonGate.primary.tone).toBe('primary');
    expect(nonGate.primary.icon).toBe('send');
    // No gate ⇒ no approve channel ⇒ no Approve-with-notes, capability or not.
    expect(itemIds(nonGate)).toEqual(['close-session']);
    // Label is free prose; the data is the flow verb and the live count.
    expect(nonGate.items[0].label).toContain('Discard');
    expect(nonGate.items[0].label).toContain('3');
    expect(nonGate.items[0].dividerBefore).toBe(false);
    expect(nonGate.items[0].confirm?.confirmText).toBe('Close anyway'); // frozen copy

    const gate = buildDecisionSpec({
      app: 'annotate', gate: true, count: 3, hasFeedback: true, approvalNotesSupported: true,
    });
    expect(itemIds(gate)).toEqual(['approve-with-notes', 'close-session']);
    expect(gate.items[0].label).toBe('Approve with notes'); // frozen copy, maintainer-approved
    expect(gate.items[0].dividerBefore).toBeFalsy();
    expect(gate.items[1].label).toContain('Discard');
    expect(gate.items[1].label).toContain('3');
    expect(gate.items[1].confirm?.confirmText).toBe('Close anyway'); // frozen copy

    const gateNoCap = buildDecisionSpec({
      app: 'annotate', gate: true, count: 3, hasFeedback: true, approvalNotesSupported: false,
    });
    expect(itemIds(gateNoCap)).toEqual(['close-session']);
  });


  it('review, no feedback → Approve + Close, capability or not', () => {
    for (const approvalNotesSupported of [false, true]) {
      const spec = buildDecisionSpec({
        app: 'review', gate: true, count: 0, hasFeedback: false, approvalNotesSupported,
      });
      expect(spec.primary.label).toBe('Approve');
      expect(itemIds(spec)).toEqual(['close-session']);
      expect(spec.items[0].dividerBefore).toBe(false);
    }
  });

  it('review, feedback (n) → Send Feedback + (approve-with-notes)/close', () => {
    const withCap = buildDecisionSpec({
      app: 'review', gate: true, count: 3, hasFeedback: true, approvalNotesSupported: true,
    });
    expect(withCap.primary.label).toBe('Send Feedback');
    expect(withCap.primary.shortLabel).toBe('Send');
    expect(itemIds(withCap)).toEqual(['approve-with-notes', 'close-session']);
    expect(withCap.items[1].dividerBefore).toBe(true);

    const withoutCap = buildDecisionSpec({
      app: 'review', gate: true, count: 3, hasFeedback: true, approvalNotesSupported: false,
    });
    expect(itemIds(withoutCap)).toEqual(['close-session']);
    expect(withoutCap.items[0].dividerBefore).toBe(false);
  });
});

describe('buildDecisionSpec invariants', () => {
  // Guards the maintainer's hard rule: Approve/Done and Send Feedback never
  // render side by side — there is exactly one primary and the menu never
  // smuggles a second one in.
  it('never yields two primaries, in any input combination', () => {
    for (const input of allInputs()) {
      const spec = buildDecisionSpec(input);
      expect(spec.primary.id).toBe('primary');
      expect(itemIds(spec)).not.toContain('primary');
      // The header shows Send Feedback XOR a positive finish, never both.
      const positiveLabels = ['All good', 'Approve'];
      if (spec.primary.label === 'Send Feedback') {
        expect(positiveLabels).not.toContain(spec.primary.label);
      } else {
        expect(positiveLabels).toContain(spec.primary.label);
      }
    }
  });

  // Guards rendering an item that silently drops content: without the
  // capability advert, no approve-carrying item exists in the approval flows.
  it('approvalNotesSupported: false ⇒ no approve-carrying item anywhere', () => {
    for (const input of allInputs()) {
      if (input.approvalNotesSupported) continue;
      const ids = itemIds(buildDecisionSpec(input));
      expect(ids).not.toContain('approve-with-notes');
    }
  });

  // Maintainer ruling (empty-menu collapse): without a gate there is no
  // approval channel, so no approve-carrying id may appear in any non-gate
  // annotate state, capability advert or not.
  it('non-gate annotate never emits an approve-carrying item', () => {
    for (const input of allInputs()) {
      if (input.app !== 'annotate' || input.gate) continue;
      const ids = itemIds(buildDecisionSpec(input));
      expect(ids).not.toContain('approve-with-notes');
    }
  });

  // Maintainer ruling: no user-facing decision-control string carries an em
  // dash. Sweeps every field the control renders, across both arms.
  it('no user-facing string contains an em dash', () => {
    const inputs: DecisionSpecInput[] = allInputs();
    for (const input of inputs) {
      const spec = buildDecisionSpec(input);
      const strings = [
        spec.primary.label, spec.primary.shortLabel,
        spec.primary.title,
        ...spec.items.flatMap((item) => [
          item.label, item.subtitle,
          item.confirm?.title, item.confirm?.message, item.confirm?.confirmText,
        ]),
      ];
      for (const value of strings) expect(value ?? '').not.toContain('—');
    }
  });

  // Guards a refactor that drops the one remaining guard dialog: Close only
  // asks when leaving actually costs the reviewer something.
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

  // Close is the only exit, so no spec cell may omit it — the header has no
  // standalone Close button to fall back on.
  it('every spec offers exactly one close item', () => {
    for (const input of allInputs()) {
      const ids = itemIds(buildDecisionSpec(input));
      expect(ids.filter((id) => id === 'close-session')).toHaveLength(1);
    }
  });

  // Guards a stale count in the label after an annotation is deleted.
  it('interpolates the live count into the pill and the close copy', () => {
    const zero = buildDecisionSpec({
      app: 'annotate', gate: false, count: 0, hasFeedback: true, approvalNotesSupported: false,
    });
    expect(zero.primary.count).toBeUndefined();
    // Nothing to lose at zero — the close item drops the count copy entirely.
    expect(zero.items.find((item) => item.id === 'close-session')!.label).toBe('Close session');

    // F2 ruling (maintainer-confirmed): the
    // count-0 + hasFeedback cell (attachments only) still
    // offers approve-with-notes on capable approval flows, with zero-form
    // copy — the subtitle must never claim an annotation count of 0.
    const zeroGate = buildDecisionSpec({
      app: 'annotate', gate: true, count: 0, hasFeedback: true, approvalNotesSupported: true,
    });
    expect(itemIds(zeroGate)).toEqual(['approve-with-notes', 'close-session']);
    const approveWithNotes = zeroGate.items.find((item) => item.id === 'approve-with-notes')!;
    expect(approveWithNotes.subtitle).not.toContain('0');
    // Without the capability the cell keeps no approve-carrying item.
    const zeroGateNoCap = buildDecisionSpec({
      app: 'annotate', gate: true, count: 0, hasFeedback: true, approvalNotesSupported: false,
    });
    expect(itemIds(zeroGateNoCap)).toEqual(['close-session']);

    const three = buildDecisionSpec({
      app: 'review', gate: true, count: 3, hasFeedback: true, approvalNotesSupported: true,
    });
    expect(three.primary.count).toBe(3);
    const close = three.items.find((item) => item.id === 'close-session')!;
    expect(close.label).toContain('3');
    expect(close.confirm!.title).toContain('3');

    const one = buildDecisionSpec({
      app: 'annotate', gate: false, count: 1, hasFeedback: true, approvalNotesSupported: false,
    });
    const closeOne = one.items.find((item) => item.id === 'close-session')!;
    // The singular form is the data here, not the sentence around it.
    expect(closeOne.confirm!.title).toContain('1 annotation');
    expect(closeOne.label).toContain('1');
  });
});

