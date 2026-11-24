import { describe, expect, it } from 'vitest';
import { gmailReplyHref, replyHref } from '../../web/src/lib/inquiries';

describe('replyHref', () => {
  it('送った人宛てで、件名に「Re: 」を付けた mailto: リンクを作る', () => {
    expect(replyHref({ email: 'hanako@example.com', subject: '次回の持ち物 & 時間' })).toBe(
      `mailto:hanako@example.com?subject=${encodeURIComponent('Re: 次回の持ち物 & 時間')}`,
    );
  });
});

describe('gmailReplyHref', () => {
  it('Gmail の作成画面を、宛先と「Re: 」付きの件名を入れて開くリンクを作る', () => {
    const url = new URL(gmailReplyHref({ email: 'hanako@example.com', subject: '次回の持ち物 & 時間' }));
    expect(url.origin + url.pathname).toBe('https://mail.google.com/mail/');
    expect(url.searchParams.get('view')).toBe('cm');
    expect(url.searchParams.get('fs')).toBe('1');
    expect(url.searchParams.get('to')).toBe('hanako@example.com');
    expect(url.searchParams.get('su')).toBe('Re: 次回の持ち物 & 時間');
  });
});
