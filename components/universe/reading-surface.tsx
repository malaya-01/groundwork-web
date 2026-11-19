'use client';

// The readable layer of an open library book (journals open as the real notebook instead). The 3D book stays the object; the words on its open pages
// are drawn here as real vector text / DOM, positioned every frame exactly over the 3D pages
// (see ReadingProjector in scene.tsx). So text is sharp at every zoom and never distorted.
// Pointer events pass through to the 3D pages (click to turn, drag to turn, double-click…).
import { memo } from 'react';
import { LIB_PAGE, ornamentPoints, PAPER, type Typeset } from '@/lib/library';
import { focusedBook, readingEls, typesets, useU, type UBook } from '@/lib/universe';

export function ReadingSurface() {
  const mode = useU((s) => s.mode);
  const sheet = useU((s) => s.sheet);
  const focus = useU((s) => s.focus);
  useU((s) => s.typesetVersion);
  const book = focusedBook();
  if (mode !== 'open' || !book || !focus || book.kind !== 'library') return null;
  return (
    <div
      ref={(el) => void (readingEls.root = el)}
      className="reading-surface pointer-events-none absolute inset-0 overflow-hidden"
      style={{ opacity: 0 }}
      aria-label="Open book"
    >
      <div ref={(el) => void (readingEls.left = el)} className="rs-page rs-left">
        <Face book={book} sheet={sheet} side="back" />
      </div>
      <div ref={(el) => void (readingEls.right = el)} className="rs-page rs-right">
        <Face book={book} sheet={sheet + 1} side="front" />
      </div>
    </div>
  );
}

function Face({ book, sheet, side }: { book: UBook; sheet: number; side: 'front' | 'back' }) {
  const ts = typesets.get(book.id);
  const n = ts ? Math.ceil(ts.pages.length / 2) : 0;
  const p = side === 'front' ? 2 * sheet : 2 * sheet + 1;
  if (!ts || sheet < 0 || sheet >= n || p >= ts.pages.length) return <Endpaper />;
  return <LibPage ts={ts} index={p} />;
}

function Endpaper() {
  return <div className="rs-endpaper" />;
}

/** A typeset library page as vector SVG: identical layout to the 3D texture, sharp at any size. */
const LibPage = memo(function LibPage({ ts, index }: { ts: Typeset; index: number }) {
  const page = ts.pages[index];
  return (
    <div className="rs-scale" style={{ width: LIB_PAGE.W, height: LIB_PAGE.H, background: PAPER }}>
      <svg viewBox={`0 0 ${LIB_PAGE.W} ${LIB_PAGE.H}`} width={LIB_PAGE.W} height={LIB_PAGE.H} textRendering="geometricPrecision" aria-label={`Page ${index + 1}`}>
        {page.ops.map((op, i) => {
          if (op.k === 'text')
            return (
              <text
                key={i}
                x={op.x}
                y={op.y}
                fill={op.color ?? '#1a1814'}
                textAnchor={op.align === 'center' ? 'middle' : op.align === 'right' ? 'end' : 'start'}
                style={{ font: op.font, letterSpacing: op.ls ? `${op.ls}px` : undefined, whiteSpace: 'pre' }}
              >
                {op.text}
              </text>
            );
          if (op.k === 'rule') return <line key={i} x1={op.x1} x2={op.x2} y1={op.y} y2={op.y} stroke={op.color} strokeWidth={op.w} />;
          return (
            <g key={i} fill={op.color}>
              {ornamentPoints(op.x, op.y, op.s).map((pts, j) => (
                <polygon key={j} points={pts} />
              ))}
            </g>
          );
        })}
      </svg>
    </div>
  );
});
