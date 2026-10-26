import { describe, expect, it } from 'vitest';
import { cloneContent, descendants, movePage, restorePage, seedWorkspace, trashPage, validateWorkspace } from '../lib/workspace';

describe('페이지 작업 공간', () => {
  it('시작 문서 전체가 저장 스키마를 만족한다', () => {
    const workspace = seedWorkspace();
    expect(validateWorkspace(workspace)).toEqual(workspace);
  });
  it('자기 자신·하위 페이지로의 순환 이동을 차단한다', () => {
    const workspace = seedWorkspace();
    const parent = workspace.pages[0]; const child = workspace.pages.find(page => page.parentId === parent.id)!;
    expect(() => movePage(workspace, parent.id, parent.id)).toThrow('하위 페이지');
    expect(() => movePage(workspace, parent.id, child.id)).toThrow('하위 페이지');
    const moved = movePage(workspace, child.id, workspace.pages[1].id);
    expect(moved.pages.find(page => page.id === child.id)!.parentId).toBe(workspace.pages[1].id);
    expect(descendants(moved.pages, parent.id).has(child.id)).toBe(false);
  });
  it('삭제와 복원은 하위 구조와 내용을 보존한다', () => {
    const workspace = seedWorkspace(); const parent = workspace.pages[0];
    const removed = trashPage(workspace, parent.id);
    for (const id of descendants(workspace.pages, parent.id)) expect(removed.pages.find(page => page.id === id)!.trashed).toBe(true);
    expect(removed.activeId).not.toBe(parent.id);
    const restored = restorePage(removed, parent.id);
    expect(restored.pages).toEqual(workspace.pages);
    expect(restored.activeId).toBe(parent.id);
  });
  it('하위 페이지를 복원하면 부모도 다시 접근할 수 있다', () => {
    const workspace = seedWorkspace(); const parent = workspace.pages[0]; const child = workspace.pages.find(page => page.parentId === parent.id)!;
    const restored = restorePage(trashPage(workspace, parent.id), child.id);
    expect(restored.pages.find(page => page.id === parent.id)!.trashed).toBe(false);
    expect(restored.pages.find(page => page.id === child.id)!.trashed).toBe(false);
  });
  it('블록 복제는 본문을 유지하고 모든 ID를 바꾼다', () => {
    const original = seedWorkspace().pages[0].content;
    const copy = cloneContent(original);
    const ids = (value: typeof original): string[] => [value.attrs?.id, ...(value.content ?? []).flatMap(ids)].filter(Boolean);
    expect(ids(original).every(id => !ids(copy).includes(id))).toBe(true);
    expect(ids(copy).length).toBe(ids(original).length);
  });
  it('저장소의 중복 페이지·순환 계층을 거부한다', () => {
    const workspace = seedWorkspace();
    expect(() => validateWorkspace({ ...workspace, pages: [...workspace.pages, workspace.pages[0]] })).toThrow('페이지 형식');
    workspace.pages[0].parentId = workspace.pages[0].id;
    expect(() => validateWorkspace(workspace)).toThrow('계층');
  });
});
