import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ThemeProvider } from './ThemeProvider';
import { ThemeTab } from './ThemeTab';
import { resetStorageBackend, setStorageBackend } from '../utils/storage';
import { resetDefaultThemePair } from '../utils/themeRegistry';

const hasDom = typeof document !== 'undefined';

let root: Root | null = null;
let host: HTMLElement | null = null;

beforeEach(() => {
  setStorageBackend({
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {},
  });
  resetDefaultThemePair();
  if (hasDom) {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
  }
});

afterEach(() => {
  if (root) {
    act(() => root!.unmount());
    root = null;
  }
  if (host) {
    host.remove();
    host = null;
  }
  resetStorageBackend();
  resetDefaultThemePair();
});

describe.if(hasDom)('ThemeTab', () => {
  test('renders mode buttons and does NOT render a favicon picker', async () => {
    await act(async () => {
      root!.render(
        <ThemeProvider>
          <ThemeTab />
        </ThemeProvider>,
      );
    });

    const text = host!.textContent || '';
    expect(text).toContain('Mode');
    expect(text).toContain('Light');
    expect(text).toContain('Dark');
    expect(text).toContain('System');
    expect(text).toContain('Theme');
    // Favicon was removed from ThemeTab
    expect(text.toLowerCase()).not.toContain('favicon');
  });

  test('light half displays only the 4 light-supporting themes', async () => {
    await act(async () => {
      root!.render(
        <ThemeProvider defaultTheme="light">
          <ThemeTab />
        </ThemeProvider>,
      );
    });

    // When defaultTheme is light, preferredMode is light, so assigning tab starts on light
    const buttons = Array.from(host!.querySelectorAll('button'));
    const lightHalfButton = buttons.find(b => b.textContent?.includes('Light theme'));
    if (lightHalfButton) {
      await act(async () => {
        lightHalfButton.click();
      });
    }

    const renderedText = host!.textContent || '';
    expect(renderedText).toContain('Pierre');
    expect(renderedText).toContain('Hypermark');
    expect(renderedText).toContain('Catppuccin');
    expect(renderedText).toContain('GitHub');

    // Dark-only themes must NOT be offered for the light half
    expect(renderedText).not.toContain('Ayu Dark');
    expect(renderedText).not.toContain('One Dark Pro');
    expect(renderedText).not.toContain('Tokyo Night');
  });

  test('dark half displays all 7 themes', async () => {
    await act(async () => {
      root!.render(
        <ThemeProvider defaultTheme="dark">
          <ThemeTab />
        </ThemeProvider>,
      );
    });

    const buttons = Array.from(host!.querySelectorAll('button'));
    const darkHalfButton = buttons.find(b => b.textContent?.includes('Dark theme'));
    expect(darkHalfButton).toBeDefined();
    await act(async () => {
      darkHalfButton!.click();
    });

    const renderedText = host!.textContent || '';
    expect(renderedText).toContain('Pierre');
    expect(renderedText).toContain('Hypermark');
    expect(renderedText).toContain('Catppuccin');
    expect(renderedText).toContain('GitHub');
    expect(renderedText).toContain('Ayu Dark');
    expect(renderedText).toContain('One Dark Pro');
    expect(renderedText).toContain('Tokyo Night');
  });

  test('clicking theme card switches the assigned half palette', async () => {
    await act(async () => {
      root!.render(
        <ThemeProvider defaultTheme="dark">
          <ThemeTab />
        </ThemeProvider>,
      );
    });

    const buttons = Array.from(host!.querySelectorAll('button'));
    const catppuccinBtn = buttons.find(b => b.textContent?.includes('Catppuccin'));
    expect(catppuccinBtn).toBeDefined();

    await act(async () => {
      catppuccinBtn!.click();
    });

    // The Dark half button in summary reflects Catppuccin
    const darkSummaryBtn = Array.from(host!.querySelectorAll('button')).find(b => b.title?.includes('dark theme'));
    expect(darkSummaryBtn?.textContent).toContain('Catppuccin');
  });

  test('calls onPreview when Preview button is clicked', async () => {
    let previewClicked = false;
    await act(async () => {
      root!.render(
        <ThemeProvider>
          <ThemeTab onPreview={() => { previewClicked = true; }} />
        </ThemeProvider>,
      );
    });

    const buttons = Array.from(host!.querySelectorAll('button'));
    const previewBtn = buttons.find(b => b.textContent?.includes('Preview Mode'));
    expect(previewBtn).toBeDefined();

    await act(async () => {
      previewBtn!.click();
    });
    expect(previewClicked).toBe(true);
  });
});
