'use client';

import { useState } from 'react';
import { useAutosave } from '@/lib/hooks';
import { RichEditor } from '@/components/editor/rich-editor';
import { usePage } from './page-context';
import { Paper, SaveBadge } from './paper';

/** The back of any page: rich-text notes on dotted paper, as much as fits on one side of the sheet. */
export function NotesBack({
  kicker,
  title,
  meta,
  initial,
  save,
  onLocal,
  onSaved,
}: {
  kicker: string;
  title: React.ReactNode;
  meta?: React.ReactNode;
  initial: string;
  save: (html: string, keepalive: boolean) => Promise<unknown>;
  /** every change, straight away (keeps the cached page in step with what's on the paper) */
  onLocal?: (html: string) => void;
  onSaved?: () => void;
}) {
  const page = usePage();
  const [html, setHtml] = useState(initial);
  const { queue, status } = useAutosave<{ notes: string }>(async (p, keepalive) => {
    await save(p.notes ?? '', keepalive);
    onSaved?.();
  }, 900);

  return (
    <Paper side="back" kicker={kicker} title={title} meta={meta} status={<SaveBadge status={status} />}>
      <RichEditor
        className="note-area"
        value={html}
        toolbarTarget={page ? (page.active ? page.toolbarEl : null) : undefined}
        onFull={page?.onFull}
        onChange={(v) => {
          setHtml(v);
          onLocal?.(v);
          queue({ notes: v });
        }}
      />
    </Paper>
  );
}
