import type { Browser } from '@e2e-dev/web';
import type { Screen } from 'e2e/engine';

/** Selects a block's text with a real mouse drag, as a reviewer does. */
export async function selectText(browser: Browser, screen: Screen, text: string): Promise<void> {
  const box = await screen.getByText(text).boundingBox();
  if (!box) throw new Error(`"${text}" has no box`);
  const y = box.y + box.height / 2;
  await browser.mouse.move(box.x + 1, y);
  await browser.mouse.down();
  await browser.mouse.move(box.x + box.width - 1, y);
  await browser.mouse.up();
}
