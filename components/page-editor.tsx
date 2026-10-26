'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import { Placeholder } from '@tiptap/extensions';
import { TextSelection } from '@tiptap/pm/state';
import { closeHistory } from '@tiptap/pm/history';
import { Bold, Italic, Underline, Strikethrough, Code, Link, Plus, GripVertical, ArrowUp, ArrowDown, Copy, Trash2, Type, Heading1, Heading2, Heading3, List, ListOrdered, ListTodo, ChevronRight, Quote, Minus, Image, Table2, Check } from 'lucide-react';
import { extensions, moveBlock } from '@/lib/editor';
import { cloneContent, type Page } from '@/lib/workspace';
import { isSupportedLink } from '@/lib/link';
import type { JSONContent } from '@tiptap/core';
import ContextMenu, { type ContextAnchor } from './context-menu';

type Command = { id: string; label: string; hint: string; icon: typeof Type; run: (editor: Editor) => void };
type Slash = { from: number; to: number; query: string; left: number; top: number };
const commands: Command[] = [
  { id: 'text', label: '텍스트', hint: '일반 텍스트로 쓰기를 시작하세요.', icon: Type, run: e => { e.chain().focus().setParagraph().run(); } },
  ...([1, 2, 3] as const).map((level, i) => ({ id: `heading${level}`, label: `제목 ${level}`, hint: ['큰 섹션 제목', '중간 크기의 섹션 제목', '작은 섹션 제목'][i], icon: [Heading1, Heading2, Heading3][i], run: (e: Editor) => { e.chain().focus().setHeading({ level }).run(); } })),
  { id: 'todo checklist', label: '할 일 목록', hint: '체크박스로 할 일을 관리하세요.', icon: ListTodo, run: e => { e.chain().focus().toggleTaskList().run(); } },
  { id: 'bullet list', label: '글머리 기호 목록', hint: '간단한 목록을 만드세요.', icon: List, run: e => { e.chain().focus().toggleBulletList().run(); } },
  { id: 'ordered numbered', label: '번호 매기기 목록', hint: '순서대로 목록을 정리하세요.', icon: ListOrdered, run: e => { e.chain().focus().toggleOrderedList().run(); } },
  { id: 'toggle details', label: '토글 목록', hint: '내용을 접거나 펼쳐보세요.', icon: ChevronRight, run: e => { e.chain().focus().insertContent({ type: 'details', attrs: { open: true }, content: [{ type: 'detailsSummary', content: [{ type: 'text', text: '토글 제목' }] }, { type: 'detailsContent', content: [{ type: 'paragraph' }] }] }).run(); } },
  { id: 'quote', label: '인용', hint: '인용문을 강조하세요.', icon: Quote, run: e => { e.chain().focus().toggleBlockquote().run(); } },
  { id: 'divider', label: '구분선', hint: '블록을 시각적으로 나누세요.', icon: Minus, run: e => { e.chain().focus().setHorizontalRule().run(); } },
  { id: 'code', label: '코드', hint: '코드 조각을 기록하세요.', icon: Code, run: e => { e.chain().focus().toggleCodeBlock().run(); } },
  { id: 'table', label: '표', hint: '간단한 표를 추가하세요.', icon: Table2, run: e => { e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(); } },
];
function filteredCommands(query: string) {
  const q = query.toLowerCase().replace(/\s/g, '');
  return commands.filter(command => `${command.id}${command.label}`.replace(/\s/g, '').toLowerCase().includes(q));
}
function imageData(file: File): Promise<string> {
  if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif'].includes(file.type)) return Promise.reject(new Error('PNG, JPG, WebP, GIF, AVIF 이미지를 선택하세요.'));
  if (file.size > 1024 * 1024) return Promise.reject(new Error('이미지는 1 MiB 이하로 추가할 수 있습니다.'));
  return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('이미지를 읽지 못했습니다.')); reader.readAsDataURL(file); });
}

export default function PageEditor({ page, onChange, onEditor, onComposing }: { page: Page; onChange: (content: JSONContent) => void; onEditor: (editor: Editor | null) => void; onComposing: (value: boolean) => void }) {
  const changeRef = useRef(onChange); changeRef.current = onChange;
  const readyRef = useRef(onEditor); readyRef.current = onEditor;
  const compositionRef = useRef(onComposing); compositionRef.current = onComposing;
  const [slash, setSlash] = useState<Slash | null>(null);
  const slashRef = useRef<Slash | null>(null);
  const dismissed = useRef('');
  const [selected, setSelected] = useState(0); const selectedRef = useRef(0);
  const [active, setActive] = useState<{ pos: number; top: number } | null>(null);
  const [blockMenu, setBlockMenu] = useState(false);
  const [context, setContext] = useState<{ blockId: string; anchor: ContextAnchor } | null>(null);
  const [bubble, setBubble] = useState<{ left: number; top: number } | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkValue, setLinkValue] = useState('');
  const [error, setError] = useState('');
  const wrapper = useRef<HTMLDivElement>(null);
  const imageInput = useRef<HTMLInputElement>(null);
  const composing = useRef(false);
  const runRef = useRef<(index: number) => void>(() => {});
  const dropRef = useRef<(event: DragEvent) => boolean>(() => false);
  const uploadRef = useRef<(file: File) => void>(() => {});
  const contextRef = useRef<(event: React.MouseEvent<HTMLElement> | React.KeyboardEvent<HTMLElement>) => void>(() => {});
  const configured = useMemo(() => [...extensions(), Placeholder.configure({ placeholder: '텍스트를 입력하거나 "/"를 눌러 명령어를 사용하세요', includeChildren: true })], []);

  function closeSlash() { setSlash(null); slashRef.current = null; }
  function refresh(editor: Editor) {
    if (editor.isDestroyed || editor.view.composing || composing.current) return;
    const { $from, empty, from, to } = editor.state.selection;
    const value = $from.parent.isTextblock ? $from.parent.textBetween(0, $from.parentOffset) : '';
    const match = empty && $from.parent.type.name === 'paragraph' ? /^\/([^/]*)$/.exec(value) : null;
    if (match && dismissed.current !== `${from}:${value}`) {
      const coords = editor.view.coordsAtPos(from);
      const next = { from: $from.start(), to: from, query: match[1], left: Math.max(12, Math.min(coords.left, window.innerWidth - 330)), top: Math.max(70, Math.min(coords.bottom + 7, window.innerHeight - 410)) };
      if (slashRef.current?.query !== next.query) { selectedRef.current = 0; setSelected(0); }
      slashRef.current = next; setSlash(next);
    } else closeSlash();
    if (!empty && $from.parent.isTextblock) {
      const start = editor.view.coordsAtPos(from); const end = editor.view.coordsAtPos(to);
      setBubble({ left: Math.max(10, Math.min((start.left + end.left) / 2 - 125, window.innerWidth - 320)), top: Math.max(50, start.top - 48) });
    } else { setBubble(null); setLinkOpen(false); }
  }
  const editor = useEditor({
    extensions: configured, content: page.content, immediatelyRender: false,
    editorProps: {
      attributes: { role: 'textbox', 'aria-label': '문서 본문', 'aria-multiline': 'true', spellcheck: 'false' },
      handleKeyDown: (view, event) => {
        if (event.isComposing || event.keyCode === 229 || view.composing || composing.current) return false;
        if (event.altKey && event.shiftKey && ['ArrowUp', 'ArrowDown'].includes(event.key)) { if (editor) moveBlock(editor, event.key === 'ArrowUp' ? -1 : 1); return true; }
        if (!slashRef.current) return false;
        const count = filteredCommands(slashRef.current.query).length + ('image 이미지'.includes(slashRef.current.query.toLowerCase()) ? 1 : 0);
        if (event.key === 'Escape') { dismissed.current = `${view.state.selection.from}:${view.state.selection.$from.parent.textBetween(0, view.state.selection.$from.parentOffset)}`; closeSlash(); return true; }
        if (['ArrowUp', 'ArrowDown'].includes(event.key)) { selectedRef.current = (selectedRef.current + (event.key === 'ArrowDown' ? 1 : -1) + Math.max(count, 1)) % Math.max(count, 1); setSelected(selectedRef.current); return true; }
        if (event.key === 'Enter') { runRef.current(selectedRef.current); return true; }
        return false;
      },
      handleDOMEvents: {
        drop: (_view, event) => dropRef.current(event),
        dragover: (_view, event) => { if (event.dataTransfer?.types.includes('application/x-yotion-block')) { event.preventDefault(); return true; } return false; },
      },
      handlePaste: (_view, event) => {
        const file = Array.from(event.clipboardData?.files ?? []).find(file => file.type.startsWith('image/'));
        if (!file) return false;
        event.preventDefault(); uploadRef.current(file); return true;
      },
    },
    onCreate: ({ editor }) => { readyRef.current(editor); },
    onUpdate: ({ editor }) => { setContext(null); setBlockMenu(false); if (!editor.view.composing && !composing.current) { changeRef.current(editor.getJSON()); refresh(editor); } },
    onSelectionUpdate: ({ editor }) => { refresh(editor); },
    onDestroy: () => readyRef.current(null),
  });
  useEffect(() => () => { readyRef.current(null); compositionRef.current(false); }, []);
  useEffect(() => { document.getElementById(`slash-command-${selected}`)?.scrollIntoView({ block: 'nearest' }); }, [selected]);
  useEffect(() => {
    function scroll(event: Event) { if (event.target instanceof HTMLElement && (event.target.closest('.n-slash') || event.target.closest('.n-popover'))) return; closeSlash(); setBubble(null); setBlockMenu(false); }
    window.addEventListener('resize', scroll); window.addEventListener('scroll', scroll, true);
    return () => { window.removeEventListener('resize', scroll); window.removeEventListener('scroll', scroll, true); };
  }, []);

  uploadRef.current = async file => {
    try { const src = await imageData(file); if (editor && !editor.isDestroyed) editor.chain().focus().setImage({ src, alt: file.name }).run(); setError(''); }
    catch (error) { setError(error instanceof Error ? error.message : '이미지를 추가하지 못했습니다.'); }
  };
  runRef.current = index => {
    if (!editor || !slashRef.current || editor.view.composing) return;
    const range = slashRef.current; const options = filteredCommands(range.query);
    if (index >= options.length && !'image 이미지'.includes(range.query.toLowerCase())) return;
    editor.chain().focus().deleteRange({ from: range.from, to: range.to }).run();
    closeSlash();
    if (index < options.length) options[index].run(editor); else imageInput.current?.click();
  };
  dropRef.current = event => {
    const value = event.dataTransfer?.getData('application/x-yotion-block');
    if (!value || !editor) return false;
    event.preventDefault();
    try {
      const source = JSON.parse(value);
      if (source.pageId !== page.id || typeof source.id !== 'string') return true;
      let from = -1;
      editor.state.doc.forEach((node, pos) => { if (node.attrs.id === source.id) from = pos; });
      if (from < 0) return true;
      const block = editor.state.doc.nodeAt(from)!;
      const hit = editor.view.posAtCoords({ left: event.clientX, top: event.clientY });
      let to = editor.state.doc.content.size;
      if (hit) {
        const resolved = editor.state.doc.resolve(hit.pos);
        const index = resolved.index(0);
        to = 0; for (let i = 0; i < index; i++) to += editor.state.doc.child(i).nodeSize;
        const target = editor.state.doc.nodeAt(to);
        const dom = editor.view.nodeDOM(to);
        if (target && dom instanceof HTMLElement && event.clientY > dom.getBoundingClientRect().top + dom.getBoundingClientRect().height / 2) to += target.nodeSize;
      }
      if (to > from) to -= block.nodeSize;
      if (to === from) return true;
      const tr = closeHistory(editor.state.tr).delete(from, from + block.nodeSize).insert(to, block);
      tr.setSelection(TextSelection.near(tr.doc.resolve(Math.min(to + 1, tr.doc.content.size))));
      editor.view.dispatch(tr); editor.view.dispatch(closeHistory(editor.state.tr)); setActive(null); editor.view.focus();
    } catch { /* 다른 앱의 드롭 데이터는 처리하지 않는다. */ }
    return true;
  };
  function trackBlock(clientY: number) {
    if (!editor || blockMenu || context || !wrapper.current) return;
    const top = wrapper.current.getBoundingClientRect().top;
    editor.state.doc.forEach((_node, pos) => {
      const element = editor.view.nodeDOM(pos);
      if (element instanceof HTMLElement) { const rect = element.getBoundingClientRect(); if (clientY >= rect.top - 5 && clientY <= rect.bottom + 5) setActive({ pos, top: rect.top - top }); }
    });
  }
  function blockAction(action: 'up' | 'down' | 'copy' | 'delete', blockId?: string) {
    if (!editor || editor.view.composing || composing.current) return;
    let pos = active?.pos ?? -1;
    if (blockId) { pos = -1; editor.state.doc.forEach((node, at) => { if (node.attrs.id === blockId) pos = at; }); }
    if (pos < 0) return;
    const node = editor.state.doc.nodeAt(pos); if (!node) return;
    editor.view.dispatch(closeHistory(editor.state.tr));
    if (action === 'up' || action === 'down') moveBlock(editor, action === 'up' ? -1 : 1, pos);
    if (action === 'copy') editor.chain().focus().insertContentAt(pos + node.nodeSize, cloneContent(node.toJSON())).run();
    if (action === 'delete') editor.chain().focus().deleteRange({ from: pos, to: pos + node.nodeSize }).run();
    editor.view.dispatch(closeHistory(editor.state.tr));
    setBlockMenu(false); setActive(null); setContext(null);
  }
  contextRef.current = event => {
    if (!editor || editor.view.composing || composing.current || !editor.view.dom.contains(event.target as Node)) return;
    let blockId: string | null = null;
    let rect: DOMRect | null = null;
    const keyboard = 'key' in event;
    editor.state.doc.forEach((node, pos) => {
      const dom = editor.view.nodeDOM(pos);
      const selected = keyboard ? editor.state.selection.$from.index(0) === editor.state.doc.resolve(pos).index(0) : dom?.contains(event.target as Node);
      if (selected && dom instanceof HTMLElement && typeof node.attrs.id === 'string') { blockId = node.attrs.id; rect = dom.getBoundingClientRect(); }
    });
    if (!blockId || !rect) return;
    event.preventDefault(); event.stopPropagation();
    closeSlash(); setBubble(null); setBlockMenu(false);
    const bounds = rect as DOMRect;
    setContext({ blockId, anchor: { x: keyboard ? bounds.left + 12 : event.clientX, y: keyboard ? bounds.top + Math.min(26, bounds.height) : event.clientY, trigger: editor.view.dom } });
  };
  let contextIndex = -1;
  if (context && editor) editor.state.doc.forEach((node, _pos, index) => { if (node.attrs.id === context.blockId) contextIndex = index; });
  const options = filteredCommands(slash?.query ?? '');
  const showImage = 'image 이미지'.includes(slash?.query.toLowerCase() ?? '');
  return <div className="n-editor-wrap" ref={wrapper} onMouseMove={event => { if (!(event.target instanceof Element && event.target.closest('.n-block-controls'))) trackBlock(event.clientY); }} onMouseLeave={() => { if (!blockMenu) setActive(null); }}
    onContextMenu={event => contextRef.current(event)}
    onKeyDown={event => { if (!event.nativeEvent.isComposing && event.keyCode !== 229 && (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10'))) contextRef.current(event); }}
    onCompositionStart={() => { composing.current = true; compositionRef.current(true); closeSlash(); setContext(null); }}
    onCompositionEnd={() => { composing.current = false; setTimeout(() => { if (editor && !editor.isDestroyed) { changeRef.current(editor.getJSON()); compositionRef.current(false); refresh(editor); } }, 0); }}>
    <EditorContent editor={editor} />
    {context && contextIndex >= 0 && <ContextMenu anchor={context.anchor} label="블록 우클릭 메뉴" onClose={() => setContext(null)} actions={[
      { id: 'up', label: '위로 이동', icon: <ArrowUp size={15} />, disabled: contextIndex === 0, shortcut: '⌥ ⇧ ↑', run: () => blockAction('up', context.blockId) },
      { id: 'down', label: '아래로 이동', icon: <ArrowDown size={15} />, disabled: contextIndex === (editor?.state.doc.childCount ?? 0) - 1, shortcut: '⌥ ⇧ ↓', run: () => blockAction('down', context.blockId) },
      { id: 'copy', label: '복제', icon: <Copy size={15} />, run: () => blockAction('copy', context.blockId) },
      { id: 'delete', label: '삭제', icon: <Trash2 size={15} />, separator: true, danger: true, run: () => blockAction('delete', context.blockId) },
    ]} />}
    <input hidden ref={imageInput} aria-label="이미지 파일" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) uploadRef.current(file); }} />
    {error && <p role="alert" className="n-inline-error">{error}<button onClick={() => setError('')}>닫기</button></p>}
    {active && !composing.current && <div className="n-block-controls" style={{ top: active.top }}>
      <button aria-label="아래에 블록 추가" title="아래에 블록 추가" onMouseDown={event => event.preventDefault()} onClick={() => { if (!editor) return; const node = editor.state.doc.nodeAt(active.pos); if (!node) return; editor.chain().focus().insertContentAt(active.pos + node.nodeSize, { type: 'paragraph', content: [{ type: 'text', text: '/' }] }).setTextSelection(active.pos + node.nodeSize + 2).run(); refresh(editor); }}><Plus size={17} /></button>
      <button aria-label="블록 메뉴" title="드래그하여 이동 · 클릭하여 메뉴" draggable onDragStart={event => { const node = editor?.state.doc.nodeAt(active.pos); if (node) { event.dataTransfer.setData('application/x-yotion-block', JSON.stringify({ pageId: page.id, id: node.attrs.id })); event.dataTransfer.effectAllowed = 'move'; } }} onClick={() => setBlockMenu(!blockMenu)}><GripVertical size={17} /></button>
      {blockMenu && <><button className="n-dismiss" aria-label="블록 메뉴 닫기" onClick={() => setBlockMenu(false)} /><div className="n-popover n-block-menu">
        <button onClick={() => blockAction('up')}><ArrowUp size={15} />위로 이동 <kbd>⌥ ⇧ ↑</kbd></button>
        <button onClick={() => blockAction('down')}><ArrowDown size={15} />아래로 이동 <kbd>⌥ ⇧ ↓</kbd></button>
        <button onClick={() => blockAction('copy')}><Copy size={15} />복제</button><hr /><button className="n-danger" onClick={() => blockAction('delete')}><Trash2 size={15} />삭제</button>
      </div></>}
    </div>}
    {slash && <div className="n-popover n-slash" role="listbox" aria-label="블록 명령" style={{ left: slash.left, top: slash.top }}>
      <p>기본 블록 <span>↑↓ 선택 · Enter 삽입</span></p>
      {options.map((command, index) => <button key={command.id} id={`slash-command-${index}`} role="option" aria-selected={selected === index} className={selected === index ? 'is-selected' : ''} onMouseDown={event => event.preventDefault()} onMouseEnter={() => { setSelected(index); selectedRef.current = index; }} onClick={() => runRef.current(index)}><span className="n-command-icon"><command.icon size={23} strokeWidth={1.5} /></span><span><strong>{command.label}</strong><small>{command.hint}</small></span></button>)}
      {showImage && <button id={`slash-command-${options.length}`} role="option" aria-selected={selected === options.length} className={selected === options.length ? 'is-selected' : ''} onMouseDown={event => event.preventDefault()} onClick={() => runRef.current(options.length)}><span className="n-command-icon"><Image size={23} strokeWidth={1.5} /></span><span><strong>이미지</strong><small>기기에서 이미지를 업로드하세요.</small></span></button>}
      {!options.length && !showImage && <div className="n-no-results">일치하는 블록이 없습니다.</div>}
    </div>}
    {bubble && editor && !slash && <div className="n-bubble" style={bubble} onMouseDown={event => event.preventDefault()}>
      {([{ icon: Bold, label: '굵게', mark: 'bold', run: () => editor.chain().focus().toggleBold().run() }, { icon: Italic, label: '기울임', mark: 'italic', run: () => editor.chain().focus().toggleItalic().run() }, { icon: Underline, label: '밑줄', mark: 'underline', run: () => editor.chain().focus().toggleUnderline().run() }, { icon: Strikethrough, label: '취소선', mark: 'strike', run: () => editor.chain().focus().toggleStrike().run() }, { icon: Code, label: '인라인 코드', mark: 'code', run: () => editor.chain().focus().toggleCode().run() }]).map(tool => <button key={tool.mark} aria-label={tool.label} aria-pressed={editor.isActive(tool.mark)} onClick={tool.run}><tool.icon size={15} /></button>)}
      <button aria-label="링크" onClick={() => { setLinkValue(editor.getAttributes('link').href ?? ''); setLinkOpen(!linkOpen); }}><Link size={15} /></button>
      {linkOpen && <form className="n-link-input" onMouseDown={event => event.stopPropagation()} onSubmit={event => { event.preventDefault(); if (!linkValue) editor.chain().focus().unsetLink().run(); else if (isSupportedLink(linkValue)) editor.chain().focus().setLink({ href: linkValue }).run(); else { setError('http(s) 주소나 /로 시작하는 경로를 입력하세요.'); return; } setLinkOpen(false); }}><input autoFocus aria-label="링크 주소" placeholder="https://" value={linkValue} onChange={event => setLinkValue(event.target.value)} /><button aria-label="링크 적용" type="submit"><Check size={16} /></button></form>}
    </div>}
    {editor?.isActive('table') && <div className="n-table-tools"><button onClick={() => editor.chain().focus().addRowAfter().run()}>+ 행</button><button onClick={() => editor.chain().focus().addColumnAfter().run()}>+ 열</button><button onClick={() => editor.chain().focus().deleteRow().run()}>행 삭제</button><button onClick={() => editor.chain().focus().deleteColumn().run()}>열 삭제</button></div>}
  </div>;
}
