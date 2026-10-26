import { Editor } from '@tiptap/core';
import { afterEach, describe, expect, it } from 'vitest';
import { extensions, initialContent, moveBlock } from '../lib/editor';
import { parseDocument, serializeDocument } from '../lib/document';

let editor: Editor;
afterEach(() => editor?.destroy());
async function create() {
  // Tiptap의 onCreate(초기 ID 부여 포함)는 다음 이벤트 루프에서 실행된다.
  await new Promise<void>(resolve => {
    editor = new Editor({ extensions: extensions(), content: initialContent, onCreate: () => resolve() });
  });
  return editor;
}
function ids() {
  const result: string[] = [];
  editor.state.doc.descendants(node => { if (node.isBlock) result.push(node.attrs.id); });
  return result;
}

describe('편집 실험', () => {
  it('모든 블록에 고유 ID를 부여하고 JSON 재열기 시 유지한다', async () => {
    await create();
    const before = ids();
    expect(before.every(Boolean)).toBe(true);
    expect(new Set(before).size).toBe(before.length);
    const json = editor.getJSON();
    const restored = parseDocument(serializeDocument(json));
    expect(restored.document.content).toEqual(json);
    editor.commands.setContent(restored.document.content);
    expect(ids()).toEqual(before);
  });
  it('블록 이동과 undo/redo가 내용·ID를 보존한다', async () => {
    await create();
    const before = editor.getJSON();
    editor.commands.setTextSelection(editor.state.doc.firstChild!.nodeSize + 1);
    expect(moveBlock(editor, -1)).toBe(true);
    const moved = editor.getJSON();
    expect(moved.content![0]).toEqual(before.content![1]);
    expect(moved.content![1]).toEqual(before.content![0]);
    editor.commands.undo();
    expect(editor.getJSON()).toEqual(before);
    editor.commands.redo();
    expect(editor.getJSON()).toEqual(moved);
    expect(moveBlock(editor, 1)).toBe(true);
    expect(editor.getJSON()).toEqual(before);
  });
  it('첫 블록 위로 이동은 문서를 변경하지 않는다', async () => {
    await create();
    editor.commands.setTextSelection(1);
    const before = editor.getJSON();
    expect(moveBlock(editor, -1)).toBe(false);
    expect(editor.getJSON()).toEqual(before);
  });
  it('목록 중첩 후 해제해도 본문과 ID를 유지한다', async () => {
    await create();
    let secondItem = 0;
    let count = 0;
    editor.state.doc.descendants((node, pos) => { if (node.type.name === 'listItem' && ++count === 2) secondItem = pos; });
    editor.commands.setTextSelection(secondItem + 2);
    const beforeText = editor.getText();
    const beforeIds = ids();
    expect(editor.commands.sinkListItem('listItem')).toBe(true);
    expect(editor.commands.liftListItem('listItem')).toBe(true);
    expect(editor.getText()).toBe(beforeText);
    for (const id of beforeIds) expect(ids()).toContain(id);
  });
  it('커서와 다른 위치의 이미지 블록도 지정한 위치로 이동하고 undo한다', async () => {
    await create();
    editor.commands.setContent({ type: 'doc', content: [
      { type: 'paragraph', attrs: { id: 'first' }, content: [{ type: 'text', text: '커서 위치' }] },
      { type: 'image', attrs: { id: 'image', src: 'https://example.com/image.png' } },
      { type: 'paragraph', attrs: { id: 'last' }, content: [{ type: 'text', text: '마지막' }] },
    ] });
    editor.commands.setTextSelection(1);
    const before = editor.getJSON();
    const imagePos = editor.state.doc.firstChild!.nodeSize;
    expect(moveBlock(editor, 1, imagePos)).toBe(true);
    expect(editor.getJSON().content!.map(node => node.attrs!.id)).toEqual(['first', 'last', 'image', expect.any(String)]);
    // StarterKit은 문서 마지막의 이미지 뒤에 빈 문단을 추가한다.
    editor.commands.undo();
    expect(editor.getJSON()).toEqual(before);
  });
  it('최상위 블록 시작점이 아닌 이동 대상은 문서를 바꾸지 않는다', async () => {
    await create();
    const before = editor.getJSON();
    expect(moveBlock(editor, 1, 2)).toBe(false);
    expect(editor.getJSON()).toEqual(before);
  });
});
