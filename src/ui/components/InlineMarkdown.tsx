import React, { useMemo } from "react";
import { transformPlainText } from "../utils/inlineTransforms";
import { getImageSrc } from "../utils/imageSrc";
import { normalizeMathTex, renderMathToHtml } from "../utils/math";
import { useMathRenderer } from "../hooks/useMathRenderer";

const DANGEROUS_PROTOCOL = /^\s*(javascript|data|vbscript|file)\s*:/i;
function sanitizeLinkUrl(url: string): string | null {
  if (DANGEROUS_PROTOCOL.test(url)) return null;
  return url;
}

const InlineMath: React.FC<{ tex: string }> = ({ tex }) => {
  const normalizedTex = normalizeMathTex(tex);
  const renderer = useMathRenderer();
  const html = useMemo(() => renderMathToHtml(normalizedTex, false, renderer), [normalizedTex, renderer]);

  // Same wrapper in both branches (see MathBlock): the placeholder carries the
  // attributes annotation restore keys on, with the TeX as a text child.
  if (html === null) {
    return (
      <span
        className="math-inline math-annotatable text-foreground"
        data-math-tex={normalizedTex}
        data-math-display="false"
        aria-label={normalizedTex}
      >
        {normalizedTex}
      </span>
    );
  }

  return (
    <span
      className="math-inline math-annotatable text-foreground"
      data-math-tex={normalizedTex}
      data-math-display="false"
      aria-label={normalizedTex}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};

function canRenderSpacedDollarMath(tex: string): boolean {
  const trimmed = normalizeMathTex(tex);
  if (!trimmed) return false;
  if (!/^\s|\s$/.test(tex)) return true;
  return (
    /\\[a-zA-Z]+/.test(trimmed) ||
    /[=^_{}+\-*/<>|]/.test(trimmed) ||
    /^[a-zA-Z]$/.test(trimmed)
  );
}

// Trim trailing sentence punctuation from a bare URL, but keep closing
// brackets when they balance an opener inside the URL (Wikipedia-style
// https://…/Function_(mathematics) should keep its closing paren).
export function trimUrlTail(url: string): string {
  const balanced = (u: string, close: string, open: string): boolean => {
    let opens = 0, closes = 0;
    for (const c of u) {
      if (c === open) opens++;
      else if (c === close) closes++;
    }
    return opens >= closes;
  };
  while (url.length > 0) {
    const last = url[url.length - 1];
    if (!/[.,;:!?)\]}>"'*_~]/.test(last)) break;
    if (last === ')' && balanced(url, ')', '(')) break;
    if (last === ']' && balanced(url, ']', '[')) break;
    if (last === '}' && balanced(url, '}', '{')) break;
    url = url.slice(0, -1);
  }
  return url;
}

// Scan a plain-text chunk for bare https?:// URLs at word boundaries and emit
// them as links. Other text passes through transformPlainText for smart
// punctuation.
function emitPlainTextWithBareUrls(
  text: string,
  previousChar: string,
  parts: React.ReactNode[],
  nextKey: () => number,
): void {
  if (text.length === 0) return;

  type Span = { start: number; end: number; kind: 'url'; value: string };
  const spans: Span[] = [];

  // Collect bare URLs
  const urlRe = /https?:\/\/[^\s<>"']+/g;
  let m: RegExpExecArray | null;
  while ((m = urlRe.exec(text)) !== null) {
    const before = m.index === 0 ? previousChar : text[m.index - 1];
    if (/\w/.test(before)) continue;
    const url = trimUrlTail(m[0]);
    const safe = url.length > 0 ? sanitizeLinkUrl(url) : null;
    if (!safe) continue;
    spans.push({ start: m.index, end: m.index + url.length, kind: 'url', value: url });
    urlRe.lastIndex = m.index + url.length;
  }

  if (spans.length === 0) {
    parts.push(transformPlainText(text));
    return;
  }

  spans.sort((a, b) => a.start - b.start);

  let last = 0;
  for (const span of spans) {
    if (span.start > last) {
      parts.push(transformPlainText(text.slice(last, span.start)));
    }
    if (span.kind === 'url') {
      parts.push(
        <a
          key={nextKey()}
          href={span.value}
          target="_blank"
          rel="noopener noreferrer"
          className="doc-link text-primary underline-offset-3 hover:underline"
        >
          {span.value}
        </a>,
      );
    }
    last = span.end;
  }
  if (last < text.length) {
    parts.push(transformPlainText(text.slice(last)));
  }
}

// Link text renders its code spans as chips. The rest stays literal, so a
// URL used as the label does not nest a second anchor inside the link.
function renderLinkLabel(text: string): React.ReactNode {
  const pieces = text.split(/(`[^`]+`)/);
  if (pieces.length === 1) return text;
  return pieces.map((piece, i) => (i % 2 === 1
    ? <code key={i} className="px-1 py-px rounded-xs bg-surface-3 text-sm font-mono">{piece.slice(1, -1)}</code>
    : piece));
}

/**
 * Scanner that walks a text string and emits React nodes for inline markdown:
 * emphasis (**bold**, *italic*, _italic_, ***both***), `code`, ~~strikethrough~~,
 * [label](url) / ![alt](src) / <autolink>, bare https:// URLs, [[wiki-links]],
 * inline math ($...$), hex color swatches (#fff / #123abc), and backslash
 * escapes. Plain-text chunks outside these patterns pass through
 * `transformPlainText` for smart punctuation.
 */
export const InlineMarkdown: React.FC<{
  text: string;
  onNavigateAnchor?: (hash: string) => void;
  imageBaseDir?: string;
  onImageClick?: (src: string, alt: string) => void;
}> = ({ text, onNavigateAnchor, imageBaseDir, onImageClick }) => {
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = 0;
  let previousChar = "";

  while (remaining.length > 0) {
    // HTML comments: skip entirely — they should be invisible per CommonMark.
    // The parser doesn't recognize <!-- --> as a block-level construct, so
    // comments inside paragraphs land here. Without this, path detection
    // would linkify paths inside comments.
    let match = remaining.match(/^<!--[\s\S]*?-->/);
    if (match) {
      remaining = remaining.slice(match[0].length);
      previousChar = ">";
      continue;
    }

    // Inline math: \( ... \) or $...$ — require non-space content and avoid
    // display fences.
    if (remaining.startsWith('\\(')) {
      let end = -1;
      for (let i = 2; i < remaining.length - 1; i++) {
        if (remaining[i] === '\\' && remaining[i + 1] === ')') {
          if (i > 0 && remaining[i - 1] === '\\') continue;
          end = i;
          break;
        }
      }
      if (end > 1) {
        const tex = remaining.slice(2, end);
        if (tex.trim()) {
          parts.push(<InlineMath key={key++} tex={tex} />);
          remaining = remaining.slice(end + 2);
          previousChar = ')';
          continue;
        }
      }
    }

    // Backslash escaping: \. \* \_ \` \[ \~ \$ etc. — emit literal char, hide backslash
    match = remaining.match(/^\\([\\*_`\[\]~!.()\-#>+|{}&$])/);
    if (match) {
      parts.push(match[1]);
      remaining = remaining.slice(2);
      previousChar = match[1];
      continue;
    }

    // Inline math: $...$ — require non-space content and avoid $$ display fences.
    if (remaining.startsWith('$') && previousChar !== '$' && !remaining.startsWith('$$')) {
      let end = -1;
      for (let i = 1; i < remaining.length; i++) {
        if (remaining[i] === '\\') {
          i++;
          continue;
        }
        if (remaining[i] === '$') {
          end = i;
          break;
        }
      }
      if (end > 1) {
        const tex = remaining.slice(1, end);
        // Money guard: `$A$B` where a digit immediately follows the closing `$`
        // is almost always two currency amounts ("$5-$10", "$50,000-$100,000",
        // "$5/mo and tier B is $10/mo"), not inline math — real inline math never
        // abuts a digit across the closing delimiter. Leave such text literal.
        const afterClose = remaining[end + 1];
        const looksLikeMoney = /^\s*\d/.test(tex) && afterClose !== undefined && /\d/.test(afterClose);
        if (!looksLikeMoney && canRenderSpacedDollarMath(tex)) {
          parts.push(<InlineMath key={key++} tex={tex} />);
          remaining = remaining.slice(end + 1);
          previousChar = '$';
          continue;
        }
      }
    }

    // Bare URL autolink: https://… preceded by word boundary.
    // Trailing sentence punctuation is trimmed so "See https://x.com."
    // renders the period outside the link. Closing brackets are kept when
    // they balance an earlier opener inside the URL (e.g. Wikipedia's
    // https://…/Function_(mathematics) keeps its trailing paren).
    if (!/\w/.test(previousChar)) {
      const bareMatch = remaining.match(/^https?:\/\/[^\s<>"']+/);
      if (bareMatch) {
        const url = trimUrlTail(bareMatch[0]);
        const safe = url.length > 0 ? sanitizeLinkUrl(url) : null;
        if (safe) {
          parts.push(
            <a
              key={key++}
              href={safe}
              target="_blank"
              rel="noopener noreferrer"
              className="doc-link text-primary underline-offset-3 hover:underline"
            >
              {url}
            </a>,
          );
          remaining = remaining.slice(url.length);
          previousChar = url[url.length - 1];
          continue;
        }
      }
    }

    // Autolinks: <https://url> or <email@domain.com>
    match = remaining.match(/^<(https?:\/\/[^>]+)>/);
    if (match) {
      const url = match[1];
      parts.push(
        <a
          key={key++}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="doc-link text-primary underline-offset-3 hover:underline"
        >
          {url}
        </a>,
      );
      remaining = remaining.slice(match[0].length);
      previousChar = ">";
      continue;
    }
    match = remaining.match(/^<([^@>\s]+@[^>\s]+)>/);
    if (match) {
      const email = match[1];
      parts.push(
        <a
          key={key++}
          href={`mailto:${email}`}
          className="doc-link text-primary underline-offset-3 hover:underline"
        >
          {email}
        </a>,
      );
      remaining = remaining.slice(match[0].length);
      previousChar = ">";
      continue;
    }

    // Keep custom autolinks literal; their contents should not
    // recurse into markdown parsing.
    match = remaining.match(/^<([A-Za-z][A-Za-z0-9.+-]{0,31}:[^\s<>]*)>/);
    if (match) {
      const content = match[1];
      parts.push(<span key={key++}>{`<${content}>`}</span>);
      remaining = remaining.slice(match[0].length);
      previousChar = ">";
      continue;
    }

    // Strikethrough: ~~text~~
    match = remaining.match(/^~~([\s\S]+?)~~/);
    if (match) {
      parts.push(
        <del key={key++}>
          <InlineMarkdown
            imageBaseDir={imageBaseDir}
            onImageClick={onImageClick}
            text={match[1]}
            onNavigateAnchor={onNavigateAnchor}
          />
        </del>,
      );
      remaining = remaining.slice(match[0].length);
      previousChar = match[0][match[0].length - 1] || previousChar;
      continue;
    }

    // Bold + italic: ***text***
    match = remaining.match(/^\*\*\*([\s\S]+?)\*\*\*/);
    if (match) {
      parts.push(
        <strong key={key++} className="font-semibold">
          <em>
            <InlineMarkdown
              imageBaseDir={imageBaseDir}
              onImageClick={onImageClick}
              text={match[1]}
              onNavigateAnchor={onNavigateAnchor}
            />
          </em>
        </strong>,
      );
      remaining = remaining.slice(match[0].length);
      previousChar = match[0][match[0].length - 1] || previousChar;
      continue;
    }

    // Bold: **text** ([\s\S]+? allows matching across hard line breaks)
    match = remaining.match(/^\*\*([\s\S]+?)\*\*/);
    if (match) {
      parts.push(
        <strong key={key++} className="font-semibold">
          <InlineMarkdown
            imageBaseDir={imageBaseDir}
            onImageClick={onImageClick}
            text={match[1]}
            onNavigateAnchor={onNavigateAnchor}
          />
        </strong>,
      );
      remaining = remaining.slice(match[0].length);
      previousChar = match[0][match[0].length - 1] || previousChar;
      continue;
    }

    // Italic: *text* or _text_ (avoid intraword underscores)
    match = remaining.match(/^\*([\s\S]+?)\*/);
    if (match) {
      parts.push(
        <em key={key++}>
          <InlineMarkdown
            imageBaseDir={imageBaseDir}
            onImageClick={onImageClick}
            text={match[1]}
            onNavigateAnchor={onNavigateAnchor}
          />
        </em>,
      );
      remaining = remaining.slice(match[0].length);
      previousChar = match[0][match[0].length - 1] || previousChar;
      continue;
    }

    match = !/\w/.test(previousChar)
      ? remaining.match(/^_([^_\s](?:[\s\S]*?[^_\s])?)_(?!\w)/)
      : null;
    if (match) {
      parts.push(
        <em key={key++}>
          <InlineMarkdown
            imageBaseDir={imageBaseDir}
            onImageClick={onImageClick}
            text={match[1]}
            onNavigateAnchor={onNavigateAnchor}
          />
        </em>,
      );
      remaining = remaining.slice(match[0].length);
      previousChar = match[0][match[0].length - 1] || previousChar;
      continue;
    }

    // Inline code: `code`
    match = remaining.match(/^`([^`]+)`/);
    if (match) {
      const codeContent = match[1];
      parts.push(
        <code
          key={key++}
          className="px-1 py-px rounded-xs bg-surface-3 text-sm font-mono"
        >
          {codeContent}
        </code>,
      );
      remaining = remaining.slice(match[0].length);
      previousChar = match[0][match[0].length - 1] || previousChar;
      continue;
    }

    // Hex color swatch — 3/4-digit forms need an a-f letter, so annotation numbers like #123 stay text.
    match = remaining.match(
      /^(#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|(?=[0-9a-fA-F]*[a-fA-F])[0-9a-fA-F]{4}|(?=[0-9a-fA-F]*[a-fA-F])[0-9a-fA-F]{3}))(?![0-9a-fA-F\w])/,
    );
    if (match) {
      const hex = match[1];
      parts.push(
        <span
          key={key++}
          className="inline-flex items-center gap-1 align-middle"
        >
          <span
            className="inline-block size-3.5 rounded-sm border border-foreground/20 shrink-0"
            style={{ backgroundColor: hex }}
            title={hex}
          />
          <code className="px-1 py-px rounded-xs bg-surface-3 text-sm font-mono">
            {hex}
          </code>
        </span>,
      );
      remaining = remaining.slice(match[0].length);
      previousChar = match[0][match[0].length - 1] || previousChar;
      continue;
    }

    // Wikilinks: [[filename]] or [[filename|display text]], shown as their
    // label; there is nothing to open them in.
    match = remaining.match(/^\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/);
    if (match) {
      const display = match[2]?.trim() || match[1].trim();
      parts.push(
        <span key={key++} className="text-primary">
          {display}
        </span>,
      );
      remaining = remaining.slice(match[0].length);
      previousChar = match[0][match[0].length - 1] || previousChar;
      continue;
    }

    // Images: ![alt](path)
    match = remaining.match(/^!\[([^\]]*)\]\(([^)]+)\)/);
    if (match) {
      const alt = match[1];
      const src = match[2];
      const imgSrc = /^(https?:\/\/|data:|blob:)/i.test(src)
        ? src
        : getImageSrc(src, imageBaseDir);
      parts.push(
        <img
          key={key++}
          src={imgSrc}
          alt={alt}
          className="max-w-full rounded-sm my-2 cursor-zoom-in"
          loading="lazy"
          onClick={(e) => {
            e.stopPropagation();
            onImageClick?.(imgSrc, alt);
          }}
        />,
      );
      remaining = remaining.slice(match[0].length);
      previousChar = match[0][match[0].length - 1] || previousChar;
      continue;
    }

    // Links: [text](url) — url may contain balanced parens (e.g. Wikipedia
    // /Function_(mathematics)). Plain `[^)]+` would truncate at the first
    // inner close-paren, so we scan the destination manually tracking depth.
    const linkParsed = (() => {
      if (remaining[0] !== '[') return null;
      let i = 1;
      let depth = 1;
      while (i < remaining.length && depth > 0) {
        const ch = remaining[i];
        if (ch === '\\' && i + 1 < remaining.length) { i += 2; continue; }
        if (ch === '[') depth++;
        else if (ch === ']') depth--;
        if (depth === 0) break;
        i++;
      }
      if (depth !== 0 || remaining[i + 1] !== '(') return null;
      const textEnd = i;
      let j = i + 2;
      let parenDepth = 1;
      while (j < remaining.length && parenDepth > 0) {
        const ch = remaining[j];
        if (ch === '\\' && j + 1 < remaining.length) { j += 2; continue; }
        if (ch === '(') parenDepth++;
        else if (ch === ')') { parenDepth--; if (parenDepth === 0) break; }
        else if (ch === '\n') return null;
        j++;
      }
      if (parenDepth !== 0) return null;
      const linkText = remaining.slice(1, textEnd);
      const linkUrl = remaining.slice(i + 2, j);
      if (!linkText || !linkUrl) return null;
      return { linkText, linkUrl, consumed: j + 1 };
    })();
    if (linkParsed) {
      const { linkText, linkUrl, consumed } = linkParsed;
      const label = renderLinkLabel(linkText);
      const safeLinkUrl = sanitizeLinkUrl(linkUrl);

      // Dangerous protocol stripped — render as plain text, not a dead link
      if (safeLinkUrl === null) {
        parts.push(<span key={key++}>{label}</span>);
        remaining = remaining.slice(consumed);
        previousChar = ')';
        continue;
      }

      const isInPageAnchor = safeLinkUrl.startsWith('#');

      if (isInPageAnchor) {
        parts.push(
          <a
            key={key++}
            href={safeLinkUrl}
            onClick={onNavigateAnchor ? (e) => {
              e.preventDefault();
              onNavigateAnchor(safeLinkUrl);
            } : undefined}
            className="doc-link text-primary underline-offset-3 hover:underline"
          >
            {label}
          </a>,
        );
      } else if (!/^[a-z][a-z0-9+.-]*:/i.test(safeLinkUrl)) {
        // A relative link (another document, a code file, a folder) has
        // nothing to open here, and following it would leave the session.
        parts.push(<span key={key++}>{label}</span>);
      } else {
        parts.push(
          <a
            key={key++}
            href={safeLinkUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="doc-link text-primary underline-offset-3 hover:underline"
          >
            {label}
          </a>,
        );
      }
      remaining = remaining.slice(consumed);
      previousChar = ')';
      continue;
    }

    // Hard line break: two+ trailing spaces + newline, or backslash + newline
    match = remaining.match(/ {2,}\n|\\\n/);
    if (match && match.index !== undefined) {
      const before = remaining.slice(0, match.index);
      if (before) {
        parts.push(
          <InlineMarkdown
            key={key++}
            text={before}
            onNavigateAnchor={onNavigateAnchor}
            imageBaseDir={imageBaseDir}
            onImageClick={onImageClick}
          />,
        );
      }
      parts.push(<br key={key++} />);
      remaining = remaining.slice(match.index + match[0].length);
      previousChar = "\n";
      continue;
    }

    // Find next special character or consume one regular character.
    // `h` is intentionally NOT in this class — plain-text chunks may contain
    // `h` mid-word (e.g. "hello"), and splitting on it breaks multi-char
    // patterns in the plain-text transforms. Bare URLs are instead
    // detected inline via emitPlainTextWithBareUrls() below.
    const nextSpecial = remaining.slice(1).search(/[\*_`\[!~\\<#@$]/);
    let end = nextSpecial === -1 ? remaining.length : nextSpecial + 1;
    // A bare URL in the chunk keeps its #fragment, @, ~ and _ to its end.
    const urlRe = /https?:\/\/[^\s<>"']+/g;
    let urlMatch: RegExpExecArray | null;
    while ((urlMatch = urlRe.exec(remaining)) !== null && urlMatch.index < end) {
      end = Math.max(end, urlMatch.index + trimUrlTail(urlMatch[0]).length);
    }
    const plainText = remaining.slice(0, end);
    emitPlainTextWithBareUrls(plainText, previousChar, parts, () => key++);
    previousChar = plainText[plainText.length - 1] || previousChar;
    if (end >= remaining.length) {
      break;
    }
    remaining = remaining.slice(end);
  }

  return <>{parts}</>;
};
