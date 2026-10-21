function getFenceLanguage(language?: string): string | undefined {
  return language?.trim().split(/\s+/, 1)[0]?.toLowerCase();
}

export function isMermaidLanguage(language?: string): boolean {
  return getFenceLanguage(language) === 'mermaid';
}
