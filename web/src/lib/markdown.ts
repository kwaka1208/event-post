// イベントの本文（Markdown）を HTML にする。管理者が書いた文でも、危ないタグや属性は DOMPurify で取り除く
import DOMPurify from 'dompurify';
import { marked } from 'marked';

// 外部へのリンクは新しいタブで開く
DOMPurify.addHook('afterSanitizeAttributes', (node) => {
  if (node.tagName === 'A' && node.getAttribute('href')?.match(/^https?:/)) {
    node.setAttribute('target', '_blank');
    node.setAttribute('rel', 'noopener noreferrer');
  }
});

export function renderMarkdown(text: string): string {
  // breaks：1 回の改行でも改行として表示する（Markdown に慣れていない人も書きやすいように）
  const html = marked.parse(text, { async: false, gfm: true, breaks: true });
  return DOMPurify.sanitize(html);
}
