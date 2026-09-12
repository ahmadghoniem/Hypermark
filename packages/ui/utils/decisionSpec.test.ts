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
  it('annotate, no feedback, no gate → All good + the single Send a note composer', () => {
    const spec = buildDecisionSpec({
      app: 'annotate', gate: false, count: 0, hasFeedback: false, approvalNotesSupported: false,
    });
    expect(spec.primary.label).toBe('All good'); // frozen copy, maintainer-approved
    // Maintainer ruling (post-demo): All good without a gate is NOT an approval —
    // it must never wear the success tone or check icon Approve wears.
    expect(spec.primary.tone).toBe('neutral');
    expect(spec.primary.icon).toBeUndefined();
    // Maintainer ruling (empty-menu collapse): ONE composer item — the old
    // "Done with a note…" / "Request changes…" pair differed only by framing
    // on the same transport and must not come back. Label is free prose.
    expect(itemIds(spec)).toEqual(['request-changes', 'close-session']);
    expect(spec.items[0].composer).toBeDefined();
    expect(spec.items[0].composer?.tone).toBe('primary');
    expect(spec.items[0].dividerBefore).toBe(false);
  });

  it('annotate, no feedback, gate → Approve; approve-note item only with the capability', () => {
    const withCap = buildDecisionSpec({
      app: 'annotate', gate: true, count: 0, hasFeedback: false, approvalNotesSupported: true,
    });
    expect(withCap.primary.label).toBe('Approve'); // frozen copy, maintainer-approved
    expect(withCap.primary.tone).toBe('success');
    expect(itemIds(withCap)).toEqual(['note-with-approval', 'request-changes', 'close-session']);
    // Free prose except the verb: the gate's positive-note item must speak of
    // approving, not finishing.
    expect(withCap.items[0].label).toContain('Approve');

    const withoutCap = buildDecisionSpec({
      app: 'annotate', gate: true, count: 0, hasFeedback: false, approvalNotesSupported: false,
    });
    expect(itemIds(withoutCap)).toEqual(['request-changes', 'close-session']);
    expect(withoutCap.items[0].dividerBefore).toBe(false);
  });

  it('annotate, feedback (n) → Send Feedback + note/(approve-with-notes)/close', () => {
    const nonGate = buildDecisionSpec({
      app: 'annotate', gate: false, count: 3, hasFeedback: true, approvalNotesSupported: true,
    });
    expect(nonGate.primary.label).toBe('Send Feedback'); // frozen copy, maintainer-approved
    expect(nonGate.primary.tone).toBe('primary');
    expect(nonGate.primary.icon).toBe('send');
    // No gate ⇒ no approve channel ⇒ no Approve-with-notes, capability or not.
    expect(itemIds(nonGate)).toEqual(['note-with-feedback', 'close-session']);
    // Label is free prose; the data is the flow verb and the live count.
    expect(nonGate.items[1].label).toContain('Close,');
    expect(nonGate.items[1].label).toContain('3');
    expect(nonGate.items[1].confirm?.confirmText).toBe('Close anyway'); // frozen copy

    const gate = buildDecisionSpec({
      app: 'annotate', gate: true, count: 3, hasFeedback: true, approvalNotesSupported: true,
    });
    expect(itemIds(gate)).toEqual(['note-with-feedback', 'approve-with-notes', 'close-session']);
    expect(gate.items[1].label).toBe('Approve with notes'); // frozen copy, maintainer-approved
    expect(gate.items[2].label).toContain('Close,');
    expect(gate.items[2].label).toContain('3');
    expect(gate.items[2].confirm?.confirmText).toBe('Close anyway'); // frozen copy

    const gateNoCap = buildDecisionSpec({
      app: 'annotate', gate: true, count: 3, hasFeedback: true, approvalNotesSupported: false,
    });
    expect(itemIds(gateNoCap)).toEqual(['note-with-feedback', 'close-session']);
  });

  // M1 ruling fact-guard: in the agent-terminal delivered state the All good
  // transport still posts the FULL payload, so the copy must never claim
  // "no feedback" — while the primary label itself stays the frozen 'All good'.
  it('feedbackDelivered keeps the All good primary but drops the "no feedback" claim', () => {
    const base = {
      app: 'annotate' as const, gate: false, count: 0,
      hasFeedback: false, approvalNotesSupported: false,
    };
    const plain = buildDecisionSpec(base);
    const delivered = buildDecisionSpec({ ...base, feedbackDelivered: true });

    expect(delivered.primary.label).toBe('All good'); // frozen copy, maintainer-approved
    expect(delivered.primary.title).not.toContain('no feedback');
    // The two states must actually differ — a regression that ignores the
    // flag would silently restore the lying tooltip.
    expect(delivered.primary.title).not.toBe(plain.primary.title);
    expect(delivered.items.map((item) => item.id)).toEqual(plain.items.map((item) => item.id));
  });

  it('review, no feedback → Approve; phase-1 menu is Request changes only', () => {
    const phase1 = buildDecisionSpec({
      app: 'review', gate: true, count: 0, hasFeedback: false, approvalNotesSupported: false,
    });
    expect(phase1.primary.label).toBe('Approve');
    expect(itemIds(phase1)).toEqual(['request-changes', 'close-session']);

    const phase2 = buildDecisionSpec({
      app: 'review', gate: true, count: 0, hasFeedback: false, approvalNotesSupported: true,
    });
    expect(itemIds(phase2)).toEqual(['note-with-approval', 'request-changes', 'close-session']);
    expect(phase2.items[0].label).toContain('Approve');
  });

  it('review, feedback (n) → Send Feedback + note/(approve-with-notes)/close', () => {
    const phase2 = buildDecisionSpec({
      app: 'review', gate: true, count: 3, hasFeedback: true, approvalNotesSupported: true,
    });
    expect(phase2.primary.label).toBe('Send Feedback');
    expect(phase2.primary.shortLabel).toBe('Send');
    expect(itemIds(phase2)).toEqual(['note-with-feedback', 'approve-with-notes', 'close-session']);

    const phase1 = buildDecisionSpec({
      app: 'review', gate: true, count: 3, hasFeedback: true, approvalNotesSupported: false,
    });
    expect(itemIds(phase1)).toEqual(['note-with-feedback', 'close-session']);
    expect(phase1.items[1].dividerBefore).toBe(true);
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
      expect(ids).not.toContain('note-with-approval');
    }
  });

  // Maintainer ruling (empty-menu collapse): without a gate there is no
  // approval channel, so no approve-carrying id may appear in any non-gate
  // annotate state, capability advert or not — this is also what keeps the
  // non-gate 'note-with-approval' arm in annotateDecision.ts dead code.
  it('non-gate annotate never emits an approve-carrying item', () => {
    for (const input of allInputs()) {
      if (input.app !== 'annotate' || input.gate) continue;
      const ids = itemIds(buildDecisionSpec(input));
      expect(ids).not.toContain('note-with-approval');
      expect(ids).not.toContain('approve-with-notes');
    }
  });

  // Maintainer ruling: no user-facing decision-control string carries an em
  // dash. Sweeps every field the control renders, across both arms.
  it('no user-facing string contains an em dash', () => {
    const inputs: DecisionSpecInput[] = [
      ...allInputs(),
      ...([0, 1, 3] as const).flatMap((count) =>
        [false, true].map((selfAuthored): DecisionSpecInput => ({
          app: 'review', gate: true, count, hasFeedback: count > 0,
          approvalNotesSupported: false,
          platform: { label: 'GitHub', mrLabel: 'PR', selfAuthored },
        }))),
      ...allInputs().map((input) => ({ ...input, feedbackDelivered: true })),
    ];
    for (const input of inputs) {
      const spec = buildDecisionSpec(input);
      const strings = [
        spec.primary.label, spec.primary.shortLabel, spec.primary.mobileLabel,
        spec.primary.title,
        ...spec.items.flatMap((item) => [
          item.label, item.subtitle,
          item.composer?.title, item.composer?.actionLabel, item.composer?.placeholder,
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
    // count-0 + hasFeedback cell (direct edits / attachments only) still
    // offers approve-with-notes on capable approval flows, with zero-form
    // copy — the subtitle must never claim an annotation count of 0.
    const zeroGate = buildDecisionSpec({
      app: 'annotate', gate: true, count: 0, hasFeedback: true, approvalNotesSupported: true,
    });
    expect(itemIds(zeroGate)).toEqual(['note-with-feedback', 'approve-with-notes', 'close-session']);
    const approveWithNotes = zeroGate.items.find((item) => item.id === 'approve-with-notes')!;
    expect(approveWithNotes.subtitle).not.toContain('0');
    // Without the capability the cell keeps no approve-carrying item.
    const zeroGateNoCap = buildDecisionSpec({
      app: 'annotate', gate: true, count: 0, hasFeedback: true, approvalNotesSupported: false,
    });
    expect(itemIds(zeroGateNoCap)).toEqual(['note-with-feedback', 'close-session']);

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
    expect(closeOne.label).toContain('1 annotation…');
  });

  // Every composer item must actually be a composer and every plain item must
  // not — the control branches on these fields, so an item with both (or a
  // confirm item with a composer) would render an unreachable surface.
  it('composer and confirm are mutually exclusive per item', () => {
    for (const input of allInputs()) {
      for (const item of buildDecisionSpec(input).items) {
        expect(item.composer && item.confirm).toBeFalsy();
      }
    }
  });
});

