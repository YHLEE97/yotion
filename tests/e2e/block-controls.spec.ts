import { expect, test, type Page } from '@playwright/test';

async function prepare(page: Page) {
  await page.goto('/');
  await expect(page.getByRole('textbox', { name: '문서 본문' })).toBeEditable();
  await page.getByRole('button', { name: '새 페이지', exact: true }).click();
  await page.getByRole('textbox', { name: '페이지 제목' }).fill('블록 버튼 시험');
  const body = page.getByRole('textbox', { name: '문서 본문' });
  await body.fill('첫 번째 블록'); await body.press('End'); await body.press('Enter'); await page.keyboard.insertText('두 번째 블록');
  return body;
}

test('본문에서 왼쪽 여백을 지나 + 버튼까지 이동하고 블록을 추가한다', async ({ page }) => {
  const body = await prepare(page);
  const block = (await body.locator('p').first().boundingBox())!;
  const y = block.y + 12;
  await page.mouse.move(block.x + 50, y);
  const add = page.getByRole('button', { name: '아래에 블록 추가', exact: true });
  await expect(add).toBeVisible();
  const button = (await add.boundingBox())!;
  // locator.click()의 자동 이동으로 건너뛰지 않고 실제 빈 여백을 통과한다.
  await page.mouse.move(block.x - 2, y, { steps: 12 });
  await expect(add).toBeVisible();
  await page.mouse.move(button.x + button.width / 2, button.y + button.height / 2, { steps: 12 });
  await expect(add).toBeVisible();
  await page.mouse.click(button.x + button.width / 2, button.y + button.height / 2);
  await expect(page.getByRole('listbox', { name: '블록 명령' })).toBeVisible();
  await page.getByRole('option', { name: '텍스트', exact: false }).click();
  await expect(body.locator('p')).toHaveText(['첫 번째 블록', '', '두 번째 블록']);
});

for (const width of [1280, 390]) {
  test(`${width}px 화면에서 여백을 지나 블록 핸들을 클릭하고 이동한다`, async ({ page }) => {
    const body = await prepare(page);
    if (width === 390) await page.getByRole('button', { name: '사이드바 접기', exact: true }).click();
    await page.setViewportSize({ width, height: 900 });
    const block = (await body.locator('p').nth(1).boundingBox())!;
    const id = await body.locator('p').nth(1).getAttribute('data-id');
    await page.mouse.move(block.x + 40, block.y + 12);
    const handle = page.getByRole('button', { name: '블록 메뉴', exact: true });
    await expect(handle).toBeVisible();
    const button = (await handle.boundingBox())!;
    await page.mouse.move(block.x - 2, block.y + 12, { steps: 12 });
    await expect(handle).toBeVisible();
    await page.mouse.move(button.x + button.width / 2, button.y + button.height / 2, { steps: 12 });
    await expect(handle).toBeVisible();
    await page.mouse.click(button.x + button.width / 2, button.y + button.height / 2);
    await page.locator('.n-block-menu').getByRole('button', { name: '위로 이동', exact: false }).click();
    await expect(body.locator('p')).toHaveText(['두 번째 블록', '첫 번째 블록']);
    await expect(body.locator('p').first()).toHaveAttribute('data-id', id!);
    await body.press('ControlOrMeta+z');
    await expect(body.locator('p')).toHaveText(['첫 번째 블록', '두 번째 블록']);
    // 편집 영역을 완전히 떠나면 핸들을 닫는다.
    await body.locator('p').first().hover();
    await expect(handle).toBeVisible();
    await page.getByRole('textbox', { name: '페이지 제목' }).hover();
    await expect(handle).toHaveCount(0);
  });
}

test('여백을 지나 핸들을 잡아 드래그해도 블록 ID를 유지한다', async ({ page }) => {
  const body = await prepare(page);
  const block = (await body.locator('p').nth(1).boundingBox())!;
  const id = await body.locator('p').nth(1).getAttribute('data-id');
  await page.mouse.move(block.x + 50, block.y + 12);
  const handle = page.getByRole('button', { name: '블록 메뉴', exact: true });
  await expect(handle).toBeVisible();
  const button = (await handle.boundingBox())!;
  await page.mouse.move(block.x - 2, block.y + 12, { steps: 12 });
  await expect(handle).toBeVisible();
  await page.mouse.move(button.x + button.width / 2, button.y + button.height / 2, { steps: 12 });
  await page.mouse.down();
  const target = (await body.locator('p').first().boundingBox())!;
  await page.mouse.move(target.x + 25, target.y + 2, { steps: 20 });
  await page.mouse.up();
  await expect(body.locator('p')).toHaveText(['두 번째 블록', '첫 번째 블록']);
  await expect(body.locator('p').first()).toHaveAttribute('data-id', id!);
});
