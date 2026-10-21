import { describe, expect, test } from 'bun:test';
import { isMermaidLanguage } from './diagramLanguages';

describe('diagramLanguages', () => {
  test('matches mermaid fences case-insensitively', () => {
    expect(isMermaidLanguage('mermaid')).toBe(true);
    expect(isMermaidLanguage('Mermaid')).toBe(true);
    expect(isMermaidLanguage('mermaid align=center')).toBe(true);
    expect(isMermaidLanguage('graphviz')).toBe(false);
  });
});
