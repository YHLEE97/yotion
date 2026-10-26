import StarterKit from '@tiptap/starter-kit';
import UniqueID from '@tiptap/extension-unique-id';
import type { Editor } from '@tiptap/react';
import { Extension } from '@tiptap/core';
import { TextSelection } from '@tiptap/pm/state';
import { closeHistory } from '@tiptap/pm/history';
import { isSupportedLink } from './link';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { Details, DetailsContent, DetailsSummary } from '@tiptap/extension-details';
import Image from '@tiptap/extension-image';
import { TableKit } from '@tiptap/extension-table';

export const blockTypes = ['paragraph', 'heading', 'blockquote', 'bulletList', 'orderedList', 'listItem', 'codeBlock', 'horizontalRule', 'taskList', 'taskItem', 'details', 'detailsSummary', 'detailsContent', 'image', 'table', 'tableRow', 'tableCell', 'tableHeader'];

// 토글 상태만 바꿀 때도 기존 블록 ID를 보존한다.
const PersistentDetails = Details.extend({
  addNodeView() {
    return ({ node, editor, getPos }) => {
      const dom = document.createElement('div'); dom.dataset.type = 'details';
      const button = document.createElement('button'); button.type = 'button'; button.contentEditable = 'false'; button.textContent = '▶';
      const contentDOM = document.createElement('div'); dom.append(button, contentDOM);
      function render(current: typeof node) {
        dom.classList.toggle('is-open', !!current.attrs.open);
        if (current.attrs.id) dom.dataset.id = current.attrs.id;
        button.setAttribute('aria-label', current.attrs.open ? '토글 접기' : '토글 펼치기');
        button.setAttribute('aria-expanded', String(!!current.attrs.open));
      }
      render(node);
      button.addEventListener('mousedown', event => event.preventDefault());
      button.addEventListener('click', () => {
        const pos = getPos(); if (typeof pos !== 'number') return;
        const current = editor.state.doc.nodeAt(pos); if (!current || current.type.name !== 'details') return;
        editor.view.dispatch(editor.state.tr.setNodeMarkup(pos, undefined, { ...current.attrs, open: !current.attrs.open }));
      });
      return { dom, contentDOM, update(updated) { if (updated.type !== node.type) return false; render(updated); return true; }, stopEvent: event => button.contains(event.target as Node), ignoreMutation: mutation => mutation.type !== 'selection' && (mutation.target === dom || button.contains(mutation.target)) };
    };
  },
}).configure({ persist: true });
const PersistentDetailsContent = DetailsContent.extend({
  addNodeView() { return () => { const dom = document.createElement('div'); dom.dataset.type = 'detailsContent'; return { dom, contentDOM: dom }; }; },
});

export function extensions() {
  const ListIndent = Extension.create({
    name: 'listIndent',
    addKeyboardShortcuts() {
      return {
        Tab: () => !this.editor.view.composing && this.editor.commands.sinkListItem('listItem'),
        'Shift-Tab': () => !this.editor.view.composing && this.editor.commands.liftListItem('listItem'),
      };
    },
  });
  return [StarterKit.configure({ link: { openOnClick: false, isAllowedUri: isSupportedLink } }),
    TaskList, TaskItem.configure({ nested: true }),
    PersistentDetails, DetailsSummary, PersistentDetailsContent,
    Image.configure({ allowBase64: true }), TableKit.configure({ table: { resizable: false } }),
    UniqueID.configure({ types: blockTypes }), ListIndent];
}

export const initialContent = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: '생각을 문서로 만드는 공간' }] },
    { type: 'paragraph', content: [{ type: 'text', text: '이곳에서 한글을 입력하고, 목록을 중첩하고, 블록을 옮겨보세요.' }] },
    { type: 'bulletList', content: [
      { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Enter로 다음 항목 만들기' }] }] },
      { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Tab과 Shift+Tab으로 들여쓰기 조절하기' }] }] },
    ] },
    { type: 'paragraph' },
  ],
};

// 최상위 블록 하나를 이동한다. 위치 매핑으로 ID와 선택을 보존한다.
export function moveBlock(editor: Editor, direction: -1 | 1, blockPos?: number): boolean {
  const { state } = editor;
  if (editor.view.composing || (blockPos === undefined && state.selection.$from.depth < 1)) return false;
  if (blockPos !== undefined && (!Number.isInteger(blockPos) || blockPos < 0 || blockPos >= state.doc.content.size)) return false;
  const index = blockPos === undefined ? state.selection.$from.index(0) : state.doc.resolve(blockPos).index(0);
  const targetIndex = index + direction;
  if (targetIndex < 0 || targetIndex >= state.doc.childCount) return false;
  let from = 0;
  for (let i = 0; i < index; i++) from += state.doc.child(i).nodeSize;
  if (blockPos !== undefined && blockPos !== from) return false;
  const block = state.doc.child(index);
  const insertAt = direction === -1
    ? from - state.doc.child(targetIndex).nodeSize
    : from + state.doc.child(targetIndex).nodeSize;
  const offset = blockPos === undefined ? state.selection.from - from : 1;
  const tr = closeHistory(state.tr).delete(from, from + block.nodeSize).insert(insertAt, block);
  tr.setSelection(TextSelection.near(tr.doc.resolve(insertAt + Math.min(offset, block.nodeSize - 1))));
  editor.view.dispatch(tr.scrollIntoView());
  editor.view.dispatch(closeHistory(editor.state.tr));
  editor.view.focus();
  return true;
}
