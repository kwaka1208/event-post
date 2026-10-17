import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { eventSchema } from '@/lib/schema';
import { assertEventId } from '@/lib/event';
import { siteDir } from '@/lib/config';

// イベントは site/events/*.md（グループが編集する場所）から読む
const events = defineCollection({
  loader: glob({
    pattern: '*.md',
    base: `${siteDir()}/events`,
    // ファイル名（拡張子なし）をそのまま ID にする（既定の slug 化をしない）
    generateId: ({ entry }) => {
      const id = entry.replace(/\.md$/, '');
      assertEventId(id);
      return id;
    },
  }),
  schema: eventSchema,
});

export const collections = { events };
