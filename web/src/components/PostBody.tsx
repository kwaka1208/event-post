// 掲示板の投稿の本文。改行をそのまま出し、http(s) の URL をリンクにする。
// HTML としては解釈しない（React の文字列として出すので、タグは文字のまま表示される）
import { splitLinks } from '@/lib/linkify';

export function PostBody({ text }: { text: string }) {
  return (
    <p className="pre-wrap post-body">
      {splitLinks(text).map((part, i) =>
        part.url ? (
          <a key={i} href={part.text} target="_blank" rel="noopener noreferrer">
            {part.text}
          </a>
        ) : (
          part.text
        ),
      )}
    </p>
  );
}
