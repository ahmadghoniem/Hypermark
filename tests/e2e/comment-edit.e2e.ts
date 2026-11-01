import { test } from '@e2e-dev/web';
import { expect } from 'e2e';
import { selectText } from './select-text';

const SENTENCE = 'Watch the error rate for one full day';
const COMMENT = 'why one day?';

test('editing a saved comment: a trailing space or line break closes on a click outside, a real change is kept', async ({ app, browser, screen }) => {
  await app.open('/');
  await selectText(browser, screen, SENTENCE);
  await screen.getByRole('textbox', 'Comment').fill(COMMENT);
  await screen.getByRole('button', 'Add comment').tap();
  await expect(screen.getByText(COMMENT)).toBeVisible();

  // A trailing space is trimmed on save, so it is no change.
  await screen.getByRole('button', 'Edit annotation').tap();
  await screen.getByRole('textbox', 'Comment').press('End');
  await screen.getByRole('textbox', 'Comment').pressSequentially(' ');
  await screen.getByRole('heading', 'Rollout plan').tap();
  await expect(screen.getByRole('textbox', 'Comment')).toBeHidden();

  // So is a trailing line break.
  await screen.getByRole('button', 'Edit annotation').tap();
  await screen.getByRole('textbox', 'Comment').press('End');
  await screen.getByRole('textbox', 'Comment').press('Enter');
  await screen.getByRole('heading', 'Rollout plan').tap();
  await expect(screen.getByRole('textbox', 'Comment')).toBeHidden();

  // A real change refuses the click outside and keeps the composer open.
  await screen.getByRole('button', 'Edit annotation').tap();
  await screen.getByRole('textbox', 'Comment').press('End');
  await screen.getByRole('textbox', 'Comment').pressSequentially(' and why not two?');
  await screen.getByRole('heading', 'Rollout plan').tap();
  await expect(screen.getByRole('textbox', 'Comment')).toBeVisible();
});
