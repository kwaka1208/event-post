// 残席の表示。一覧のバッジと詳細の申込パネルで使う。

/** 残りがこの席数以下なら「残りわずか」にする */
export const FEW_SEATS = 3;

export type SeatState = 'open' | 'few' | 'full' | 'unlimited';

export interface SeatStatus {
  state: SeatState;
  /** 残席数。定員なしなら null */
  remaining: number | null;
  /** バッジの文言 */
  label: string;
}

/** 定員（null＝無制限）と申込数から残席の状態を求める */
export function seatStatus(capacity: number | null, count: number): SeatStatus {
  if (capacity === null) return { state: 'unlimited', remaining: null, label: '定員なし' };
  const remaining = Math.max(capacity - count, 0);
  if (remaining === 0) return { state: 'full', remaining, label: '満席' };
  if (remaining <= FEW_SEATS) return { state: 'few', remaining, label: `残りわずか ${remaining} 席` };
  return { state: 'open', remaining, label: `残り ${remaining} 席` };
}
