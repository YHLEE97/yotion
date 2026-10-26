import type { JSONContent } from '@tiptap/core';
import { parseDocument } from './document';

export type Page = {
  id: string; parentId: string | null; title: string; icon: string; cover: string;
  content: JSONContent; favorite: boolean; trashed: boolean; order: number;
  fullWidth: boolean; smallText: boolean; font: 'default' | 'serif' | 'mono'; updatedAt: number;
};
export type Workspace = { schemaVersion: 1; pages: Page[]; activeId: string; theme: 'light' | 'dark' | 'system' };
export const emptyDocument = (): JSONContent => ({ type: 'doc', content: [{ type: 'paragraph', attrs: { id: crypto.randomUUID() } }] });
export function newPage(parentId: string | null, order: number, title = ''): Page {
  return { id: crypto.randomUUID(), parentId, order, title, icon: '', cover: '', content: emptyDocument(), favorite: false, trashed: false, fullWidth: false, smallText: false, font: 'default', updatedAt: Date.now() };
}
function text(value: string): JSONContent[] { return [{ type: 'text', text: value }]; }
function block(type: string, value: string, attrs: Record<string, unknown> = {}): JSONContent {
  return { type, attrs: { id: crypto.randomUUID(), ...attrs }, content: text(value) };
}
export function seedWorkspace(): Workspace {
  const home = newPage(null, 0, '시작하기');
  home.icon = '👋'; home.cover = 'sand'; home.favorite = true;
  home.content = { type: 'doc', content: [
    block('paragraph', '반가워요. 이곳은 생각을 적고, 계획을 세우고, 나만의 이야기를 만들어가는 공간이에요.'),
    block('heading', '작은 아이디어에서 시작하세요', { level: 2 }),
    block('paragraph', '완벽하게 정리할 필요는 없어요. 떠오르는 생각을 자유롭게 적어보세요.'),
    { type: 'taskList', attrs: { id: crypto.randomUUID() }, content: [
      { type: 'taskItem', attrs: { id: crypto.randomUUID(), checked: true }, content: [block('paragraph', '나만의 작업 공간 둘러보기')] },
      { type: 'taskItem', attrs: { id: crypto.randomUUID(), checked: false }, content: [block('paragraph', '새 페이지를 만들고 첫 문장 쓰기')] },
      { type: 'taskItem', attrs: { id: crypto.randomUUID(), checked: false }, content: [block('paragraph', '/를 입력해 다양한 블록 만나보기')] },
    ] },
    { type: 'horizontalRule', attrs: { id: crypto.randomUUID() } },
    block('heading', '모든 기록을 한곳에', { level: 2 }),
    block('paragraph', '왼쪽에서 페이지를 자유롭게 추가하세요. 페이지 안에 하위 페이지를 만들고, 자주 찾는 페이지는 즐겨찾기에 담을 수 있어요.'),
    { type: 'blockquote', attrs: { id: crypto.randomUUID() }, content: [block('paragraph', '좋은 생각은 기록하는 순간부터 자라납니다.')] },
    { type: 'paragraph', attrs: { id: crypto.randomUUID() } },
  ] };
  const notes = newPage(null, 1, '빠른 메모'); notes.icon = '📝';
  const week = newPage(null, 2, '이번 주 계획'); week.icon = '🗓️';
  week.content = { type: 'doc', content: [block('heading', '이번 주에 집중할 것', { level: 2 }), block('paragraph', '가장 중요한 일 세 가지를 적어보세요.'), { type: 'paragraph', attrs: { id: crypto.randomUUID() } }] };
  const child = newPage(home.id, 0, '나의 첫 페이지'); child.icon = '🌱';
  const pages = [home, notes, week, child].map(page => ({ ...page, content: parseDocument(JSON.stringify({ schemaVersion: 1, content: page.content })).document.content }));
  return { schemaVersion: 1, pages, activeId: home.id, theme: 'light' };
}
export function descendants(pages: Page[], id: string): Set<string> {
  const result = new Set([id]);
  let changed = true;
  while (changed) { changed = false; for (const page of pages) if (page.parentId && result.has(page.parentId) && !result.has(page.id)) { result.add(page.id); changed = true; } }
  return result;
}
export function movePage(workspace: Workspace, id: string, parentId: string | null): Workspace {
  const moving = workspace.pages.find(page => page.id === id && !page.trashed);
  if (!moving || (parentId && !workspace.pages.some(page => page.id === parentId && !page.trashed))) throw new Error('이동할 페이지를 찾을 수 없습니다.');
  if (parentId && descendants(workspace.pages, id).has(parentId)) throw new Error('페이지를 자기 자신이나 하위 페이지 안으로 이동할 수 없습니다.');
  const order = Math.max(-1, ...workspace.pages.filter(page => page.parentId === parentId).map(page => page.order)) + 1;
  return { ...workspace, pages: workspace.pages.map(page => page.id === id ? { ...page, parentId, order, updatedAt: Date.now() } : page) };
}
export function trashPage(workspace: Workspace, id: string): Workspace {
  const ids = descendants(workspace.pages, id);
  const pages = workspace.pages.map(page => ids.has(page.id) ? { ...page, trashed: true } : page);
  return { ...workspace, pages, activeId: ids.has(workspace.activeId) ? pages.find(page => !page.trashed)?.id ?? '' : workspace.activeId };
}
export function restorePage(workspace: Workspace, id: string): Workspace {
  const ids = descendants(workspace.pages, id);
  let page = workspace.pages.find(page => page.id === id);
  while (page?.parentId) { ids.add(page.parentId); page = workspace.pages.find(parent => parent.id === page!.parentId); }
  return { ...workspace, pages: workspace.pages.map(page => ids.has(page.id) ? { ...page, trashed: false } : page), activeId: id };
}
export function plainText(content: JSONContent): string {
  return content.text ?? (content.content ?? []).map(plainText).join(' ');
}
export function cloneContent(content: JSONContent): JSONContent {
  return { ...content, attrs: content.attrs?.id ? { ...content.attrs, id: crypto.randomUUID() } : content.attrs, content: content.content?.map(cloneContent) };
}
export function validateWorkspace(value: unknown): Workspace {
  const data = value as Workspace;
  if (!data || data.schemaVersion !== 1 || !Array.isArray(data.pages) || data.pages.length > 1000 || typeof data.activeId !== 'string' || !['light', 'dark', 'system'].includes(data.theme)) throw new Error('작업 공간 형식이 올바르지 않습니다.');
  const ids = new Set<string>();
  for (const page of data.pages) {
    if (!page || typeof page.id !== 'string' || !page.id || ids.has(page.id) || (page.parentId !== null && typeof page.parentId !== 'string') || typeof page.title !== 'string' || typeof page.icon !== 'string' || typeof page.cover !== 'string' || !['default', 'serif', 'mono'].includes(page.font) || typeof page.favorite !== 'boolean' || typeof page.trashed !== 'boolean' || typeof page.fullWidth !== 'boolean' || typeof page.smallText !== 'boolean' || !Number.isFinite(page.order) || !Number.isFinite(page.updatedAt)) throw new Error('페이지 형식이 올바르지 않습니다.');
    ids.add(page.id);
    parseDocument(JSON.stringify({ schemaVersion: 1, content: page.content }));
  }
  for (const page of data.pages) {
    const seen = new Set([page.id]);
    let parentId = page.parentId;
    while (parentId) {
      if (seen.has(parentId) || !ids.has(parentId)) throw new Error('페이지 계층이 올바르지 않습니다.');
      seen.add(parentId); parentId = data.pages.find(parent => parent.id === parentId)!.parentId;
    }
  }
  return data;
}
