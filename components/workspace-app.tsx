'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Editor } from '@tiptap/react';
import { Search, Settings, Plus, ChevronRight, ChevronsLeft, PanelLeft, FileText, Star, MoreHorizontal, Trash2, Download, Upload, Copy, ArrowRight, X, Check, LockKeyhole, Sun, Moon, Monitor, Undo2, FolderInput, Pencil } from 'lucide-react';
import PageEditor from './page-editor';
import { useWorkspace } from './use-workspace';
import { cloneContent, descendants, movePage, newPage, plainText, restorePage, trashPage, validateWorkspace, type Page } from '@/lib/workspace';
import { MAX_DOCUMENT_BYTES, parseDocument, serializeDocument } from '@/lib/document';
import { downloadJson } from '@/lib/transfer';
import ContextMenu, { type ContextAnchor } from './context-menu';

type ModalName = 'search' | 'trash' | 'settings' | 'move' | null;
const icons = ['📄', '👋', '📝', '🗓️', '🌱', '💡', '📚', '🎯', '🚀', '☕', '✨', '🏡', '🎨', '💻', '🧩', '❤️', '📌', '🌿', '🎵', '🧠', '✅', '🛠️', '🌏', '✏️'];

function Modal({ children, title, close, className = '' }: { children: ReactNode; title: string; close: () => void; className?: string }) {
  const panel = useRef<HTMLDivElement>(null);
  const closeRef = useRef(close); closeRef.current = close;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const frame = requestAnimationFrame(() => panel.current?.querySelector<HTMLElement>('input,button,select,[tabindex="0"]')?.focus());
    function key(event: KeyboardEvent) {
      if (event.key === 'Escape') { event.preventDefault(); closeRef.current(); }
      if (event.key !== 'Tab') return;
      const elements = Array.from(panel.current?.querySelectorAll<HTMLElement>('input,button,select,textarea,[tabindex="0"]') ?? []).filter(element => !element.hasAttribute('disabled'));
      const first = elements[0]; const last = elements.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
    document.addEventListener('keydown', key);
    return () => { cancelAnimationFrame(frame); document.removeEventListener('keydown', key); previous?.focus(); };
  }, []);
  return <div className="n-modal-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}><div ref={panel} role="dialog" aria-modal="true" aria-label={title} className={`n-modal ${className}`}>{children}</div></div>;
}

export default function WorkspaceApp() {
  const { workspace, status, error, update, flush, reload, retry, generation, setComposing } = useWorkspace();
  const [modal, setModal] = useState<ModalName>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(240);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [pageMenu, setPageMenu] = useState(false);
  const [picker, setPicker] = useState<'icon' | 'cover' | null>(null);
  const [query, setQuery] = useState('');
  const [searchIndex, setSearchIndex] = useState(0);
  const [moveTarget, setMoveTarget] = useState('');
  const [movePageId, setMovePageId] = useState('');
  const [context, setContext] = useState<{ pageId: string; anchor: ContextAnchor } | null>(null);
  const [notice, setNotice] = useState('');
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const [renameFocus, setRenameFocus] = useState('');
  const titleInput = useRef<HTMLTextAreaElement>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const currentEditor = useRef<Editor | null>(null);
  const historyReady = useRef(false);
  const latest = useRef(workspace); latest.current = workspace;
  const page = workspace?.pages.find(page => page.id === workspace.activeId && !page.trashed);
  const movingPage = workspace?.pages.find(page => page.id === movePageId && !page.trashed);
  const contextPage = workspace?.pages.find(page => page.id === context?.pageId && !page.trashed);
  useEffect(() => { document.title = `${page?.title || '제목 없음'} | Yotion`; }, [page?.title]);

  const patchPage = useCallback((id: string, patch: Partial<Page>) => {
    update(current => ({ ...current, pages: current.pages.map(page => page.id === id ? { ...page, ...patch, updatedAt: Date.now() } : page) }));
  }, [update]);
  const captureCurrentPage = useCallback(() => {
    const current = latest.current?.pages.find(page => page.id === latest.current?.activeId);
    const editor = currentEditor.current;
    if (current && editor && !editor.isDestroyed) {
      const content = editor.getJSON();
      if (JSON.stringify(content) !== JSON.stringify(current.content)) patchPage(current.id, { content });
    }
  }, [patchPage]);
  const openPage = useCallback((id: string, history = true) => {
    if (!latest.current?.pages.some(page => page.id === id && !page.trashed)) return;
    captureCurrentPage();
    update(current => ({ ...current, activeId: id }), false);
    if (history) window.history.pushState({}, '', `?page=${encodeURIComponent(id)}`);
    setModal(null); setPageMenu(false); setPicker(null); setContext(null); setNotice('');
    if (window.innerWidth <= 760) setSidebarOpen(false);
    document.querySelector('.n-main-scroll')?.scrollTo({ top: 0 });
  }, [update, captureCurrentPage]);
  useEffect(() => {
    if (!workspace) return;
    if (!historyReady.current) {
      historyReady.current = true;
      const id = new URLSearchParams(window.location.search).get('page');
      if (id && id !== workspace.activeId && workspace.pages.some(page => page.id === id && !page.trashed)) { openPage(id, false); return; }
    }
    if (new URLSearchParams(window.location.search).get('page') !== workspace.activeId) window.history.replaceState({}, '', `?page=${encodeURIComponent(workspace.activeId)}`);
  }, [workspace, openPage]);
  useEffect(() => { function pop() { const id = new URLSearchParams(window.location.search).get('page'); if (id) openPage(id, false); } window.addEventListener('popstate', pop); return () => window.removeEventListener('popstate', pop); }, [openPage]);
  useEffect(() => { if (window.innerWidth <= 760) setSidebarOpen(false); }, []);
  useEffect(() => {
    if (renameFocus === page?.id) { titleInput.current?.focus(); titleInput.current?.select(); setRenameFocus(''); }
  }, [renameFocus, page?.id]);
  useEffect(() => {
    function key(event: KeyboardEvent) {
      if (event.isComposing || event.keyCode === 229) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setModal(current => current === 'search' ? null : 'search'); setQuery(''); setSearchIndex(0); }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') { event.preventDefault(); void flush(); }
      if (event.key === 'Escape') { setPageMenu(false); setPicker(null); }
    }
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, [flush]);
  useEffect(() => { const row = document.querySelector<HTMLElement>('.n-search-result.is-selected'); row?.scrollIntoView({ block: 'nearest' }); }, [searchIndex]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(''), 6000); return () => clearTimeout(timer); }, [notice]);

  function createPage(parentId: string | null = null) {
    if (!workspace) return;
    captureCurrentPage();
    if (workspace.pages.length >= 1000) { setNotice('이 작업 공간은 최대 1,000페이지를 지원합니다.'); return; }
    const order = Math.max(-1, ...workspace.pages.filter(page => page.parentId === parentId).map(page => page.order)) + 1;
    const created = newPage(parentId, order);
    update(current => ({ ...current, pages: [...current.pages, created], activeId: created.id }));
    if (parentId) setCollapsed(current => { const next = new Set(current); next.delete(parentId); return next; });
    setRenameFocus(created.id); setModal(null); setPageMenu(false); setPicker(null);
    window.history.pushState({}, '', `?page=${created.id}`);
    if (window.innerWidth <= 760) setSidebarOpen(false);
  }
  function duplicate(id = page?.id) {
    if (!id) return;
    captureCurrentPage();
    try {
      update(current => {
        const target = current.pages.find(page => page.id === id && !page.trashed);
        if (!target) throw new Error('복제할 페이지를 찾을 수 없습니다.');
        const ids = descendants(current.pages, id);
        if (current.pages.length + ids.size > 1000) throw new Error('페이지 수 제한을 초과해 복제할 수 없습니다.');
        const mapping = new Map([...ids].map(id => [id, crypto.randomUUID()]));
        const order = Math.max(...current.pages.map(page => page.order)) + 1;
        const copies = current.pages.filter(item => ids.has(item.id)).map(item => ({ ...item, id: mapping.get(item.id)!, parentId: item.id === id ? item.parentId : mapping.get(item.parentId!)!, title: item.id === id ? `${item.title || '제목 없음'} (사본)` : item.title, favorite: false, content: cloneContent(item.content), order: item.id === id ? order : item.order, updatedAt: Date.now() }));
        return { ...current, pages: [...current.pages, ...copies], activeId: mapping.get(id)! };
      });
      setPageMenu(false); setContext(null); setNotice('페이지를 복제했습니다.');
    } catch (error) { setNotice(error instanceof Error ? error.message : '페이지를 복제하지 못했습니다.'); }
  }
  function requestMove(id: string) {
    const target = workspace?.pages.find(page => page.id === id && !page.trashed); if (!target) return;
    setMovePageId(id); setMoveTarget(target.parentId ?? ''); setModal('move'); setPageMenu(false); setContext(null);
  }
  function removePage(id: string) {
    captureCurrentPage(); update(current => trashPage(current, id)); setPageMenu(false); setContext(null); setNotice('페이지를 휴지통으로 옮겼습니다.');
  }
  function openPageContext(event: React.MouseEvent<HTMLElement> | React.KeyboardEvent<HTMLElement>, id: string) {
    const keyboard = 'key' in event;
    if (keyboard && event.nativeEvent.isComposing) return;
    event.preventDefault(); event.stopPropagation();
    const target = event.currentTarget;
    const trigger = target.querySelector<HTMLElement>('.n-tree-page') ?? target;
    const bounds = trigger.getBoundingClientRect();
    setPageMenu(false); setPicker(null);
    setContext({ pageId: id, anchor: { x: keyboard ? bounds.left + 20 : event.clientX, y: keyboard ? bounds.bottom : event.clientY, trigger } });
  }
  function move(id: string, parentId: string | null) {
    try { update(current => movePage(current, id, parentId)); if (parentId) setCollapsed(current => { const next = new Set(current); next.delete(parentId); return next; }); setModal(null); setNotice('페이지를 이동했습니다.'); }
    catch (error) { setNotice(error instanceof Error ? error.message : '페이지를 이동하지 못했습니다.'); }
  }
  async function importDocument(file: File) {
    try {
      if (file.size > 20 * 1024 * 1024) throw new Error('작업 공간 JSON은 20 MiB 이하여야 합니다.');
      const raw = await file.text();
      const value = JSON.parse(raw);
      captureCurrentPage();
      if (value && Array.isArray(value.pages)) {
        const imported = validateWorkspace(value);
        if (imported.pages.length + (latest.current?.pages.length ?? 0) > 1000) throw new Error('가져온 뒤 페이지 수가 1,000개를 초과합니다.');
        const mapping = new Map(imported.pages.map(page => [page.id, crypto.randomUUID()]));
        const baseOrder = Math.max(-1, ...(latest.current?.pages.map(page => page.order) ?? [])) + 1;
        const copies = imported.pages.map(item => ({ ...item, id: mapping.get(item.id)!, parentId: item.parentId ? mapping.get(item.parentId)! : null, content: cloneContent(item.content), order: item.parentId ? item.order : item.order + baseOrder, updatedAt: Date.now() }));
        const active = copies.find(item => item.id === mapping.get(imported.activeId) && !item.trashed) ?? copies.find(item => !item.trashed);
        update(current => ({ ...current, pages: [...current.pages, ...copies], activeId: active?.id ?? current.activeId }));
        setNotice(`${copies.length}개 페이지를 계층과 함께 새 사본으로 가져왔습니다.`);
        return;
      }
      if (file.size > MAX_DOCUMENT_BYTES) throw new Error('문서 파일은 2 MiB 이하여야 합니다.');
      const preview = parseDocument(raw);
      if ((latest.current?.pages.length ?? 0) >= 1000) throw new Error('페이지 수 제한을 초과했습니다.');
      const created = newPage(null, Math.max(-1, ...(latest.current?.pages.map(page => page.order) ?? [])) + 1, file.name.replace(/\.json$/i, ''));
      created.content = preview.document.content;
      update(current => ({ ...current, pages: [...current.pages, created], activeId: created.id }));
      setNotice(`${preview.blocks}개 블록을 새 페이지로 가져왔습니다.`);
    } catch (error) { setNotice(error instanceof Error ? error.message : '파일을 가져오지 못했습니다.'); }
  }
  function exportPage(id = page?.id) {
    const target = workspace?.pages.find(page => page.id === id && !page.trashed); if (!target) return;
    try { const content = id === page?.id ? currentEditor.current?.getJSON() ?? target.content : target.content; downloadJson(JSON.parse(serializeDocument(content)), `${target.title || '제목 없음'}.json`); setPageMenu(false); }
    catch (error) { setNotice(error instanceof Error ? error.message : '내보내지 못했습니다.'); }
  }

  function tree(parentId: string | null, depth = 0): ReactNode {
    if (!workspace || depth > 1000) return null;
    return workspace.pages.filter(page => page.parentId === parentId && !page.trashed).sort((a, b) => a.order - b.order).map(item => {
      const children = workspace.pages.some(page => page.parentId === item.id && !page.trashed);
      return <div key={item.id}>
        <div className={`n-tree-row ${page?.id === item.id ? 'is-active' : ''} ${dropTarget === item.id ? 'is-drop-target' : ''}`} style={{ paddingLeft: 8 + depth * 15 }} draggable
          onContextMenu={event => openPageContext(event, item.id)} onKeyDown={event => { if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) openPageContext(event, item.id); }}
          onDragStart={event => { event.stopPropagation(); event.dataTransfer.setData('application/x-yotion-page', item.id); event.dataTransfer.effectAllowed = 'move'; setDropTarget('dragging'); }} onDragEnd={() => setDropTarget(null)}
          onDragOver={event => { if (event.dataTransfer.types.includes('application/x-yotion-page')) { event.preventDefault(); event.stopPropagation(); setDropTarget(item.id); } }}
          onDragLeave={() => setDropTarget(null)}
          onDrop={event => { const id = event.dataTransfer.getData('application/x-yotion-page'); if (id) { event.preventDefault(); event.stopPropagation(); move(id, item.id); } setDropTarget(null); }}>
          <button className="n-tree-toggle" aria-label={`${item.title || '제목 없음'} ${collapsed.has(item.id) ? '펼치기' : '접기'}`} aria-expanded={!collapsed.has(item.id)} onClick={() => setCollapsed(current => { const next = new Set(current); if (next.has(item.id)) next.delete(item.id); else next.add(item.id); return next; })}><ChevronRight size={13} className={children && !collapsed.has(item.id) ? 'is-expanded' : ''} /></button>
          <button className="n-tree-page" onClick={() => openPage(item.id)}><span className="n-page-symbol">{item.icon || <FileText size={15} />}</span><span>{item.title || '제목 없음'}</span></button>
          <button className="n-tree-add" aria-label={`${item.title || '제목 없음'}에 하위 페이지 추가`} title="하위 페이지 추가" onClick={() => createPage(item.id)}><Plus size={14} /></button>
        </div>
        {!collapsed.has(item.id) && children && tree(item.id, depth + 1)}
      </div>;
    });
  }

  const searchResults = workspace?.pages.filter(page => !page.trashed && `${page.title} ${plainText(page.content)}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())).sort((a, b) => b.updatedAt - a.updatedAt) ?? [];
  const breadcrumbs: Page[] = [];
  let parent = page;
  while (parent && breadcrumbs.length < 64) { breadcrumbs.unshift(parent); parent = workspace?.pages.find(item => item.id === parent!.parentId); }
  const saveLabels = { loading: '불러오는 중', dirty: '저장 대기 중', saving: '저장 중…', saved: '이 기기에 저장됨', error: '저장 실패', conflict: '저장 충돌' };

  if (!workspace) return <div className="n-loading"><span className="n-app-icon">Y</span>{error ? <><h2>작업 공간을 열지 못했습니다</h2><p role="alert">{error}</p><button onClick={() => void reload()}>다시 시도</button><small>저장한 데이터는 삭제하지 않았습니다.</small></> : <p>작업 공간을 여는 중…</p>}</div>;
  return <div className="notion-app" data-theme={workspace.theme} style={{ '--sidebar-width': `${sidebarWidth}px` } as React.CSSProperties}>
    {sidebarOpen && <button className="n-mobile-dim" aria-label="사이드바 닫기" onClick={() => setSidebarOpen(false)} />}
    <aside className={`n-sidebar ${sidebarOpen ? 'is-open' : ''} ${dropTarget ? 'is-dragging' : ''}`} aria-label="작업 공간 사이드바">
      <div className="n-workspace-heading"><button className="n-workspace-name" onClick={() => setModal('settings')}><span className="n-app-icon">Y</span><strong>내 워크스페이스</strong><ChevronRight size={13} /></button><button className="n-icon-button n-collapse" aria-label="사이드바 접기" onClick={() => setSidebarOpen(false)}><ChevronsLeft size={18} /></button></div>
      <nav className="n-main-nav" aria-label="작업 공간 메뉴">
        <button onClick={() => { setQuery(''); setSearchIndex(0); setModal('search'); }}><Search size={17} /><span>검색</span><kbd>⌘ K</kbd></button>
        <button onClick={() => setModal('settings')}><Settings size={17} /><span>설정</span></button>
      </nav>
      <div className="n-sidebar-scroll">
        {workspace.pages.some(page => page.favorite && !page.trashed) && <section className="n-sidebar-section"><h2>즐겨찾기</h2>{workspace.pages.filter(page => page.favorite && !page.trashed).map(item => <button key={item.id} className={`n-favorite-row ${page?.id === item.id ? 'is-active' : ''}`} onContextMenu={event => openPageContext(event, item.id)} onKeyDown={event => { if (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10')) openPageContext(event, item.id); }} onClick={() => openPage(item.id)}><span className="n-page-symbol">{item.icon || <FileText size={15} />}</span><span>{item.title || '제목 없음'}</span></button>)}</section>}
        <section className="n-sidebar-section"><div className="n-section-heading"><h2>개인 페이지</h2><button aria-label="새 페이지" title="새 페이지" onClick={() => createPage()}><Plus size={15} /></button></div>{tree(null)}<button className="n-new-page" onClick={() => createPage()}><Plus size={16} />페이지 추가</button></section>
        <div className={`n-root-drop ${dropTarget === 'root' ? 'is-drop-target' : ''}`} onDragOver={event => { if (event.dataTransfer.types.includes('application/x-yotion-page')) { event.preventDefault(); setDropTarget('root'); } }} onDragLeave={() => setDropTarget(null)} onDrop={event => { const id = event.dataTransfer.getData('application/x-yotion-page'); if (id) { event.preventDefault(); move(id, null); } setDropTarget(null); }}>페이지를 이곳에 놓아 최상위로 이동</div>
      </div>
      <div className="n-sidebar-bottom"><button onClick={() => importInput.current?.click()}><Upload size={16} />JSON 가져오기</button><button onClick={() => setModal('trash')}><Trash2 size={16} />휴지통</button><div className="n-local-label"><span />이 기기의 개인 작업 공간</div></div>
      <div className="n-sidebar-resize" role="separator" aria-label="사이드바 너비" aria-orientation="vertical" tabIndex={0} onKeyDown={event => { if (event.key === 'ArrowRight') setSidebarWidth(width => Math.min(380, width + 10)); if (event.key === 'ArrowLeft') setSidebarWidth(width => Math.max(200, width - 10)); }} onPointerDown={event => {
        event.preventDefault(); const start = event.clientX; const width = sidebarWidth;
        const move = (event: PointerEvent) => setSidebarWidth(Math.max(200, Math.min(380, width + event.clientX - start)));
        const end = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end); };
        window.addEventListener('pointermove', move); window.addEventListener('pointerup', end);
      }} />
    </aside>
    <main className="n-main">
      <header className="n-topbar"><div className="n-breadcrumbs">{!sidebarOpen && <button className="n-icon-button" aria-label="사이드바 열기" onClick={() => setSidebarOpen(true)}><PanelLeft size={19} /></button>}{breadcrumbs.map((item, i) => <span key={item.id} className="n-crumb">{i > 0 && <span className="n-crumb-divider">/</span>}<button onClick={() => openPage(item.id)}><span>{item.icon || <FileText size={14} />}</span><span>{item.title || '제목 없음'}</span></button></span>)}</div>
        <div className="n-topbar-actions"><span className={`n-save-state ${status === 'error' || status === 'conflict' ? 'has-error' : ''}`} role="status">{status === 'saved' && <Check size={12} />}{saveLabels[status]}</span>{page && <><span className="n-private" title="이 기기에 저장하는 개인 페이지"><LockKeyhole size={12} />개인</span><button className={`n-icon-button ${page.favorite ? 'n-starred' : ''}`} aria-label={page.favorite ? '즐겨찾기 제거' : '즐겨찾기에 추가'} onClick={() => patchPage(page.id, { favorite: !page.favorite })}><Star size={18} fill={page.favorite ? 'currentColor' : 'none'} /></button><button className="n-icon-button" aria-label="페이지 메뉴" aria-expanded={pageMenu} onClick={() => { setPageMenu(!pageMenu); setPicker(null); }}><MoreHorizontal size={21} /></button></>}</div>
      </header>
      {(status === 'error' || status === 'conflict') && <div className="n-storage-error" role="alert"><div><strong>{error}</strong><p>현재 변경은 이 화면에 유지됩니다. 저장 전에 창을 닫지 마세요.</p></div><button onClick={() => downloadJson(workspace, 'yotion-unsaved-workspace.json')}>내 변경 다운로드</button>{status === 'conflict' ? <button onClick={() => void reload()}>저장본으로 교체</button> : <button onClick={retry}>저장 재시도</button>}</div>}
      {pageMenu && page && <><button className="n-dismiss" aria-label="페이지 메뉴 닫기" onClick={() => setPageMenu(false)} /><div className="n-popover n-page-menu">
        <p className="n-menu-caption">글꼴</p><div className="n-font-options">{(['default', 'serif', 'mono'] as const).map((font, i) => <button key={font} className={page.font === font ? 'is-selected' : ''} onClick={() => patchPage(page.id, { font })}><span style={{ fontFamily: ['inherit', 'Georgia,serif', 'monospace'][i] }}>Ag</span>{['기본', '세리프', '모노'][i]}</button>)}</div>
        <hr /><button onClick={() => patchPage(page.id, { smallText: !page.smallText })}>작은 텍스트<span className={`n-switch ${page.smallText ? 'is-on' : ''}`} /></button><button onClick={() => patchPage(page.id, { fullWidth: !page.fullWidth })}>전체 너비<span className={`n-switch ${page.fullWidth ? 'is-on' : ''}`} /></button><hr />
        <button onClick={() => createPage(page.id)}><Plus size={16} />하위 페이지 추가</button><button onClick={() => duplicate()}><Copy size={16} />복제</button><button onClick={() => requestMove(page.id)}><FolderInput size={16} />이동</button><button onClick={() => exportPage()}><Download size={16} />JSON 내보내기</button><hr /><button className="n-danger" onClick={() => removePage(page.id)}><Trash2 size={16} />휴지통으로 이동</button><small>최근 수정 {new Date(page.updatedAt).toLocaleDateString('ko-KR')}</small>
      </div></>}
      <div className="n-main-scroll">
        {page ? <article className={`n-document ${page.fullWidth ? 'is-full-width' : ''} ${page.smallText ? 'is-small-text' : ''}`} data-font={page.font}>
          {page.cover && <div className={`n-cover n-cover-${page.cover}`}><button onClick={() => setPicker(picker === 'cover' ? null : 'cover')}>커버 변경</button></div>}
          <div className="n-document-content">
            <div className={`n-page-decoration ${page.cover ? 'has-cover' : ''}`}>
              {page.icon && <button className="n-large-icon" aria-label="페이지 아이콘 변경" onClick={() => setPicker(picker === 'icon' ? null : 'icon')}>{page.icon}</button>}
              <div className="n-decoration-actions">{!page.icon && <button onClick={() => setPicker('icon')}>☺ 아이콘 추가</button>}{!page.cover && <button onClick={() => patchPage(page.id, { cover: 'sand' })}><ImageCover />커버 추가</button>}</div>
              {picker && <><button className="n-dismiss" aria-label="꾸미기 메뉴 닫기" onClick={() => setPicker(null)} /><div className={`n-popover n-decoration-picker ${picker === 'cover' ? 'n-cover-picker' : ''}`}>
                <div className="n-picker-heading"><strong>{picker === 'icon' ? '이모지' : '커버'}</strong><button onClick={() => { patchPage(page.id, picker === 'icon' ? { icon: '' } : { cover: '' }); setPicker(null); }}>제거</button></div>
                {picker === 'icon' ? <div className="n-emoji-grid">{icons.map(icon => <button key={icon} aria-label={`아이콘 ${icon}`} onClick={() => { patchPage(page.id, { icon }); setPicker(null); }}>{icon}</button>)}</div> : <div className="n-cover-grid">{['sand', 'forest', 'sky', 'rose', 'ink', 'plain'].map(cover => <button key={cover} className={`n-cover-${cover}`} aria-label={`${cover} 커버`} onClick={() => { patchPage(page.id, { cover }); setPicker(null); }} />)}</div>}
              </div></>}
            </div>
            <textarea key={page.id} ref={titleInput} className="n-title" rows={1} aria-label="페이지 제목" placeholder="제목 없음" value={page.title} onInput={event => { event.currentTarget.style.height = 'auto'; event.currentTarget.style.height = `${event.currentTarget.scrollHeight}px`; }} onChange={event => patchPage(page.id, { title: event.target.value.replace(/\n/g, '').slice(0, 500) })} onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing && event.keyCode !== 229) { event.preventDefault(); currentEditor.current?.commands.focus('start'); } }} />
            <PageEditor key={`${page.id}:${generation}`} page={page} onChange={content => patchPage(page.id, { content })} onEditor={editor => { currentEditor.current = editor; }} onComposing={setComposing} />
            {workspace.pages.some(item => item.parentId === page.id && !item.trashed) && <div className="n-child-pages">{workspace.pages.filter(item => item.parentId === page.id && !item.trashed).sort((a, b) => a.order - b.order).map(child => <button key={child.id} onClick={() => openPage(child.id)}><span>{child.icon || <FileText size={18} />}</span><span>{child.title || '제목 없음'}</span><ChevronRight size={15} /></button>)}</div>}
            <button className="n-add-child" onClick={() => createPage(page.id)}><Plus size={15} />하위 페이지 추가</button>
          </div>
        </article> : <div className="n-empty-workspace"><FileText size={42} strokeWidth={1} /><h1>새로운 이야기를 시작하세요</h1><p>페이지를 만들고 생각을 자유롭게 적어보세요.</p><button className="n-primary" onClick={() => createPage()}>첫 페이지 만들기</button></div>}
      </div>
      <button className="n-help-button" aria-label="사용 안내" onClick={() => setNotice('/ 블록 추가 · ⌘/Ctrl+K 검색 · ⌘/Ctrl+S 저장 · ⌥+Shift+↑↓ 블록 이동 · Markdown 단축키 지원')}>?</button>
    </main>
    <input hidden ref={importInput} type="file" accept=".json,application/json" aria-label="페이지 JSON 가져오기" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void importDocument(file); }} />
    {context && contextPage && <ContextMenu anchor={context.anchor} label={`${contextPage.title || '제목 없음'} 페이지 메뉴`} onClose={() => setContext(null)} actions={[
      { id: 'open', label: '열기', icon: <FileText size={15} />, run: () => openPage(contextPage.id) },
      { id: 'favorite', label: contextPage.favorite ? '즐겨찾기 제거' : '즐겨찾기에 추가', icon: <Star size={15} />, run: () => patchPage(contextPage.id, { favorite: !contextPage.favorite }) },
      { id: 'rename', label: '이름 바꾸기', icon: <Pencil size={15} />, separator: true, run: () => { openPage(contextPage.id); setRenameFocus(contextPage.id); } },
      { id: 'add', label: '하위 페이지 추가', icon: <Plus size={15} />, run: () => createPage(contextPage.id) },
      { id: 'copy', label: '복제', icon: <Copy size={15} />, run: () => duplicate(contextPage.id) },
      { id: 'move', label: '이동', icon: <FolderInput size={15} />, run: () => requestMove(contextPage.id) },
      { id: 'export', label: 'JSON 내보내기', icon: <Download size={15} />, run: () => exportPage(contextPage.id) },
      { id: 'trash', label: '휴지통으로 이동', icon: <Trash2 size={15} />, separator: true, danger: true, run: () => removePage(contextPage.id) },
    ]} />}
    {notice && <div className="n-toast" role="status">{notice}<button aria-label="알림 닫기" onClick={() => setNotice('')}><X size={14} /></button></div>}
    {modal === 'search' && <Modal title="페이지 검색" close={() => setModal(null)} className="n-search-modal"><div className="n-search-input"><Search size={21} /><input aria-label="페이지 검색어" placeholder="페이지를 검색하세요…" value={query} onChange={event => { setQuery(event.target.value); setSearchIndex(0); }} onKeyDown={event => { if (event.nativeEvent.isComposing) return; if (event.key === 'ArrowDown') { event.preventDefault(); setSearchIndex(index => (index + 1) % Math.max(1, searchResults.length)); } if (event.key === 'ArrowUp') { event.preventDefault(); setSearchIndex(index => (index - 1 + searchResults.length) % Math.max(1, searchResults.length)); } if (event.key === 'Enter' && searchResults[searchIndex]) openPage(searchResults[searchIndex].id); }} /><kbd>ESC</kbd></div><div className="n-search-results"><p>{query ? `검색 결과 ${searchResults.length}개` : '최근 수정한 페이지'}</p>{searchResults.map((item, index) => <button key={item.id} className={`n-search-result ${searchIndex === index ? 'is-selected' : ''}`} onMouseEnter={() => setSearchIndex(index)} onClick={() => openPage(item.id)}><span className="n-search-icon">{item.icon || <FileText size={20} />}</span><span><strong>{item.title || '제목 없음'}</strong><small>{plainText(item.content).slice(0, 90) || '빈 페이지'}</small></span><ArrowRight size={16} /></button>)}{!searchResults.length && <div className="n-no-results">검색 결과가 없습니다.</div>}</div><footer>↑↓ 탐색 <span>↵ 열기</span><span>제목과 본문에서 검색합니다</span></footer></Modal>}
    {modal === 'trash' && <Modal title="휴지통" close={() => setModal(null)}><div className="n-modal-heading"><h2><Trash2 size={19} />휴지통</h2><button className="n-icon-button" aria-label="휴지통 닫기" onClick={() => setModal(null)}><X size={18} /></button></div><p className="n-modal-description">삭제한 페이지를 복원할 수 있습니다. 하위 페이지도 함께 복원됩니다.</p><div className="n-trash-list">{workspace.pages.filter(page => page.trashed).map(item => <div key={item.id}><span>{item.icon || <FileText size={17} />}</span><strong>{item.title || '제목 없음'}</strong><button onClick={() => { update(current => restorePage(current, item.id)); setModal(null); setNotice('페이지를 복원했습니다.'); }}><Undo2 size={14} />복원</button></div>)}{!workspace.pages.some(page => page.trashed) && <div className="n-no-results">휴지통이 비어 있습니다.</div>}</div></Modal>}
    {modal === 'settings' && <Modal title="설정" close={() => setModal(null)}><div className="n-modal-heading"><h2><Settings size={19} />설정</h2><button className="n-icon-button" aria-label="설정 닫기" onClick={() => setModal(null)}><X size={18} /></button></div><section className="n-settings-section"><h3>화면 모드</h3><div className="n-theme-options">{(['light', 'dark', 'system'] as const).map((theme, i) => { const Icon = [Sun, Moon, Monitor][i]; return <button key={theme} aria-pressed={workspace.theme === theme} onClick={() => update(current => ({ ...current, theme }))}><Icon size={20} />{['라이트', '다크', '시스템'][i]}{workspace.theme === theme && <Check size={14} />}</button>; })}</div></section><section className="n-settings-section"><h3>내 데이터</h3><p>페이지는 이 브라우저에 자동 저장됩니다. 다른 기기와 동기화되지 않습니다. 브라우저 데이터 삭제 전 JSON 파일로 내보내세요.</p><button className="n-outlined" onClick={() => downloadJson(workspace, 'yotion-workspace.json')}><Download size={15} />작업 공간 JSON 다운로드</button></section><section className="n-settings-section"><h3>개발 도구</h3><a href="/lab">편집·입력 관찰 실험실 열기 <ArrowRight size={13} /></a></section></Modal>}
    {modal === 'move' && movingPage && <Modal title="페이지 이동" close={() => setModal(null)}><div className="n-modal-heading"><h2><FolderInput size={19} />페이지 이동</h2><button className="n-icon-button" aria-label="이동 닫기" onClick={() => setModal(null)}><X size={18} /></button></div><div className="n-move-form"><label htmlFor="parent-page">‘{movingPage.title || '제목 없음'}’의 새 위치</label><select id="parent-page" value={moveTarget} onChange={event => setMoveTarget(event.target.value)}><option value="">개인 페이지 (최상위)</option>{workspace.pages.filter(item => !item.trashed && !descendants(workspace.pages, movingPage.id).has(item.id)).map(item => <option key={item.id} value={item.id}>{item.icon} {item.title || '제목 없음'}</option>)}</select><button className="n-primary" onClick={() => move(movingPage.id, moveTarget || null)}>이동</button></div></Modal>}
  </div>;
}

function ImageCover() { return <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor"><rect x="2" y="3" width="12" height="10" rx="1.5" /><path d="m2 11 4-4 3 3 2-2 3 3" /></svg>; }
