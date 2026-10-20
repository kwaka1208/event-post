// ブラウザ側の Firebase 初期化。
// 本番では Firebase Hosting が配信する /__/firebase/init.json から設定を読むので、設定ファイルは要らない。
// 開発サーバー（npm run web:dev）では、npm run emulators:next で起動したエミュレーターに接続する
// （ポートは firebase/firebase.next.json と合わせる）。
import { initializeApp, type FirebaseOptions } from 'firebase/app';
import { connectAuthEmulator, getAuth, GoogleAuthProvider } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { EMULATOR_PROJECT_ID } from '@/consts';

const useEmulator = import.meta.env.DEV;

async function loadOptions(): Promise<FirebaseOptions> {
  if (useEmulator) return { apiKey: 'demo-key', authDomain: 'localhost', projectId: EMULATOR_PROJECT_ID };
  const res = await fetch('/__/firebase/init.json');
  if (!res.ok) throw new Error(`Firebase の設定を読み込めませんでした（${res.status}）`);
  return res.json();
}

const app = initializeApp(await loadOptions());

export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();

if (useEmulator) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9199', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8180);
}
