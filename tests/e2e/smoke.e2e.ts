import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

test('a real annotate session renders the document', async ({ app, browser, screen }) => {
  // Collect console errors and uncaught exceptions from the first script on.
  await browser.addInitScript(() => {
    const errors: string[] = [];
    (window as unknown as { __hmErrors: string[] }).__hmErrors = errors;
    const original = console.error.bind(console);
    console.error = (...args: unknown[]) => {
      errors.push(args.map(String).join(' '));
      original(...args);
    };
    window.addEventListener('error', (event) => errors.push(event.message));
    window.addEventListener('unhandledrejection', (event) => errors.push(String(event.reason)));
  });

  await app.open('/');
  await expect(screen.getByRole('heading', 'Rollout plan')).toBeVisible();
  await expect(screen.getByText('upload_limits_enabled')).toBeVisible();
  await expect(screen.getByText('Watch the error rate for one full day')).toBeVisible();

  const errors = await browser.evaluate(() => (window as unknown as { __hmErrors: string[] }).__hmErrors);
  expect(errors).toEqual([]);

  // responseStatus is 0 for a request that got no response, and 4xx/5xx for an error.
  // `/api/draft` answers 404 when no draft is saved.
  const failed = await browser.evaluate(() =>
    (performance.getEntriesByType('resource') as PerformanceResourceTiming[])
      .filter((entry) => !(entry.responseStatus === 404 && new URL(entry.name).pathname === '/api/draft'))
      .filter((entry) => entry.responseStatus === 0 || entry.responseStatus >= 400)
      .map((entry) => `${entry.responseStatus} ${entry.name}`),
  );
  expect(failed).toEqual([]);
});
