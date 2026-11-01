import React from 'react';
import { ListMarker } from './ListMarker';

/**
 * List-item body: the marker plus the item's text content, used by
 * BlockRenderer.
 *
 * The caller owns the surrounding row element (indent, data attributes,
 * hover-prop spread). This component owns marker selection and
 * the single-paragraph `<span>` vs multi-paragraph `<div><p>...</p></div>`
 * split.
 */
interface ListItemBodyProps {
  level: number;
  ordered?: boolean;
  orderedIndex?: number | null;
  checked?: boolean; // undefined = not a checkbox
  interactive?: boolean;
  onToggle?: () => void;
  textClassName: string;
  content: string;
  renderInline: (text: string) => React.ReactNode;
}

export const ListItemBody: React.FC<ListItemBodyProps> = ({
  level,
  ordered,
  orderedIndex,
  checked,
  interactive,
  onToggle,
  textClassName,
  content,
  renderInline,
}) => {
  const paragraphs = content.split(/\n\n+/);
  return (
    <>
      <ListMarker
        level={level}
        ordered={ordered}
        orderedIndex={orderedIndex}
        checked={checked}
        interactive={interactive}
        onToggle={onToggle}
      />
      {paragraphs.length === 1 ? (
        <span className={textClassName}>{renderInline(content)}</span>
      ) : (
        <div className={textClassName}>
          {paragraphs.map((para, i) => (
            <p key={i} className={i > 0 ? 'mt-3' : ''}>
              {renderInline(para)}
            </p>
          ))}
        </div>
      )}
    </>
  );
};
