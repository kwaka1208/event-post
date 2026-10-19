// 入力の文字数の上限（firebase/firestore.next.rules と合わせる）
export const LIMITS = {
  groupName: 100,
  groupDescription: 2000,
  personName: 100,
  reason: 1000,
} as const;
