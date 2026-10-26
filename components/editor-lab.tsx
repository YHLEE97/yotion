'use client';

import { useRef, useState, type ChangeEvent } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import { extensions, initialContent, moveBlock } from '@/lib/editor';
import { downloadJson } from '@/lib/transfer';
import { MAX_DOCUMENT_BYTES, parseDocument, recoveryKey, serializeDocument, storageKey, type DocumentPreview } from '@/lib/document';

export default function EditorLab() {
  const [status, setStatus] = useState('아직 저장하지 않음');
  const [composing, setComposing] = useState(false);
  const [ready, setReady] = useState(false);
  const [selection, setSelection] = useState({ from: 1, to: 1 });
  const [json, setJson] = useState<unknown>(initialContent);
  const [pending, setPending] = useState<(DocumentPreview & { source: string }) | null>(null);
  const [importError, setImportError] = useState('');
  const [loading, setLoading] = useState(false);
  const importRequest = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const editor = useEditor({
    extensions: extensions(), immediatelyRender: false, editable: ready, content: initialContent,
    editorProps: { attributes: { 'aria-label': '문서 본문', role: 'textbox', 'aria-multiline': 'true' } },
    onSelectionUpdate: ({ editor }) => setSelection({ from: editor.state.selection.from, to: editor.state.selection.to }),
    onUpdate: ({ editor }) => { setStatus('변경됨 · 로컬 저장 필요'); setJson(editor.getJSON()); },
    onCreate: ({ editor }) => {
      editor.setEditable(true);
      setJson(editor.getJSON());
      setReady(true);
    },
  });
  function save() {
    if (!editor || editor.view.composing) return;
    try {
      localStorage.setItem(storageKey, serializeDocument(editor.getJSON()));
      setStatus('이 브라우저에 저장됨');
    } catch { setStatus('저장 실패 · 저장 공간 또는 브라우저 설정 확인'); }
  }
  function restore(key = storageKey) {
    if (!editor || editor.view.composing) return;
    importRequest.current++;
    setLoading(false);
    setPending(null);
    setImportError('');
    try {
      const raw = localStorage.getItem(key);
      if (!raw) { setStatus('저장한 실험 문서가 없습니다'); return; }
      setPending({ ...parseDocument(raw), source: key === recoveryKey ? '교체 전 복구본' : '로컬 저장본' });
    } catch (error) { setImportError(error instanceof Error ? error.message : '저장본을 읽을 수 없습니다.'); }
  }
  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const request = ++importRequest.current;
    setPending(null);
    setImportError('');
    setLoading(true);
    try {
      if (file.size > MAX_DOCUMENT_BYTES) throw new Error('문서 파일은 2 MiB 이하여야 합니다.');
      const preview = parseDocument(await file.text());
      if (request === importRequest.current) setPending({ ...preview, source: file.name });
    } catch (error) {
      if (request === importRequest.current) setImportError(error instanceof Error ? error.message : '파일을 읽을 수 없습니다.');
    } finally {
      if (request === importRequest.current) setLoading(false);
    }
  }
  function applyImport() {
    if (!editor || !pending || editor.view.composing) return;
    try {
      // 현재 본문을 보관할 수 없으면 가져오기도 실행하지 않는다.
      const before = serializeDocument(editor.getJSON());
      localStorage.setItem(recoveryKey, before);
      editor.commands.setContent(pending.document.content, { errorOnInvalidContent: true });
      setJson(editor.getJSON());
      setPending(null);
      setImportError('');
      setStatus('문서 불러옴 · 로컬 저장 필요');
    } catch { setImportError('문서를 교체하지 못했습니다. 저장 공간과 브라우저 설정을 확인하세요.'); }
  }
  function cancelImport() {
    importRequest.current++;
    setPending(null);
    setLoading(false);
    setImportError('');
  }
  return <section className="page">
    <p className="eyebrow">EDITOR PLAYGROUND</p><h1>편집 엔진 실험실</h1>
    <p className="intro">작은 문서부터 시작해, 기본 편집 동작과 데이터 보존을 확인합니다.</p>
    <div className="notice">실험 문서 한 개를 이 브라우저에 수동 저장합니다. JSON 파일과 저장본은 미리보기 후 적용하며, 교체 직전 본문 한 개를 복구본으로 보관합니다. 서버 저장·자동 저장·계정 기능은 후속 개발 범위입니다.</div>
    <input ref={fileInput} type="file" accept=".json,application/json" aria-label="문서 JSON 파일" hidden onChange={importFile} />
    {importError && <div className="import-error" role="alert">{importError} 현재 본문은 유지됩니다.</div>}
    {loading && <div className="import-preview" role="status">파일을 확인하고 있습니다. <button onClick={cancelImport}>취소</button></div>}
    {pending && <section className="import-preview" aria-label="문서 가져오기 미리보기">
      <h2>{pending.source}</h2><p>블록 {pending.blocks}개 · 지원 형식 확인 완료</p>
      <pre>{pending.text || '(텍스트 없는 문서)'}</pre>
      <p>적용하면 현재 본문을 교체합니다. 교체 전 본문은 ‘교체 전 복구본’에서 다시 열 수 있습니다. 기존 복구본은 최신 한 개로 교체됩니다.</p>
      <div className="actions"><button disabled={!ready || composing} className="primary" onClick={applyImport}>현재 문서에 적용</button><button onClick={cancelImport}>취소</button></div>
    </section>}
    <div className="panel-heading"><h2>나의 첫 번째 문서</h2><span className="save-status" role="status">{status}</span></div>
    <div className="toolbar" aria-label="편집 도구">
      <button disabled={!editor || composing} onClick={() => editor?.chain().focus().setParagraph().run()}>본문</button>
      <button disabled={!editor || composing} onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}>제목 2</button>
      <button disabled={!editor || composing} onClick={() => editor?.chain().focus().toggleBold().run()}><b>굵게</b></button>
      <button disabled={!editor || composing} onClick={() => editor?.chain().focus().toggleBulletList().run()}>글머리 목록</button>
      <button disabled={!editor || composing} onClick={() => editor?.chain().focus().toggleOrderedList().run()}>번호 목록</button>
      <button disabled={!editor || composing} onClick={() => editor?.chain().focus().toggleBlockquote().run()}>인용</button>
      <button disabled={!editor || composing} onClick={() => editor?.chain().focus().toggleCodeBlock().run()}>코드</button>
      <button disabled={!editor || composing} onClick={() => editor && moveBlock(editor, -1)}>블록 위로</button>
      <button disabled={!editor || composing} onClick={() => editor && moveBlock(editor, 1)}>블록 아래로</button>
      <button disabled={!editor || composing} onClick={() => editor?.chain().focus().undo().run()}>실행 취소</button>
      <button disabled={!editor || composing} onClick={() => editor?.chain().focus().redo().run()}>다시 실행</button>
    </div>
    <div className="document" aria-busy={!ready} data-selection-from={selection.from} onCompositionStart={() => setComposing(true)} onCompositionEnd={() => setComposing(false)}><EditorContent editor={editor} /></div>
    <div className="document-footer"><span className={composing ? 'composition active-composition' : 'composition'}>{composing ? '한글 조합 중' : '입력 대기'}</span><div className="actions">
      <button disabled={!ready || composing} onClick={() => fileInput.current?.click()}>JSON 가져오기</button>
      <button disabled={!ready || composing} onClick={() => restore()}>저장본 불러오기</button>
      <button disabled={!ready || composing} onClick={() => restore(recoveryKey)}>교체 전 복구본</button>
      <button disabled={!editor || composing} onClick={() => downloadJson({ schemaVersion: 1, content: editor!.getJSON() }, 'yotion-spike.json')}>JSON 다운로드</button>
      <button className="primary" disabled={!editor || composing} onClick={save}>로컬 저장</button>
    </div></div>
    <details className="inspector"><summary>문서 구조 · 블록 ID 확인</summary><p>선택 위치: {selection.from} → {selection.to}</p><pre>{JSON.stringify(json, null, 2)}</pre></details>
    <div className="checklist"><h2>이번 실험에서 확인할 것</h2><p>한글 조합 → Enter · 목록 중첩 → Tab / Shift+Tab · 블록 이동 → ID 유지 · 실행 취소 / 다시 실행 · JSON 다운로드 → 가져오기 → 복구본 확인</p><small>JSON은 Yotion 실험 형식 버전 1, 최대 2 MiB를 지원합니다. 블록 이동은 커서가 놓인 최상위 블록 한 개에 적용됩니다.</small></div>
  </section>;
}
