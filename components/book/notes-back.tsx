'use client';

import { useState } from 'react';
import { useAutosave } from '@/lib/hooks';
import { RichEditor } from '@/components/editor/rich-editor';
import { Paper, SaveBadge } from './paper';

/** The back of any page: a full rich-text notes editor on dotted paper. */
export function NotesBack({
  kicker,
  title,
  meta,
  initial,
  save,
  onSaved,
}: {
  kicker: string;
  title: React.ReactNode;
  meta?: React.ReactNode;
  initial: string;
  save: (html: string, keepalive: boolean) => Promise<unknown>;
  onSaved?: () => void;
}) {
  const [html, setHtml] = useState(initial);
  const { queue, status } = useAutosave<{ notes: string }>(async (p, keepalive) => {
    await save(p.notes ?? '', keepalive);
    onSaved?.();
  }, 900);

  return (
    <Paper side="back" kicker={kicker} title={title} meta={meta} footRight={<SaveBadge status={status} />}>
      <RichEditor
        value={html}
        onChange={(v) => {
          setHtml(v);
          queue({ notes: v });
        }}
      />
    </Paper>
  );
}
