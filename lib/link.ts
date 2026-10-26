// 편집기가 생성하는 링크와 JSON 가져오기에 동일한 주소 규칙을 사용한다.
export function isSupportedLink(value: unknown): value is string {
  return typeof value === 'string'
    && !/[\u0000-\u0020\u007f]/.test(value)
    && /^(https?:\/\/|ftps?:\/\/|mailto:|tel:|callto:|sms:|cid:|xmpp:|\/(?!\/)|#)/i.test(value);
}
