// Actions のスクリプトから Firestore に接続する。
// 認証は Application Default Credentials（Actions では google-github-actions/auth が設定する）。
// FIRESTORE_EMULATOR_HOST があればエミュレーターに接続する。プロジェクト ID は開発用の demo-event-post にする
// （npm run emulators と、開発サーバーのブラウザ側が同じ ID を使うため）。
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { EMULATOR_PROJECT_ID } from '../../app/src/consts';
import type { SiteConfig } from '../../app/src/lib/schema';

export function connectFirestore(config: SiteConfig): { db: Firestore; projectId: string } {
  const projectId = process.env.FIRESTORE_EMULATOR_HOST ? EMULATOR_PROJECT_ID : config.firebase.projectId;
  const app = initializeApp({ projectId });
  return { db: getFirestore(app), projectId };
}
