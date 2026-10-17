import { describe, expect, it } from 'vitest';
import { CSV_BOM, csvCell, registrationsCsv, toCsv } from '../../app/src/lib/csv';
import type { EventField } from '../../app/src/lib/schema';
import { jstDateTime } from '../../app/src/lib/time';

describe('csvCell', () => {
  it('普通の値はそのまま', () => {
    expect(csvCell('山田 花子')).toBe('山田 花子');
    expect(csvCell(3)).toBe('3');
    expect(csvCell(-3)).toBe('-3');
    expect(csvCell(undefined)).toBe('');
    expect(csvCell(null)).toBe('');
  });

  it('カンマ・改行・ダブルクォートを含む値は囲んでエスケープする', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('1行目\n2行目')).toBe('"1行目\n2行目"');
    expect(csvCell('1行目\r\n2行目')).toBe('"1行目\r\n2行目"');
    expect(csvCell('"引用"です')).toBe('"""引用""です"');
  });

  it('数式とみなされる先頭文字には \' を付ける', () => {
    expect(csvCell('=1+1')).toBe("'=1+1");
    expect(csvCell('+81')).toBe("'+81");
    expect(csvCell('-x')).toBe("'-x");
    expect(csvCell('@SUM(A1)')).toBe("'@SUM(A1)");
    expect(csvCell('\tx')).toBe("'\tx");
    expect(csvCell('=HYPERLINK("http://x","y")')).toBe(`"'=HYPERLINK(""http://x"",""y"")"`);
  });
});

describe('toCsv', () => {
  it('BOM を先頭に付け、CRLF で区切る', () => {
    expect(toCsv([['a', 'b'], [1, '']])).toBe(`${CSV_BOM}a,b\r\n1,\r\n`);
  });
});

describe('registrationsCsv', () => {
  const fields: EventField[] = [
    { id: 'grade', label: '学年', type: 'select', options: ['小1', '小2'], required: true },
    { id: 'note', label: '連絡事項', type: 'textarea', required: false },
  ];

  it('列は fields から作り、未回答の項目と未送信の日時は空欄にする', () => {
    const csv = registrationsCsv(fields, [
      {
        name: '山田 花子',
        email: 'hanako@example.com',
        answers: { grade: '小1' },
        createdAt: jstDateTime('2026-10-17', '14:02'),
        confirmationSentAt: jstDateTime('2026-10-17', '15:00'),
        remindedAt: null,
      },
    ]);
    expect(csv).toBe(
      CSV_BOM +
        'お名前,メールアドレス,学年,連絡事項,申込日時,受付メール送信日時,リマインド送信日時\r\n' +
        '山田 花子,hanako@example.com,小1,,2026/10/17 14:02,2026/10/17 15:00,\r\n',
    );
  });
});
