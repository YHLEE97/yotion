import { describe, expect, it } from 'vitest';
import { MAX_DOCUMENT_BYTES, MAX_DOCUMENT_DEPTH, MAX_DOCUMENT_NODES, parseDocument, serializeDocument } from '../lib/document';

function paragraph(id = 'block-1', text = '한글 문서 🎈') {
  return { type: 'paragraph', attrs: { id }, content: [{ type: 'text', text, marks: [{ type: 'bold' }] }] };
}
function raw(content: unknown, schemaVersion = 1) { return JSON.stringify({ schemaVersion, content }); }
function document() { return { type: 'doc', content: [paragraph()] }; }

describe('문서 JSON 계약', () => {
  it('본문·서식·ID를 왕복 보존한다', () => {
    const source = document();
    const result = parseDocument(serializeDocument(source));
    expect(result.document).toEqual({ schemaVersion: 1, content: source });
    expect(result.blocks).toBe(1);
    expect(result.text).toBe('한글 문서 🎈');
  });
  it.each([
    ['잘못된 JSON', '{', 'JSON'],
    ['미지원 버전', raw(document(), 2), '버전'],
    ['문서 아닌 루트', raw(paragraph()), 'doc'],
    ['빈 문서 구조', raw({ type: 'doc', content: [] }), '계층'],
    ['미지원 블록', raw({ type: 'doc', content: [{ type: 'unknown' }] }), '블록 종류'],
    ['미지원 서식', raw({ type: 'doc', content: [{ ...paragraph(), content: [{ type: 'text', text: '원문', marks: [{ type: 'unknown' }] }] }] }), '서식'],
    ['중복 ID', raw({ type: 'doc', content: [paragraph(), paragraph()] }), '중복'],
    ['누락 ID', raw({ type: 'doc', content: [{ type: 'paragraph' }] }), 'ID'],
    ['미지원 속성', raw({ type: 'doc', content: [{ ...paragraph(), attrs: { id: 'test', secret: 1 } }] }), '미지원 속성'],
    ['부적합 계층', raw({ type: 'doc', content: [{ type: 'text', text: '문단 없음' }] }), '계층'],
    ['잘못된 제목 수준', raw({ type: 'doc', content: [{ type: 'heading', attrs: { id: 'h', level: 99 } }] }), '제목 수준'],
    ['스크립트 링크', raw({ type: 'doc', content: [{ ...paragraph(), content: [{ type: 'text', text: '링크', marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }] }] }] }), '링크 주소'],
    ['객체 링크', raw({ type: 'doc', content: [{ ...paragraph(), content: [{ type: 'text', text: '링크', marks: [{ type: 'link', attrs: { href: {} } }] }] }] }), '속성'],
  ])('%s를 거부한다', (_label, source, error) => {
    expect(() => parseDocument(source)).toThrow(error);
  });
  it('UTF-8 바이트 크기를 제한한다', () => {
    expect(() => parseDocument(raw({ type: 'doc', content: [paragraph('large', '가'.repeat(MAX_DOCUMENT_BYTES / 2))] }))).toThrow('2 MiB');
  });
  it('과도한 노드 수를 제한한다', () => {
    const content = Array.from({ length: MAX_DOCUMENT_NODES / 2 + 1 }, (_, index) => paragraph(`p-${index}`, 'x'));
    // 바이트 상한과 별개로 노드 상한도 적용한다.
    expect(() => parseDocument(raw({ type: 'doc', content }))).toThrow('20,000');
  });
  it('과도한 중첩을 제한한다', () => {
    let nested: object = paragraph();
    for (let i = 0; i <= MAX_DOCUMENT_DEPTH; i++) nested = { type: 'blockquote', attrs: { id: `quote-${i}` }, content: [nested] };
    expect(() => parseDocument(raw({ type: 'doc', content: [nested] }))).toThrow('64단계');
  });
});
