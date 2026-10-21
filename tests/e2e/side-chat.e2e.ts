import { test } from '@e2e-dev/web';
import { expect } from 'e2e';
import { selectText } from './select-text';

const SENTENCE = 'Watch the error rate for one full day';
// The answer HYPERMARK_SIDE_CHAT_STUB streams (SIDE_CHAT_STUB_ANSWER in src/server/side-chat.ts).
const ANSWER = 'Because a full day covers the daily traffic peak.';

test('a /sidechat question about a selection streams its answer into the side chat', async ({ app, browser, screen }) => {
  await app.open('/');
  await selectText(browser, screen, SENTENCE);

  await screen.getByRole('textbox', 'Comment').fill('/sidechat why one day?');
  await screen.getByRole('button', 'Ask a side question').tap();

  const card = screen.getByRole('dialog', 'Side question');
  await expect(card.getByText('why one day?')).toBeVisible();
  await expect(card.getByText(ANSWER)).toBeVisible();
  await expect(card.getByRole('button', 'Send')).toBeVisible();
});
