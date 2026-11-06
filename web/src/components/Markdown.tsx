import { useMemo } from 'react';
import { renderMarkdown } from '@/lib/markdown';

export function Markdown({ text }: { text: string }) {
  const html = useMemo(() => renderMarkdown(text), [text]);
  // renderMarkdown が DOMPurify で取り除いてから返す
  return <div className="markdown" dangerouslySetInnerHTML={{ __html: html }} />;
}
