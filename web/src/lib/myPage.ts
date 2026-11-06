// マイページに出すイベントの分け方。申し込んだイベントを、これから（終了前）と参加した（終了後）に分ける
import type { EventDoc } from './events';
import type { MyRegistration } from './registrations';

export interface MyEvent {
  event: EventDoc;
  registration: MyRegistration;
}

export interface MyEvents {
  /** 開始日時の早い順 */
  upcoming: MyEvent[];
  /** 開始日時の新しい順 */
  past: MyEvent[];
  /** 申し込んだあとに下書きに戻されたなどで、読めないイベントの数 */
  hiddenCount: number;
}

/** events は申込のイベント ID ごとの内容。読めなかったイベントは null */
export function splitMyEvents(registrations: MyRegistration[], events: Map<string, EventDoc | null>, now: Date): MyEvents {
  const upcoming: MyEvent[] = [];
  const past: MyEvent[] = [];
  let hiddenCount = 0;
  for (const registration of registrations) {
    const event = events.get(registration.eventId) ?? null;
    if (!event || !event.published) {
      hiddenCount += 1;
      continue;
    }
    (event.endAt.toMillis() > now.getTime() ? upcoming : past).push({ event, registration });
  }
  upcoming.sort((a, b) => a.event.startAt.toMillis() - b.event.startAt.toMillis());
  past.sort((a, b) => b.event.startAt.toMillis() - a.event.startAt.toMillis());
  return { upcoming, past, hiddenCount };
}
