// ブラウザ側の Firebase 初期化。config.yml の firebase はビルド時に埋め込まれる（astro.config.ts）。
// loadConfig() は Node 専用なので、ここからは import しないこと。
// 開発サーバー（npm run dev）では、npm run emulators で起動したエミュレーターに接続する。
import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, GoogleAuthProvider } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { EMULATOR_PROJECT_ID } from '@/consts';

const useEmulator = import.meta.env.DEV;

const app = initializeApp(
  useEmulator ? { ...__FIREBASE_CONFIG__, projectId: EMULATOR_PROJECT_ID } : __FIREBASE_CONFIG__,
);

export const auth = getAuth(app);
export const db = getFirestore(app);
export const googleProvider = new GoogleAuthProvider();

if (useEmulator) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
}
