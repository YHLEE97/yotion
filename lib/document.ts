import { getSchema, type JSONContent } from '@tiptap/core';
import { blockTypes, extensions } from './editor';
import { isSupportedLink } from './link';

export const MAX_DOCUMENT_BYTES = 2 * 1024 * 1024;
export const MAX_DOCUMENT_NODES = 20_000;
export const MAX_DOCUMENT_DEPTH = 64;
export const storageKey = 'yotion:spike:document:v1';
export const recoveryKey = 'yotion:spike:before-restore:v1';

export type DocumentEnvelope = { schemaVersion: 1; content: JSONContent };
export type DocumentPreview = {
  document: DocumentEnvelope;
  blocks: number;
  text: string;
};

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function fail(message: string): never { throw new Error(message); }

// 외부 JSON을 편집기에 전달하기 전에 구조 전체를 검증한다.
// 미지원 노드·속성을 정제 과정에서 조용히 삭제하지 않는다.
export function parseDocument(raw: string): DocumentPreview {
  if (new TextEncoder().encode(raw).byteLength > MAX_DOCUMENT_BYTES) fail('문서 파일은 2 MiB 이하여야 합니다.');
  let envelope: unknown;
  try { envelope = JSON.parse(raw); } catch { fail('올바른 JSON 파일이 아닙니다.'); }
  if (!record(envelope) || envelope.schemaVersion !== 1) fail('지원하는 문서 버전은 schemaVersion 1입니다.');
  if (Object.keys(envelope).some(key => !['schemaVersion', 'content'].includes(key))) fail('지원하지 않는 문서 필드가 있습니다.');
  if (!record(envelope.content) || envelope.content.type !== 'doc') fail('문서 최상위 노드는 doc이어야 합니다.');

  const schema = getSchema(extensions());
  const ids = new Set<string>();
  let nodes = 0;
  let blocks = 0;
  function attributes(value: unknown, spec: Record<string, unknown> | undefined, owner: string) {
    if (value === undefined) return;
    if (!record(value)) fail(`${owner}: 속성 형식이 올바르지 않습니다.`);
    for (const [key, entry] of Object.entries(value)) {
      if (!spec || !Object.hasOwn(spec, key)) fail(`${owner}: 미지원 속성 ${key}`);
      if (key === 'colwidth' && Array.isArray(entry) && entry.every(item => Number.isInteger(item) && item > 0)) continue;
      if (key === 'colwidth' && entry !== null) fail('표 열 너비가 올바르지 않습니다.');
      if (entry !== null && !['string', 'number', 'boolean'].includes(typeof entry)) fail(`${owner}: 속성 ${key}의 값이 올바르지 않습니다.`);
      if (key === 'level' && (!Number.isInteger(entry) || Number(entry) < 1 || Number(entry) > 6)) fail('제목 수준은 1~6이어야 합니다.');
      if (key === 'start' && (!Number.isSafeInteger(entry) || Number(entry) < 1)) fail('번호 목록 시작 값은 양의 정수여야 합니다.');
      if (['language', 'type', 'target', 'rel', 'class', 'title'].includes(key) && entry !== null && typeof entry !== 'string') fail(`${owner}: ${key}는 문자열이어야 합니다.`);
      if (key === 'href' && !isSupportedLink(entry)) fail('지원하지 않는 링크 주소입니다.');
      if (['checked', 'open'].includes(key) && typeof entry !== 'boolean') fail(`${owner}: ${key}는 불리언이어야 합니다.`);
      if (['colspan', 'rowspan'].includes(key) && (!Number.isInteger(entry) || Number(entry) < 1 || Number(entry) > 100)) fail('표 셀 병합 크기가 올바르지 않습니다.');
      if (['width', 'height'].includes(key) && entry !== null && (!Number.isInteger(entry) || Number(entry) < 1 || Number(entry) > 10000)) fail('이미지 크기가 올바르지 않습니다.');
      if (key === 'src' && (typeof entry !== 'string' || !/^(https?:\/\/[^\s]+|data:image\/(png|jpeg|gif|webp|avif);base64,[A-Za-z0-9+/=]+)$/.test(entry))) fail('지원하지 않는 이미지 주소입니다.');
    }
  }
  function visit(value: unknown, depth: number) {
    if (depth > MAX_DOCUMENT_DEPTH) fail('문서 중첩은 64단계 이하여야 합니다.');
    if (++nodes > MAX_DOCUMENT_NODES) fail('문서 노드가 20,000개를 초과합니다.');
    if (!record(value) || typeof value.type !== 'string' || !Object.hasOwn(schema.nodes, value.type)) fail('지원하지 않는 블록 종류입니다.');
    if (Object.keys(value).some(key => !['type', 'attrs', 'content', 'marks', 'text'].includes(key))) fail('지원하지 않는 블록 필드가 있습니다.');
    const type = schema.nodes[value.type];
    attributes(value.attrs, type.spec.attrs, value.type);
    if (value.type === 'text') {
      if (typeof value.text !== 'string' || value.text.length === 0 || value.content !== undefined) fail('텍스트 노드가 올바르지 않습니다.');
    } else if (value.text !== undefined) fail('텍스트는 text 노드에만 지정할 수 있습니다.');
    if (blockTypes.includes(value.type)) {
      const id = record(value.attrs) ? value.attrs.id : undefined;
      if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) fail('모든 블록에 유효한 ID가 필요합니다.');
      if (ids.has(id)) fail('문서에 중복된 블록 ID가 있습니다.');
      ids.add(id);
      blocks++;
    }
    if (value.marks !== undefined) {
      if (!Array.isArray(value.marks)) fail('서식 목록이 올바르지 않습니다.');
      for (const mark of value.marks) {
        if (!record(mark) || typeof mark.type !== 'string' || !Object.hasOwn(schema.marks, mark.type)) fail('지원하지 않는 서식입니다.');
        if (Object.keys(mark).some(key => !['type', 'attrs'].includes(key))) fail('지원하지 않는 서식 필드가 있습니다.');
        attributes(mark.attrs, schema.marks[mark.type].spec.attrs, mark.type);
        if (mark.type === 'link' && (!record(mark.attrs) || typeof mark.attrs.href !== 'string')) fail('링크 주소가 필요합니다.');
      }
    }
    if (value.content !== undefined) {
      if (!Array.isArray(value.content)) fail('블록 내용은 배열이어야 합니다.');
      value.content.forEach(child => visit(child, depth + 1));
    }
  }
  visit(envelope.content, 0);
  try {
    const node = schema.nodeFromJSON(envelope.content);
    node.check();
    return {
      document: { schemaVersion: 1, content: node.toJSON() },
      blocks,
      text: node.textBetween(0, node.content.size, '\n').slice(0, 2000),
    };
  } catch { fail('블록의 계층 또는 서식 구조가 올바르지 않습니다.'); }
}

export function serializeDocument(content: JSONContent): string {
  const raw = JSON.stringify({ schemaVersion: 1, content });
  parseDocument(raw);
  return raw;
}
