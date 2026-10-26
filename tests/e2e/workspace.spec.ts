import { expect, test, type Page } from '@playwright/test';

async function saved(page: Page) { await expect(page.locator('.n-save-state')).toHaveText('이 기기에 저장됨'); }
async function create(page: Page, title: string) {
  await page.getByRole('button', { name: '새 페이지', exact: true }).click();
  await page.getByRole('textbox', { name: '페이지 제목' }).fill(title);
  await expect(page.getByRole('textbox', { name: '문서 본문' })).toBeEditable();
}

test('작업 화면과 제목·본문 자동 저장, 검색, 새로고침', async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(page.getByRole('textbox', { name: '페이지 제목' })).toHaveValue('시작하기');
  await saved(page);
  await page.screenshot({ path: info.outputPath('workspace-desktop.png') });
  await create(page, '작업 일지');
  await page.getByRole('textbox', { name: '문서 본문' }).fill('오늘 기록한 한글 문서');
  await saved(page);
  await page.reload();
  await expect(page.getByRole('textbox', { name: '페이지 제목' })).toHaveValue('작업 일지');
  await expect(page.getByRole('textbox', { name: '문서 본문' })).toHaveText('오늘 기록한 한글 문서');
  await page.keyboard.press('ControlOrMeta+k');
  await page.getByRole('textbox', { name: '페이지 검색어' }).fill('오늘 기록한');
  await expect(page.locator('.n-search-result')).toHaveCount(1);
  await page.getByRole('textbox', { name: '페이지 검색어' }).press('Enter');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: '페이지 제목' })).toHaveValue('작업 일지');
});

test('하위 페이지·이동·휴지통·복원', async ({ page }) => {
  await page.goto('/');
  await saved(page);
  await page.getByRole('button', { name: '시작하기에 하위 페이지 추가', exact: true }).click();
  await page.getByRole('textbox', { name: '페이지 제목' }).fill('하위 노트');
  await page.getByRole('textbox', { name: '문서 본문' }).fill('보존할 내용');
  await page.getByRole('button', { name: '페이지 메뉴', exact: true }).click();
  await page.getByRole('button', { name: '이동', exact: true }).click();
  await page.getByLabel('‘하위 노트’의 새 위치').selectOption({ label: '개인 페이지 (최상위)' });
  await page.getByRole('dialog').getByRole('button', { name: '이동', exact: true }).click();
  await expect(page.locator('.n-breadcrumbs')).not.toContainText('시작하기');
  await page.getByRole('button', { name: '페이지 메뉴', exact: true }).click();
  await page.getByRole('button', { name: '휴지통으로 이동', exact: true }).click();
  await page.getByRole('button', { name: '휴지통', exact: true }).click();
  const trash = page.getByRole('dialog', { name: '휴지통' });
  await expect(trash).toContainText('하위 노트');
  await trash.getByRole('button', { name: '복원', exact: true }).click();
  await expect(page.getByRole('textbox', { name: '페이지 제목' })).toHaveValue('하위 노트');
  await expect(page.getByRole('textbox', { name: '문서 본문' })).toHaveText('보존할 내용');
  await saved(page);
});

test('슬래시 명령·체크박스·토글 ID·표 저장', async ({ page }, info) => {
  await page.goto('/'); await saved(page); await create(page, '블록 시험');
  const body = page.getByRole('textbox', { name: '문서 본문' });
  await body.fill('/');
  await expect(page.getByRole('listbox', { name: '블록 명령' })).toBeVisible();
  await page.screenshot({ path: info.outputPath('slash-menu.png') });
  await body.fill('/todo');
  await expect(page.getByRole('listbox', { name: '블록 명령' })).toBeVisible();
  await body.press('Enter');
  await expect(body.getByRole('checkbox')).toHaveCount(1);
  await body.getByRole('checkbox').check();
  await saved(page); await page.reload();
  await expect(body.getByRole('checkbox')).toBeChecked();
  await body.fill('/toggle');
  await page.getByRole('option', { name: '토글 목록' }).click();
  const toggle = body.locator('[data-type=details]');
  const id = await toggle.getAttribute('data-id');
  await body.getByRole('button', { name: '토글 접기' }).click();
  await expect(toggle).toHaveAttribute('data-id', id!);
  await saved(page); await page.reload();
  await expect(body.getByRole('button', { name: '토글 펼치기' })).toBeVisible();
  await expect(toggle).toHaveAttribute('data-id', id!);
  await body.fill('/table');
  await page.getByRole('option', { name: '표', exact: false }).click();
  await expect(body.locator('table')).toHaveCount(1);
  await saved(page); await page.reload();
  await expect(body.locator('table')).toHaveCount(1);
});

test('블록 메뉴의 이동·복제·삭제와 실행 취소', async ({ page }) => {
  await page.goto('/'); await saved(page); await create(page, '블록 정렬');
  const body = page.getByRole('textbox', { name: '문서 본문' });
  await body.fill('첫 블록'); await body.press('End'); await body.press('Enter'); await page.keyboard.insertText('둘째 블록');
  const original = await body.locator('p').nth(1).getAttribute('data-id');
  await body.locator('p').nth(1).hover();
  await page.getByRole('button', { name: '블록 메뉴', exact: true }).click();
  await page.getByRole('button', { name: '위로 이동', exact: false }).click();
  await expect(body.locator('p').first()).toHaveText('둘째 블록');
  await expect(body.locator('p').first()).toHaveAttribute('data-id', original!);
  await body.press('ControlOrMeta+z');
  await expect(body.locator('p').first()).toHaveText('첫 블록');
  await body.locator('p').nth(1).hover();
  await page.getByRole('button', { name: '블록 메뉴', exact: true }).click();
  await page.getByRole('button', { name: '복제', exact: true }).click();
  await expect(body.locator('p')).toHaveCount(3);
  const ids = await body.locator('p').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-id')));
  expect(new Set(ids).size).toBe(3);
  await body.locator('p').nth(2).hover();
  await page.getByRole('button', { name: '블록 메뉴', exact: true }).click();
  await page.locator('.n-block-menu').getByRole('button', { name: '삭제', exact: true }).click();
  await expect(body.locator('p')).toHaveCount(2);
});

test('드래그로 블록과 페이지를 이동한다', async ({ page }) => {
  await page.goto('/'); await saved(page); await create(page, '드래그 시험');
  const body = page.getByRole('textbox', { name: '문서 본문' });
  await body.fill('첫 줄'); await body.press('End'); await body.press('Enter'); await page.keyboard.insertText('둘째 줄');
  const id = await body.locator('p').nth(1).getAttribute('data-id');
  await body.locator('p').nth(1).hover();
  await page.getByRole('button', { name: '블록 메뉴', exact: true }).dragTo(body.locator('p').first(), { targetPosition: { x: 20, y: 2 } });
  await expect(body.locator('p').first()).toHaveText('둘째 줄');
  await expect(body.locator('p').first()).toHaveAttribute('data-id', id!);
  const source = page.locator('.n-tree-row').filter({ has: page.locator('.n-tree-page').filter({ hasText: '드래그 시험' }) });
  const target = page.locator('.n-tree-page').filter({ hasText: '빠른 메모' });
  await source.dragTo(target);
  await expect(page.locator('.n-breadcrumbs')).toContainText('빠른 메모');
  await saved(page); await page.reload();
  await expect(page.locator('.n-breadcrumbs')).toContainText('빠른 메모');
});

test('이미지와 아이콘·커버를 저장한다', async ({ page }) => {
  await page.goto('/'); await saved(page); await create(page, '이미지 기록');
  await page.getByRole('button', { name: '아이콘 추가', exact: false }).click();
  await page.getByRole('button', { name: '아이콘 🌱', exact: true }).click();
  await page.getByRole('button', { name: '커버 추가', exact: false }).click();
  await page.getByLabel('이미지 파일').setInputFiles({ name: 'pixel.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jO1kAAAAASUVORK5CYII=', 'base64') });
  const image = page.getByRole('textbox', { name: '문서 본문' }).locator('img');
  await expect(image).toHaveAttribute('src', /^data:image\/png;base64,/);
  await saved(page); await page.reload();
  await expect(page.getByRole('button', { name: '페이지 아이콘 변경' })).toHaveText('🌱');
  await expect(page.locator('.n-cover')).toBeVisible();
  await expect(image).toHaveAttribute('alt', 'pixel.png');
});

test('저장 실패는 저장 완료로 표시하지 않으며 재시도할 수 있다', async ({ page, context }) => {
  await page.goto('/'); await saved(page);
  await page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    (window as unknown as { restorePut: () => void }).restorePut = () => { IDBObjectStore.prototype.put = put; };
    IDBObjectStore.prototype.put = () => { throw new DOMException('저장 공간 부족', 'QuotaExceededError'); };
  });
  await page.getByRole('textbox', { name: '페이지 제목' }).fill('실패해도 보존할 변경');
  await expect(page.locator('.n-save-state')).toHaveText('저장 실패');
  await expect(page.locator('.n-storage-error')).toBeVisible();
  const other = await context.newPage(); await other.goto('/');
  await expect(other.getByRole('textbox', { name: '페이지 제목' })).toHaveValue('시작하기');
  await other.close();
  await page.evaluate(() => (window as unknown as { restorePut: () => void }).restorePut());
  await page.getByRole('button', { name: '저장 재시도' }).click();
  await saved(page); await page.reload();
  await expect(page.getByRole('textbox', { name: '페이지 제목' })).toHaveValue('실패해도 보존할 변경');
});

test('두 탭 저장 충돌은 기존 저장본을 덮어쓰지 않는다', async ({ page, context }) => {
  await page.goto('/'); await saved(page);
  const other = await context.newPage(); await other.goto('/'); await saved(other);
  await page.getByRole('textbox', { name: '페이지 제목' }).fill('먼저 저장한 제목'); await saved(page);
  await other.getByRole('textbox', { name: '페이지 제목' }).fill('충돌한 변경');
  await expect(other.locator('.n-storage-error')).toContainText('다른 탭');
  await expect(other.getByRole('textbox', { name: '페이지 제목' })).toHaveValue('충돌한 변경');
  await other.getByRole('button', { name: '저장본으로 교체' }).click();
  await expect(other.getByRole('textbox', { name: '페이지 제목' })).toHaveValue('먼저 저장한 제목');
  await page.reload();
  await expect(page.getByRole('textbox', { name: '페이지 제목' })).toHaveValue('먼저 저장한 제목');
});

test('테마·넓은 본문·모바일 화면', async ({ page }, info) => {
  await page.goto('/'); await saved(page);
  await page.getByRole('button', { name: '설정', exact: true }).click();
  await page.getByRole('button', { name: '다크', exact: true }).click();
  await page.getByRole('button', { name: '설정 닫기' }).click();
  await expect(page.locator('.notion-app')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: '페이지 메뉴', exact: true }).click();
  await page.getByRole('button', { name: '전체 너비', exact: true }).click();
  await page.getByRole('button', { name: '페이지 메뉴 닫기', exact: true }).click();
  await expect(page.locator('.n-document')).toHaveClass(/is-full-width/);
  await page.screenshot({ path: info.outputPath('workspace-dark.png') });
  await saved(page);
  await page.setViewportSize({ width: 390, height: 844 }); await page.reload();
  await expect(page.locator('.notion-app')).toHaveAttribute('data-theme', 'dark');
  await expect(page.locator('.n-document')).toHaveClass(/is-full-width/);
  await expect(page.getByRole('button', { name: '사이드바 열기', exact: true })).toBeVisible();
  await expect(page.getByRole('textbox', { name: '페이지 제목' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: info.outputPath('workspace-mobile.png') });
});

test('작업 공간 JSON은 기존 페이지를 유지하며 사본으로 가져온다', async ({ page }) => {
  await page.goto('/'); await saved(page); await create(page, '보존 원본');
  await page.getByRole('textbox', { name: '문서 본문' }).fill('다운로드와 가져오기 내용');
  await saved(page);
  await page.getByRole('button', { name: '설정', exact: true }).click();
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: '작업 공간 JSON 다운로드', exact: true }).click();
  const file = await downloaded;
  await page.getByRole('button', { name: '설정 닫기' }).click();
  await page.getByLabel('페이지 JSON 가져오기', { exact: true }).setInputFiles((await file.path())!);
  await expect(page.locator('.n-toast')).toContainText('5개 페이지');
  await expect(page.locator('.n-tree-row')).toHaveCount(10);
  await expect(page.getByRole('textbox', { name: '페이지 제목' })).toHaveValue('보존 원본');
  await expect(page.getByRole('textbox', { name: '문서 본문' })).toHaveText('다운로드와 가져오기 내용');
  await saved(page); await page.reload();
  await expect(page.locator('.n-tree-row')).toHaveCount(10);
});
