// 入力の文字数などの上限（firebase/firestore.rules と合わせる）
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
  mailSubject: 200,
  mailBody: 10000,
  /** 1 通のメールの宛先の上限（Gmail の 1 日の送信上限が約 500 通のため） */
  mailRecipients: 500,
} as const;
