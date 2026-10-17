// Astro のページから使うイベント取得処理
import { getCollection, type CollectionEntry } from 'astro:content';
import { eventTimes, type EventTimes } from './event';

export type EventEntry = CollectionEntry<'events'> & { times: EventTimes };

/** 公開中のイベントを開催日時の昇順で返す */
export async function getPublishedEvents(): Promise<EventEntry[]> {
  const entries = await getCollection('events', ({ data }) => data.published);
  return entries
    .map((e) => ({ ...e, times: eventTimes(e.data) }))
    .sort((a, b) => a.times.startAt.getTime() - b.times.startAt.getTime());
}
