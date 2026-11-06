// Actions のスクリプトから Firestore に接続する。
// 認証は Application Default Credentials（Actions では google-github-actions/auth が設定する）。
// FIRESTORE_EMULATOR_HOST があればエミュレーター（demo-event-post）に、なければ GOOGLE_CLOUD_PROJECT に接続する。
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { EMULATOR_PROJECT_ID } from '../../../web/src/consts';

export function connectFirestore(env = process.env): { db: Firestore; projectId: string } {
  const projectId = env.FIRESTORE_EMULATOR_HOST ? EMULATOR_PROJECT_ID : env.GOOGLE_CLOUD_PROJECT;
  if (!projectId) throw new Error('環境変数 GOOGLE_CLOUD_PROJECT を設定してください');
  const app = initializeApp({ projectId });
  return { db: getFirestore(app), projectId };
}
