// 文章の中の http(s) の URL を見つけて、リンクにする部分と文字のままの部分に分ける
export interface TextPart {
  text: string;
  url: boolean;
}

// 空白と全角の文字、括弧や引用符までを URL とみなす
const URL_PATTERN = /https?:\/\/[^\s<>"'（）「」『』、。　-ヿ一-鿿＀-￯]+/g;
// 文の終わりに付きやすい記号は、URL に含めない
const TRAILING = /[.,!?:;)\]]+$/;

export function splitLinks(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let last = 0;
  for (const m of text.matchAll(URL_PATTERN)) {
    const url = m[0].replace(TRAILING, '');
    const start = m.index;
    if (start > last) parts.push({ text: text.slice(last, start), url: false });
    parts.push({ text: url, url: true });
    last = start + url.length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), url: false });
  return parts;
}
