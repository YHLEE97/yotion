import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

const title = (page: Page) => page.getByRole('textbox', { name: '페이지 제목' });
const body = (page: Page) => page.getByRole('textbox', { name: '문서 본문' });
const menu = (page: Page) => page.getByRole('menu');
async function ready(page: Page) { await page.goto('/'); await expect(body(page)).toBeEditable(); await expect(page.locator('.n-save-state')).toHaveText('이 기기에 저장됨'); }
async function create(page: Page, name: string) { await page.getByRole('button', { name: '새 페이지', exact: true }).click(); await title(page).fill(name); await expect(body(page)).toBeEditable(); }

test('우클릭한 블록의 복제·삭제·이동과 undo가 커서 위치와 무관하게 동작한다', async ({ page }, info) => {
  await ready(page); await create(page, '블록 대상');
  await body(page).fill('첫 문단'); await body(page).press('End'); await body(page).press('Enter'); await page.keyboard.insertText('대상 문단'); await body(page).press('Enter'); await page.keyboard.insertText('마지막 문단');
  const paragraphs = body(page).locator('p');
  const targetId = await paragraphs.nth(1).getAttribute('data-id');
  await paragraphs.first().click();
  await paragraphs.nth(1).click({ button: 'right' });
  await expect(menu(page)).toHaveAccessibleName('블록 우클릭 메뉴');
  await page.screenshot({ path: info.outputPath('block-context-menu.png'), animations: 'disabled' });
  await menu(page).getByRole('menuitem', { name: '복제', exact: true }).click();
  await expect(paragraphs).toHaveText(['첫 문단', '대상 문단', '대상 문단', '마지막 문단']);
  const ids = await paragraphs.evaluateAll(nodes => nodes.map(node => node.getAttribute('data-id')));
  expect(new Set(ids).size).toBe(4);
  await paragraphs.nth(2).click({ button: 'right' });
  await menu(page).getByRole('menuitem', { name: '삭제', exact: true }).click();
  await expect(paragraphs).toHaveText(['첫 문단', '대상 문단', '마지막 문단']);
  await body(page).press('ControlOrMeta+z');
  await expect(paragraphs).toHaveCount(4);
  await paragraphs.nth(1).click({ button: 'right' });
  await menu(page).getByRole('menuitem', { name: '위로 이동', exact: false }).click();
  await expect(paragraphs.first()).toHaveText('대상 문단');
  await expect(paragraphs.first()).toHaveAttribute('data-id', targetId!);
  await body(page).press('ControlOrMeta+z');
  await expect(paragraphs.first()).toHaveText('첫 문단');
  await paragraphs.first().click({ button: 'right' });
  await expect(menu(page).getByRole('menuitem', { name: '위로 이동', exact: false })).toBeDisabled();
});

test('열리지 않은 페이지의 즐겨찾기·내보내기·복제·휴지통이 정확한 대상을 사용한다', async ({ page }) => {
  await ready(page); await create(page, '컨텍스트 대상'); await body(page).fill('내보낼 대상 내용');
  await page.locator('.n-favorite-row').filter({ hasText: '시작하기' }).click();
  const target = page.locator('.n-tree-page').filter({ hasText: /^컨텍스트 대상$/ });
  await target.click({ button: 'right' });
  await expect(title(page)).toHaveValue('시작하기');
  await menu(page).getByRole('menuitem', { name: '즐겨찾기에 추가', exact: true }).click();
  const favorite = page.locator('.n-favorite-row').filter({ hasText: '컨텍스트 대상' });
  await expect(favorite).toBeVisible(); await expect(title(page)).toHaveValue('시작하기');
  await favorite.click({ button: 'right' });
  const downloaded = page.waitForEvent('download');
  await menu(page).getByRole('menuitem', { name: 'JSON 내보내기', exact: true }).click();
  const file = await downloaded;
  expect(file.suggestedFilename()).toBe('컨텍스트 대상.json');
  expect(await readFile((await file.path())!, 'utf8')).toContain('내보낼 대상 내용');
  await expect(title(page)).toHaveValue('시작하기');
  await target.click({ button: 'right' });
  await menu(page).getByRole('menuitem', { name: '복제', exact: true }).click();
  await expect(title(page)).toHaveValue('컨텍스트 대상 (사본)');
  await expect(body(page)).toHaveText('내보낼 대상 내용');
  await target.click({ button: 'right' });
  await menu(page).getByRole('menuitem', { name: '휴지통으로 이동', exact: true }).click();
  await expect(target).toHaveCount(0);
  await expect(title(page)).toHaveValue('컨텍스트 대상 (사본)');
  await page.getByRole('button', { name: '휴지통', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: '복원', exact: true }).click();
  await expect(title(page)).toHaveValue('컨텍스트 대상');
  await expect(body(page)).toHaveText('내보낼 대상 내용');
});

test('비활성 페이지의 이동·하위 페이지 생성·이름 바꾸기', async ({ page }) => {
  await ready(page);
  const target = page.locator('.n-tree-page').filter({ hasText: '빠른 메모' });
  await target.click({ button: 'right' });
  await menu(page).getByRole('menuitem', { name: '이동', exact: true }).click();
  const select = page.getByLabel('‘빠른 메모’의 새 위치');
  const homeId = await select.locator('option').filter({ hasText: '시작하기' }).getAttribute('value');
  await select.selectOption(homeId!);
  await page.getByRole('dialog').getByRole('button', { name: '이동', exact: true }).click();
  await expect(title(page)).toHaveValue('시작하기');
  await target.click({ button: 'right' });
  await menu(page).getByRole('menuitem', { name: '하위 페이지 추가', exact: true }).click();
  await expect(title(page)).toHaveValue('');
  await title(page).fill('메모의 하위 페이지');
  await expect(page.locator('.n-breadcrumbs')).toContainText('빠른 메모');
  await target.click({ button: 'right' });
  await menu(page).getByRole('menuitem', { name: '이름 바꾸기', exact: true }).click();
  await expect(title(page)).toHaveValue('빠른 메모');
  await expect(title(page)).toBeFocused();
  await title(page).fill('새 메모 이름');
  await expect(page.locator('.n-tree-page').filter({ hasText: '새 메모 이름' })).toBeVisible();
});

test('Shift+F10·방향키·Enter·Escape·Tab과 외부 클릭', async ({ page }) => {
  await ready(page);
  const target = page.locator('.n-tree-page').filter({ hasText: '빠른 메모' });
  await target.focus(); await target.press('Shift+F10');
  await expect(menu(page)).toBeVisible();
  await expect(menu(page).getByRole('menuitem', { name: '열기', exact: true })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(menu(page).getByRole('menuitem', { name: '즐겨찾기에 추가', exact: true })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('.n-favorite-row').filter({ hasText: '빠른 메모' })).toBeVisible();
  await expect(title(page)).toHaveValue('시작하기');
  await target.focus(); await target.press('Shift+F10'); await page.keyboard.press('Escape');
  await expect(menu(page)).toHaveCount(0); await expect(target).toBeFocused();
  await target.press('Shift+F10'); await page.keyboard.press('Tab');
  await expect(menu(page)).toHaveCount(0); await expect(target).toBeFocused();
  await target.click({ button: 'right' }); await title(page).click();
  await expect(menu(page)).toHaveCount(0); await expect(title(page)).toBeFocused();
  await body(page).locator('p').first().click(); await body(page).press('Shift+F10');
  await expect(menu(page)).toHaveAccessibleName('블록 우클릭 메뉴');
  await page.keyboard.press('Escape'); await expect(body(page)).toBeFocused();
  await target.click({ button: 'right' }); await page.keyboard.press('ControlOrMeta+k');
  await expect(menu(page)).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: '페이지 검색' })).toBeVisible();
  await page.keyboard.press('Escape');
});

test('화면 가장자리 보정·다시 열기·스크롤 닫기와 입력창의 기본 메뉴', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 600 }); await ready(page);
  const target = page.locator('.n-tree-page').filter({ hasText: '빠른 메모' });
  await target.evaluate(element => element.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 799, clientY: 599 })));
  await expect(menu(page)).toBeVisible();
  const bounds = await menu(page).boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(8); expect(bounds!.y).toBeGreaterThanOrEqual(8);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(792); expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(592);
  await page.locator('.n-tree-page').filter({ hasText: '이번 주 계획' }).click({ button: 'right' });
  await expect(menu(page)).toHaveCount(1); await expect(menu(page)).toHaveAccessibleName('이번 주 계획 페이지 메뉴');
  await page.locator('.n-main-scroll').evaluate(element => { element.scrollTop = 100; });
  await expect(menu(page)).toHaveCount(0);
  await target.click({ button: 'right' }); await page.setViewportSize({ width: 810, height: 610 });
  await expect(menu(page)).toHaveCount(0);
  const prevented = await title(page).evaluate(element => !element.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })));
  expect(prevented).toBe(false); await expect(menu(page)).toHaveCount(0);
});
