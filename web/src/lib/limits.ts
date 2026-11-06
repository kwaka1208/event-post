// 入力の文字数などの上限（firebase/firestore.next.rules と合わせる）
export const LIMITS = {
  groupName: 100,
  groupDescription: 2000,
  personName: 100,
  reason: 1000,
  eventTitle: 100,
  eventBody: 10000,
  eventVenue: 100,
  eventAddress: 200,
  /** 定員の上限（下限は 1。定員なしは null） */
  eventCapacity: 10000,
} as const;
