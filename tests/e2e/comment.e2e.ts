import { test } from '@e2e-dev/web';
import { expect } from 'e2e';
import { selectText } from './select-text';

const SENTENCE = 'Watch the error rate for one full day';
const COMMENT = 'why one day?';

test('a comment on a selected sentence shows in the panel', async ({ app, browser, screen }) => {
  await app.open('/');
  await selectText(browser, screen, SENTENCE);

  await screen.getByRole('textbox', 'Comment').fill(COMMENT);
  await screen.getByRole('button', 'Add comment').tap();
  await expect(screen.getByText(COMMENT)).toBeVisible();
});
