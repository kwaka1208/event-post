// プロフィール画像を、ブラウザの中で小さな正方形の JPEG にする。
// Cloud Storage を使わず（無料のまま使えるように）、data: URL を Firestore の directory に入れるため、小さくしてから保存する。
import { LIMITS } from './limits';

/** 保存する画像の一辺（px）。一覧では 40px、マイページでは 96px で出すので、高精細の画面でも足りる大きさ */
export const AVATAR_SIZE = 192;

/** 読み込める画像の大きさの上限（元のファイル。大きすぎる写真で固まらないように） */
export const MAX_SOURCE_BYTES = 20 * 1024 * 1024;

export class AvatarError extends Error {}

/** 画像ファイルを、真ん中で正方形に切り取って AVATAR_SIZE に縮め、JPEG の data: URL にする */
export async function makeAvatar(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new AvatarError('画像のファイルを選んでください。');
  if (file.size > MAX_SOURCE_BYTES) throw new AvatarError('ファイルが大きすぎます（20MB まで）。');

  let bitmap: ImageBitmap;
  try {
    // スマホの写真の向き（EXIF）に合わせて読み込む
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new AvatarError('この画像は読み込めませんでした。JPEG か PNG の画像をお試しください。');
  }

  const side = Math.min(bitmap.width, bitmap.height);
  const sx = (bitmap.width - side) / 2;
  const sy = (bitmap.height - side) / 2;
  const canvas = document.createElement('canvas');
  canvas.width = AVATAR_SIZE;
  canvas.height = AVATAR_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new AvatarError('この画像は読み込めませんでした。');
  // 透明な部分（PNG）は白にする（JPEG は透明にできないため）
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, AVATAR_SIZE, AVATAR_SIZE);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, sx, sy, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
  bitmap.close();

  // 上限に収まるまで、画質を少しずつ下げる
  for (const quality of [0.85, 0.75, 0.6, 0.45]) {
    const url = canvas.toDataURL('image/jpeg', quality);
    if (url.length <= LIMITS.introPhoto) return url;
  }
  throw new AvatarError('画像を小さくできませんでした。別の画像をお試しください。');
}
