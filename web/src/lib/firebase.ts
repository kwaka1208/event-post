// ブラウザ側の Firebase 初期化。
// 本番（GitHub Pages）では、ビルドするときに環境変数 VITE_FIREBASE_* で渡した設定を埋め込む。
// どれも Firebase の Web 設定で、公開してよい値。値の出どころ（設定ファイルやワークフロー）は段階 8 で決める。
// 開発サーバー（npm run dev）では、npm run emulators で起動したエミュレーターに接続する
// （ポートは firebase/firebase.json と合わせる）。
import { initializeApp, type FirebaseOptions } from 'firebase/app';
import { connectAuthEmulator, getAuth, GoogleAuthProvider } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { EMULATOR_PROJECT_ID } from '@/consts';

const useEmulator = import.meta.env.DEV;

function loadOptions(): FirebaseOptions {
  if (useEmulator) return { apiKey: 'demo-key', authDomain: 'localhost', projectId: EMULATOR_PROJECT_ID };
  const env = import.meta.env;
  const options = {
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    appId: env.VITE_FIREBASE_APP_ID,
  };
  const missing = Object.entries(options).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length > 0) throw new Error(`Firebase の設定がありません（${missing.join('、')}）`);
  return options;
}

const app = initializeApp(loadOptions());

export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();

if (useEmulator) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9199', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8180);
}
