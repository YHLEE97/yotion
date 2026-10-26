'use client';

import { useState } from 'react';
import { captureTransfer, downloadJson, type TransferSample } from '@/lib/transfer';

export default function TransferLab() {
  const [samples, setSamples] = useState<TransferSample[]>([]);
  function capture(data: DataTransfer, kind: TransferSample['kind']) {
    setSamples(previous => [captureTransfer(data, kind), ...previous].slice(0, 20));
  }
  return <section className="page">
    <p className="eyebrow">INPUT OBSERVATORY</p><h1>드롭 · 클립보드</h1>
    <p className="intro">브라우저가 전달하는 실제 입력을 확인합니다. 문서, 링크, 파일을 가져와보세요.</p>
    <div className="notice">이 화면은 형식 관찰용입니다. HTML은 텍스트로만 표시하며 파일 내용은 읽지 않습니다. 기록은 현재 탭 메모리에만 보관됩니다.</div>
    <div className="dropzone" tabIndex={0} role="region" aria-label="드롭 및 붙여넣기 관찰 영역"
      onDragOver={event => event.preventDefault()}
      onDrop={event => { event.preventDefault(); capture(event.dataTransfer, 'drop'); }}
      onPaste={event => { event.preventDefault(); capture(event.clipboardData, 'paste'); }}>
      <span className="drop-symbol">↙</span><h2>여기에 드롭하거나 붙여넣으세요</h2>
      <p>영역을 클릭한 뒤 Ctrl+V / ⌘V · 파일, 텍스트, HTML, URL</p>
    </div>
    <div className="panel-heading"><h2>관찰 기록 <span className="count">{samples.length} / 20</span></h2><div className="actions">
      <button disabled={!samples.length} onClick={() => downloadJson({ schemaVersion: 1, samples }, 'yotion-input-observations.json')}>JSON 다운로드</button>
      <button disabled={!samples.length} onClick={() => setSamples([])}>기록 비우기</button>
    </div></div>
    <p className="muted">문자열은 형식당 32,768자까지 기록하며 초과 시 잘림을 표시합니다. 내려받기 전에 민감한 내용이 있는지 확인하세요.</p>
    <div aria-live="polite">{!samples.length && <div className="empty">아직 관찰한 입력이 없습니다.</div>}
      {samples.map(sample => <details key={sample.id} open className="sample"><summary>{sample.kind === 'paste' ? '붙여넣기' : '드롭'} · {sample.types.join(', ') || '형식 없음'} · {new Date(sample.capturedAt).toLocaleTimeString('ko-KR')}</summary><pre>{JSON.stringify(sample, null, 2)}</pre></details>)}
    </div>
  </section>;
}
