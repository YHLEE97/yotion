import { describe, expect, it } from 'vitest';
import { captureTransfer } from '../lib/transfer';

describe('입력 관찰', () => {
  it('HTML을 실행하지 않고 원문으로 기록하고 큰 입력의 잘림을 표시한다', () => {
    const data = {
      types: ['text/html', 'text/plain', 'Files'],
      items: [{ kind: 'string', type: 'text/html' }],
      files: [{ name: '테스트.txt', type: 'text/plain', size: 6, lastModified: 123 }],
      getData: (type: string) => type === 'text/html' ? '<script>alert(1)</script>' : '가'.repeat(40_000),
    } as unknown as DataTransfer;
    const result = captureTransfer(data, 'paste');
    expect(result.strings[0].value).toBe('<script>alert(1)</script>');
    expect(result.strings[1].value.length).toBe(32_768);
    expect(result.strings[1].truncated).toBe(true);
    expect(result.files[0].name).toBe('테스트.txt');
    expect(result.strings).toHaveLength(2);
  });
});
