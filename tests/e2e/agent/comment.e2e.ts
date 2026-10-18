import { test } from '@e2e-dev/web';
import { expect } from 'e2e';
import { selectText } from '../select-text';

const SENTENCE = 'Watch the error rate for one full day';
const COMMENT = 'why one day?';

// The same flow as ../comment.e2e.ts, with the decision model adding the
// comment from an intent. It only targets controls (text nodes are not
// offered, and a drag onto one element is refused), and with no text model it
// never types, so the selection and the comment text are done by locators.
// Drex (`--agent drex`) fails this intent: it presses Enter in the textbox and
// then finds no target.
test('the agent adds a comment from an intent', { tags: ['agent'] }, async ({ app, browser, screen, agent }) => {
  if (!process.env.LIQUID_API_KEY) test.skip('LIQUID_API_KEY is not set');
  await app.open('/');

  await selectText(browser, screen, SENTENCE);
  const box = screen.getByRole('textbox', 'Comment');
  await expect(box).toBeVisible();

  await box.fill(COMMENT);
  await agent.act('Add the comment.');
  await expect(screen.getByText(COMMENT)).toBeVisible();
});
