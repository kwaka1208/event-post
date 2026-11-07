// イベント（events）の読み書き。権限と入力の確認はルール（firebase/firestore.rules）が行う。
// db を引数で受け取るのは、エミュレーターのテスト（tests/rules/）からも同じ関数を使うため。
import {
  Timestamp,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type DocumentSnapshot,
  type Firestore,
} from 'firebase/firestore';

export interface EventDoc {
  id: string;
  title: string;
  /** Markdown */
  body: string;
  startAt: Timestamp;
  endAt: Timestamp;
  /** 申込の締切。入力がなければ開始日時と同じにする */
  deadlineAt: Timestamp;
  venue: string;
  address: string;
  /** null は定員なし */
  capacity: number | null;
  /** false は下書き（管理者だけが見られる） */
  published: boolean;
  /** 申込数。申込とキャンセルで ±1 する（段階 5-B） */
  registrationCount: number;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface EventInput {
  title: string;
  body: string;
  startAt: Date;
  endAt: Date;
  /** null なら開始日時を締切にする */
  deadlineAt: Date | null;
  venue: string;
  address: string;
  capacity: number | null;
  published: boolean;
}

function eventsCol(db: Firestore) {
  return collection(db, 'events');
}

function eventRef(db: Firestore, id: string) {
  return doc(db, 'events', id);
}

function fromSnap(snap: DocumentSnapshot): EventDoc {
  return { ...(snap.data() as Omit<EventDoc, 'id'>), id: snap.id };
}

/** 画面の入力を、保存する項目に変える（申込数・作成日時は含めない） */
function fieldsOf(input: EventInput) {
  return {
    title: input.title,
    body: input.body,
    startAt: Timestamp.fromDate(input.startAt),
    endAt: Timestamp.fromDate(input.endAt),
    deadlineAt: Timestamp.fromDate(input.deadlineAt ?? input.startAt),
    venue: input.venue,
    address: input.address,
    capacity: input.capacity,
    published: input.published,
  };
}

export async function getEvent(db: Firestore, id: string): Promise<EventDoc | null> {
  const snap = await getDoc(eventRef(db, id));
  return snap.exists() ? fromSnap(snap) : null;
}

/** 下書きを含むすべてのイベントを、開始日時の新しい順に返す（管理者だけ） */
export async function listAllEvents(db: Firestore): Promise<EventDoc[]> {
  const snap = await getDocs(query(eventsCol(db), orderBy('startAt', 'desc')));
  return snap.docs.map(fromSnap);
}

/** 公開中のイベントを返す（メンバー）。ルールが通るよう、公開中に絞り込んで読む */
export async function listPublishedEvents(db: Firestore): Promise<EventDoc[]> {
  const snap = await getDocs(query(eventsCol(db), where('published', '==', true)));
  return snap.docs.map(fromSnap);
}

/** イベントを作り、その ID を返す（管理者だけ） */
export async function createEvent(db: Firestore, input: EventInput): Promise<string> {
  const ref = doc(eventsCol(db));
  await setDoc(ref, {
    ...fieldsOf(input),
    registrationCount: 0,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return ref.id;
}

/** イベントを編集する（管理者だけ）。定員を今の申込数より少なくすることはルールで拒否される */
export async function updateEvent(db: Firestore, id: string, input: EventInput): Promise<void> {
  await updateDoc(eventRef(db, id), { ...fieldsOf(input), updatedAt: serverTimestamp() });
}

/** イベントを削除する（管理者だけ）。申込があるイベントはルールで拒否される */
export async function deleteEvent(db: Firestore, id: string): Promise<void> {
  await deleteDoc(eventRef(db, id));
}
