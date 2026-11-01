import React, { useRef } from 'react';
import type { Block } from '../../types';
import { InlineMarkdown } from '../InlineMarkdown';

interface TableBlockProps {
  block: Block;
  onHover?: (element: HTMLElement) => void;
  onLeave?: () => void;
  onNavigateAnchor?: (hash: string) => void;
  imageBaseDir?: string;
  onImageClick?: (src: string, alt: string) => void;
}

// Parse pipe-delimited markdown table content into headers + rows.
// Exported so TableToolbar can reuse it to build a CSV copy without
// needing a second parser.
export const parseTableContent = (content: string): { headers: string[]; rows: string[][] } => {
  const lines = content.split('\n').filter((line) => line.trim());
  if (lines.length === 0) return { headers: [], rows: [] };

  const parseRow = (line: string): string[] =>
    line
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split(/(?<!\\)\|/)
      .map((cell) => cell.trim().replace(/\\\|/g, '|'));

  const headers = parseRow(lines[0]);
  const rows: string[][] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (/^[\|\-:\s]+$/.test(line)) continue; // separator row
    rows.push(parseRow(line));
  }
  return { headers, rows };
};

// RFC 4180 CSV escaping: quote values that contain a comma, double-quote,
// CR, or LF; escape inner double-quotes by doubling them.
const csvEscape = (value: string): string => {
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
};

// Convert the markdown table's pipe-delimited source into RFC 4180 CSV.
// The hover toolbar uses this on the raw block content.
export const buildCsv = (markdown: string): string => {
  const { headers, rows } = parseTableContent(markdown);
  const lines = [headers, ...rows].map((row) => row.map(csvEscape).join(','));
  return lines.join('\n');
};

export const TableBlock: React.FC<TableBlockProps> = ({
  block,
  onHover,
  onLeave,
  onNavigateAnchor,
  imageBaseDir,
  onImageClick,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { headers, rows } = parseTableContent(block.content);

  const handleMouseEnter = () => {
    if (containerRef.current && onHover) onHover(containerRef.current);
  };

  return (
    <div
      ref={containerRef}
      className="my-doc overflow-x-auto"
      data-block-id={block.id}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={onLeave}
    >
      <table className="min-w-full border-collapse text-sm">
        <thead>
          <tr className="border-b border-border">
            {headers.map((header, i) => (
              <th key={i} className="px-3 py-2 text-left font-semibold text-foreground/90 bg-muted/30">
                <InlineMarkdown
                  imageBaseDir={imageBaseDir}
                  onImageClick={onImageClick}
                  text={header}
                  onNavigateAnchor={onNavigateAnchor}
                />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIdx) => (
            <tr key={rowIdx} className="border-b border-border/50 hover:bg-muted/20">
              {row.map((cell, cellIdx) => (
                <td key={cellIdx} className="px-3 py-2 text-foreground/80">
                  <InlineMarkdown
                    imageBaseDir={imageBaseDir}
                    onImageClick={onImageClick}
                    text={cell}
                    onNavigateAnchor={onNavigateAnchor}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
