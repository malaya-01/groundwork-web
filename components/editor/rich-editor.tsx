'use client';

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import type { EditorState } from '@tiptap/pm/state';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextStyle from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import TextAlign from '@tiptap/extension-text-align';
import Link from '@tiptap/extension-link';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import FontFamily from '@tiptap/extension-font-family';
import Placeholder from '@tiptap/extension-placeholder';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';
import Subscript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Code,
  Highlighter,
  Indent,
  Italic,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Outdent,
  Quote,
  Redo2,
  RemoveFormatting,
  SquareCode,
  Strikethrough,
  Subscript as SubIcon,
  Superscript as SupIcon,
  Table as TableIcon,
  Underline as UnderlineIcon,
  Undo2,
  Baseline,
} from 'lucide-react';
import clsx from 'clsx';
import { FontSize } from './font-size';
import { EDITOR_FONTS } from '@/lib/fonts';

const SIZES = ['12px', '14px', '16px', '18px', '20px', '24px', '28px', '32px', '40px', '48px'];

/**
 * Rich text on a page. The writing area has a fixed size (it's paper): a change that would run
 * past the bottom of the page is refused, as on a real sheet. Shortening is always allowed, so
 * an over-full page (e.g. after switching to a bigger font) can still be edited down.
 *
 * `toolbarTarget`: where the formatting toolbar goes. undefined = above the text;
 * an element = portalled there (off the paper); null = hidden.
 */
export function RichEditor({
  value,
  onChange,
  placeholder = 'Write anything: thoughts, notes, rough work, code…',
  className,
  toolbarTarget,
  onFull,
}: {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  className?: string;
  toolbarTarget?: HTMLElement | null;
  onFull?: () => void;
}) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onFullRef = useRef(onFull);
  onFullRef.current = onFull;
  const box = useRef<HTMLDivElement>(null);
  const good = useRef<{ state: EditorState | null; height: number; html: string }>({ state: null, height: 0, html: value });

  const editor = useEditor({
    // pages are only ever rendered in the browser (their data is fetched client-side), so the
    // editor can render on the first pass instead of popping in a frame later
    immediatelyRender: typeof window !== 'undefined',
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Underline,
      TextStyle,
      Color,
      FontFamily,
      FontSize,
      Highlight.configure({ multicolor: true }),
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Link.configure({ openOnClick: false, autolink: true, HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' } }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
      Subscript,
      Superscript,
    ],
    content: value || '',
    onCreate: ({ editor }) => {
      good.current.state = editor.state;
      good.current.height = (editor.view.dom as HTMLElement).scrollHeight;
    },
    onTransaction: ({ editor, transaction }) => {
      const g = good.current;
      const el = box.current;
      if (transaction.docChanged && el) {
        const h = (editor.view.dom as HTMLElement).scrollHeight;
        // ran off the page (and made it longer than it already was): undo this one change
        if (h > el.clientHeight + 1 && h > g.height && g.state) {
          editor.view.updateState(g.state);
          onFullRef.current?.();
          return;
        }
        g.height = h;
      }
      g.state = editor.state;
    },
    onUpdate: ({ editor }) => {
      const html = editor.isEmpty ? '' : editor.getHTML();
      if (html === good.current.html) return;
      good.current.html = html;
      onChangeRef.current(html);
    },
    editorProps: { attributes: { spellcheck: 'true' } },
  });

  // If the stored note changes underneath us (e.g. first load), show it.
  useEffect(() => {
    if (editor && !editor.isFocused && value !== editor.getHTML() && !(value === '' && editor.isEmpty)) {
      good.current.html = value;
      editor.commands.setContent(value || '', false);
    }
  }, [editor, value]);

  const toolbar = <Toolbar editor={editor} />;
  return (
    <>
      {toolbarTarget === undefined ? toolbar : toolbarTarget ? createPortal(toolbar, toolbarTarget) : null}
      <div ref={box} className={clsx('editor-content dot-paper', className)}>
        <EditorContent editor={editor} />
      </div>
    </>
  );
}

function Btn({
  on,
  disabled,
  title,
  onClick,
  children,
}: {
  on?: boolean;
  disabled?: boolean;
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={on}
      disabled={disabled}
      className={clsx(on && 'on')}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function Toolbar({ editor }: { editor: Editor | null }) {
  if (!editor) return <div className="tb h-[44px]" />;
  const c = () => editor.chain().focus();
  const style = editor.isActive('heading', { level: 1 })
    ? 'h1'
    : editor.isActive('heading', { level: 2 })
      ? 'h2'
      : editor.isActive('heading', { level: 3 })
        ? 'h3'
        : 'p';
  const family = (editor.getAttributes('textStyle').fontFamily as string | undefined) ?? '';
  const size = (editor.getAttributes('textStyle').fontSize as string | undefined) ?? '';
  const inTable = editor.isActive('table');

  const setLink = () => {
    const prev = editor.getAttributes('link').href as string | undefined;
    const url = window.prompt('Link address (leave empty to remove)', prev ?? 'https://');
    if (url === null) return;
    if (url.trim() === '' || url === 'https://') c().extendMarkRange('link').unsetLink().run();
    else c().extendMarkRange('link').setLink({ href: url.trim() }).run();
  };

  return (
    <div className="tb" role="toolbar" aria-label="Formatting">
      <Btn title="Undo (Ctrl+Z)" disabled={!editor.can().undo()} onClick={() => c().undo().run()}>
        <Undo2 size={16} />
      </Btn>
      <Btn title="Redo (Ctrl+Y)" disabled={!editor.can().redo()} onClick={() => c().redo().run()}>
        <Redo2 size={16} />
      </Btn>
      <span className="sep" />
      <select
        title="Paragraph style"
        value={style}
        onChange={(e) => {
          const v = e.target.value;
          if (v === 'p') c().setParagraph().run();
          else c().toggleHeading({ level: Number(v.slice(1)) as 1 | 2 | 3 }).run();
        }}
      >
        <option value="p">Normal text</option>
        <option value="h1">Heading 1</option>
        <option value="h2">Heading 2</option>
        <option value="h3">Heading 3</option>
      </select>
      <select
        title="Font"
        value={family}
        style={{ maxWidth: 150 }}
        onChange={(e) => (e.target.value ? c().setFontFamily(e.target.value).run() : c().unsetFontFamily().run())}
      >
        <option value="">Page font</option>
        {EDITOR_FONTS.map((f) => (
          <option key={f.label} value={f.css} style={{ fontFamily: f.css }}>
            {f.label}
          </option>
        ))}
      </select>
      <select title="Font size" value={size} onChange={(e) => (e.target.value ? c().setFontSize(e.target.value).run() : c().unsetFontSize().run())}>
        <option value="">Size</option>
        {SIZES.map((s) => (
          <option key={s} value={s}>
            {parseInt(s, 10)}
          </option>
        ))}
      </select>
      <span className="sep" />
      <Btn title="Bold (Ctrl+B)" on={editor.isActive('bold')} onClick={() => c().toggleBold().run()}>
        <Bold size={16} />
      </Btn>
      <Btn title="Italic (Ctrl+I)" on={editor.isActive('italic')} onClick={() => c().toggleItalic().run()}>
        <Italic size={16} />
      </Btn>
      <Btn title="Underline (Ctrl+U)" on={editor.isActive('underline')} onClick={() => c().toggleUnderline().run()}>
        <UnderlineIcon size={16} />
      </Btn>
      <Btn title="Strikethrough" on={editor.isActive('strike')} onClick={() => c().toggleStrike().run()}>
        <Strikethrough size={16} />
      </Btn>
      <label className="tb-color" title="Text colour">
        <Baseline size={16} style={{ color: (editor.getAttributes('textStyle').color as string) || undefined }} />
        <input
          type="color"
          className="sr-only"
          value={(editor.getAttributes('textStyle').color as string) || '#23358f'}
          onChange={(e) => c().setColor(e.target.value).run()}
        />
      </label>
      <label className="tb-color" title="Highlight colour">
        <Highlighter size={16} />
        <input type="color" className="sr-only" defaultValue="#fff1a8" onChange={(e) => c().setHighlight({ color: e.target.value }).run()} />
      </label>
      <Btn title="Subscript" on={editor.isActive('subscript')} onClick={() => c().toggleSubscript().run()}>
        <SubIcon size={16} />
      </Btn>
      <Btn title="Superscript" on={editor.isActive('superscript')} onClick={() => c().toggleSuperscript().run()}>
        <SupIcon size={16} />
      </Btn>
      <span className="sep" />
      <Btn title="Align left" on={editor.isActive({ textAlign: 'left' })} onClick={() => c().setTextAlign('left').run()}>
        <AlignLeft size={16} />
      </Btn>
      <Btn title="Align centre" on={editor.isActive({ textAlign: 'center' })} onClick={() => c().setTextAlign('center').run()}>
        <AlignCenter size={16} />
      </Btn>
      <Btn title="Align right" on={editor.isActive({ textAlign: 'right' })} onClick={() => c().setTextAlign('right').run()}>
        <AlignRight size={16} />
      </Btn>
      <Btn title="Justify" on={editor.isActive({ textAlign: 'justify' })} onClick={() => c().setTextAlign('justify').run()}>
        <AlignJustify size={16} />
      </Btn>
      <span className="sep" />
      <Btn title="Bulleted list" on={editor.isActive('bulletList')} onClick={() => c().toggleBulletList().run()}>
        <List size={16} />
      </Btn>
      <Btn title="Numbered list" on={editor.isActive('orderedList')} onClick={() => c().toggleOrderedList().run()}>
        <ListOrdered size={16} />
      </Btn>
      <Btn title="Checklist" on={editor.isActive('taskList')} onClick={() => c().toggleTaskList().run()}>
        <ListChecks size={16} />
      </Btn>
      <Btn
        title="Indent (Tab)"
        disabled={!editor.can().sinkListItem('listItem') && !editor.can().sinkListItem('taskItem')}
        onClick={() => (editor.can().sinkListItem('taskItem') ? c().sinkListItem('taskItem').run() : c().sinkListItem('listItem').run())}
      >
        <Indent size={16} />
      </Btn>
      <Btn
        title="Outdent (Shift+Tab)"
        disabled={!editor.can().liftListItem('listItem') && !editor.can().liftListItem('taskItem')}
        onClick={() => (editor.can().liftListItem('taskItem') ? c().liftListItem('taskItem').run() : c().liftListItem('listItem').run())}
      >
        <Outdent size={16} />
      </Btn>
      <span className="sep" />
      <Btn title="Quote" on={editor.isActive('blockquote')} onClick={() => c().toggleBlockquote().run()}>
        <Quote size={16} />
      </Btn>
      <Btn title="Inline code" on={editor.isActive('code')} onClick={() => c().toggleCode().run()}>
        <Code size={16} />
      </Btn>
      <Btn title="Code block" on={editor.isActive('codeBlock')} onClick={() => c().toggleCodeBlock().run()}>
        <SquareCode size={16} />
      </Btn>
      <Btn title="Divider line" onClick={() => c().setHorizontalRule().run()}>
        <Minus size={16} />
      </Btn>
      <Btn title="Link" on={editor.isActive('link')} onClick={setLink}>
        <Link2 size={16} />
      </Btn>
      <Btn title="Insert table" onClick={() => c().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>
        <TableIcon size={16} />
      </Btn>
      {inTable && (
        <>
          <Btn title="Add row below" onClick={() => c().addRowAfter().run()}>
            <span className="text-[11px] font-bold">+Row</span>
          </Btn>
          <Btn title="Add column right" onClick={() => c().addColumnAfter().run()}>
            <span className="text-[11px] font-bold">+Col</span>
          </Btn>
          <Btn title="Delete row" onClick={() => c().deleteRow().run()}>
            <span className="text-[11px] font-bold">−Row</span>
          </Btn>
          <Btn title="Delete column" onClick={() => c().deleteColumn().run()}>
            <span className="text-[11px] font-bold">−Col</span>
          </Btn>
          <Btn title="Delete table" onClick={() => c().deleteTable().run()}>
            <span className="text-[11px] font-bold">✕Tbl</span>
          </Btn>
        </>
      )}
      <span className="sep" />
      <Btn title="Clear formatting" onClick={() => c().unsetAllMarks().clearNodes().run()}>
        <RemoveFormatting size={16} />
      </Btn>
    </div>
  );
}
