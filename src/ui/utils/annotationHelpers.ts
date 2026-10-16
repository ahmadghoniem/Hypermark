import type { Block } from '../types';

/**
 * Build hierarchical TOC structure from flat blocks array
 */
export interface TocItem {
  id: string;
  content: string;
  level: number;
  order: number;
  children: TocItem[];
}

export function buildTocHierarchy(blocks: Block[]): TocItem[] {
  const headings = blocks
    .filter(b => b.type === 'heading' && (b.level ?? 0) <= 3)
    .sort((a, b) => a.order - b.order);
  
  const root: TocItem[] = [];
  const stack: TocItem[] = [];
  
  for (const heading of headings) {
    const item: TocItem = {
      id: heading.id,
      content: heading.content,
      level: heading.level ?? 1,
      order: heading.order,
      children: [],
    };
    
    // Find the correct parent based on level
    while (stack.length > 0 && stack[stack.length - 1].level >= item.level) {
      stack.pop();
    }
    
    if (stack.length === 0) {
      // Top-level item
      root.push(item);
    } else {
      // Child of the last item in stack
      stack[stack.length - 1].children.push(item);
    }
    
    stack.push(item);
  }
  
  return root;
}
