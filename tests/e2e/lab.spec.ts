import { expect, test } from '@playwright/test';

test('한글 텍스트 로컬 저장과 새로고침 후 복원', async ({ page }) => {
  await page.goto('/lab');
  const body = page.getByRole('textbox', { name: '문서 본문' });
  await expect(body).toBeVisible();
  await expect(body).toBeEditable();
  await body.fill('한글 저장 실험');
  await page.getByRole('button', { name: '로컬 저장', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('이 브라우저에 저장됨');
  await page.reload();
  await page.getByRole('button', { name: '저장본 불러오기' }).click();
  await page.getByRole('button', { name: '현재 문서에 적용' }).click();
  await expect(body).toHaveText('한글 저장 실험');
});

test('드롭 입력 관찰·텍스트 표시·기록 삭제', async ({ page }) => {
  await page.goto('/lab');
  await page.getByRole('button', { name: '드롭 · 클립보드' }).click();
  const zone = page.getByRole('region', { name: '드롭 및 붙여넣기 관찰 영역' });
  await zone.evaluate(element => {
    const transfer = new DataTransfer();
    transfer.setData('text/html', '<img src=x onerror="window.__unsafe = true">');
    transfer.setData('text/plain', '관찰 테스트');
    element.dispatchEvent(new DragEvent('drop', { bubbles: true, dataTransfer: transfer }));
  });
  await expect(page.locator('.sample')).toContainText('관찰 테스트');
  await expect(page.locator('.sample img')).toHaveCount(0);
  await page.getByRole('button', { name: '기록 비우기' }).click();
  await expect(page.getByText('아직 관찰한 입력이 없습니다.')).toBeVisible();
});

test('목록 키보드 중첩과 조합 중 도구 비활성화', async ({ page }) => {
  await page.goto('/lab');
  const body = page.getByRole('textbox', { name: '문서 본문' });
  await expect(body).toBeVisible();
  await expect(body).toBeEditable();
  await body.locator('li').nth(1).locator('p').click();
  await expect(body).toBeFocused();
  await expect.poll(() => page.evaluate(() => window.getSelection()?.anchorNode?.textContent))
    .toBe('Tab과 Shift+Tab으로 들여쓰기 조절하기');
  await expect(page.locator('.document')).not.toHaveAttribute('data-selection-from', '1');
  await page.keyboard.press('Tab');
  await expect(body.locator('li li')).toHaveCount(1);
  await page.keyboard.press('Shift+Tab');
  await expect(body.locator('li li')).toHaveCount(0);
  // 합성 이벤트는 UI 보호만 검증한다. 실제 한글 IME 시험은 별도다.
  await body.dispatchEvent('compositionstart');
  await expect(page.getByRole('button', { name: '로컬 저장', exact: true })).toBeDisabled();
  await body.dispatchEvent('compositionend');
  await expect(page.getByRole('button', { name: '로컬 저장', exact: true })).toBeEnabled();
});

test('JSON 다운로드·미리보기·적용과 교체 전 복구', async ({ page }) => {
  await page.goto('/lab');
  const body = page.getByRole('textbox', { name: '문서 본문' });
  await expect(body).toBeEditable();
  await body.fill('파일로 돌아올 문서');
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'JSON 다운로드' }).click();
  const download = await downloadEvent;
  const path = await download.path();
  const originalIds = await body.locator('[data-id]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-id')));
  await body.fill('교체 전 작성 중이던 문서');
  await page.getByLabel('문서 JSON 파일').setInputFiles(path!);
  await expect(page.getByRole('region', { name: '문서 가져오기 미리보기' })).toContainText('파일로 돌아올 문서');
  await expect(body).toHaveText('교체 전 작성 중이던 문서');
  await page.getByRole('button', { name: '현재 문서에 적용' }).click();
  await expect(body).toHaveText('파일로 돌아올 문서');
  expect(await body.locator('[data-id]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-id')))).toEqual(originalIds);
  await page.reload();
  await page.getByRole('button', { name: '교체 전 복구본', exact: true }).click();
  await page.getByRole('button', { name: '현재 문서에 적용' }).click();
  await expect(body).toHaveText('교체 전 작성 중이던 문서');
});

test('손상 파일·저장본과 취소는 현재 본문을 바꾸지 않는다', async ({ page }) => {
  await page.goto('/lab');
  const body = page.getByRole('textbox', { name: '문서 본문' });
  await expect(body).toBeEditable();
  await body.fill('유지할 본문');
  await page.getByRole('button', { name: '로컬 저장', exact: true }).click();
  await page.getByRole('button', { name: '저장본 불러오기' }).click();
  await page.getByRole('button', { name: '취소', exact: true }).click();
  await expect(page.getByRole('region', { name: '문서 가져오기 미리보기' })).toHaveCount(0);
  await page.getByLabel('문서 JSON 파일').setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{') });
  await expect(page.getByRole('alert').filter({ hasText: '올바른 JSON' })).toBeVisible();
  await expect(body).toHaveText('유지할 본문');
  await page.evaluate(() => localStorage.setItem('yotion:spike:document:v1', '{"schemaVersion":1,"content":{"type":"doc","content":[]}}'));
  await page.getByRole('button', { name: '저장본 불러오기' }).click();
  await expect(page.getByRole('alert').filter({ hasText: '계층' })).toBeVisible();
  await expect(body).toHaveText('유지할 본문');
});

test('복구본 저장 실패 시 가져오기를 적용하지 않는다', async ({ page }) => {
  await page.goto('/lab');
  const body = page.getByRole('textbox', { name: '문서 본문' });
  await expect(body).toBeEditable();
  await body.fill('저장했던 본문');
  await page.getByRole('button', { name: '로컬 저장', exact: true }).click();
  await body.fill('아직 저장하지 않은 본문');
  await page.getByRole('button', { name: '저장본 불러오기' }).click();
  await page.evaluate(() => { Storage.prototype.setItem = () => { throw new DOMException('quota', 'QuotaExceededError'); }; });
  await page.getByRole('button', { name: '현재 문서에 적용' }).click();
  await expect(page.getByRole('alert').filter({ hasText: '저장 공간' })).toBeVisible();
  await expect(body).toHaveText('아직 저장하지 않은 본문');
});
