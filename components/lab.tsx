'use client';

import { useState } from 'react';
import EditorLab from './editor-lab';
import TransferLab from './transfer-lab';

export default function Lab() {
  const [tab, setTab] = useState<'editor' | 'transfer'>('editor');
  return <div className="shell">
    <aside className="sidebar">
      <a className="brand" href="/"><span className="brand-mark">Y</span> Yotion <span className="badge">LAB</span></a>
      <div className="workspace"><span>개인 작업 공간</span><small>로컬 프로토타입</small></div>
      <p className="section-label">개발 실험실</p>
      <nav aria-label="실험 선택">
        <button className={tab === 'editor' ? 'nav active' : 'nav'} onClick={() => setTab('editor')}><span>▤</span> 편집 엔진 <small>SPIKE-01</small></button>
        <button className={tab === 'transfer' ? 'nav active' : 'nav'} onClick={() => setTab('transfer')}><span>↙</span> 드롭 · 클립보드 <small>REA-02</small></button>
      </nav>
      <div className="sidebar-note"><span className="dot" /> 독립 실행 환경<p>노션 연결 없이 편집 동작과 입력 형식을 실험합니다.</p></div>
    </aside>
    <main>
      <header className="topbar"><span>개발 실험실 <span className="separator">/</span> {tab === 'editor' ? '편집 엔진' : '드롭 · 클립보드'}</span><span className="badge">기술 검증</span></header>
      <div hidden={tab !== 'editor'}><EditorLab /></div>
      <div hidden={tab !== 'transfer'}><TransferLab /></div>
    </main>
  </div>;
}
