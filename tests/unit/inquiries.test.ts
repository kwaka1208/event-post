import { describe, expect, it } from 'vitest';
import { replyHref } from '../../web/src/lib/inquiries';

describe('replyHref', () => {
  it('送った人宛てで、件名に「Re: 」を付けた mailto: リンクを作る', () => {
    expect(replyHref({ email: 'hanako@example.com', subject: '次回の持ち物 & 時間' })).toBe(
      `mailto:hanako@example.com?subject=${encodeURIComponent('Re: 次回の持ち物 & 時間')}`,
    );
  });
});
