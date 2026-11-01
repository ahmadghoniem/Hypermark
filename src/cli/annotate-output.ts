/** What the annotate server settles with: the feedback text, or `exit` for Close session. */
export interface AnnotateOutcome {
  feedback: string;
  exit?: boolean;
}

/** Prints nothing for Close session and the feedback text otherwise (All good
 *  sends the no-feedback sentence). */
export function emitAnnotateOutcome(result: AnnotateOutcome): void {
  if (!result.exit && result.feedback) console.log(result.feedback);
}
