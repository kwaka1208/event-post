// Deploy のときに、OGP に使うグループ名と説明を Firestore から読み、web/ogp.json に書く。
// 画面のビルド（web/vite.config.ts）がこれを読んで、index.html に OGP のタグを書き込む。
//
//   npm run ogp
//
// 接続先は lib/firestore.ts を参照。グループがまだなければ、空の値を書く（ビルドは EventPost の名前で続ける）。
import { writeFileSync } from 'node:fs';
import { connectFirestore } from './lib/firestore';

async function main() {
  const { db, projectId } = connectFirestore();
  const group = await db.doc('group/profile').get();
  const data = { title: (group.get('name') as string | undefined) ?? '', description: (group.get('description') as string | undefined) ?? '' };
  writeFileSync(new URL('../web/ogp.json', import.meta.url), `${JSON.stringify(data, null, 2)}\n`);
  console.log(
    group.exists
      ? `Firestore（${projectId}）からグループ名と説明を読み、OGP に使います。`
      : `Firestore（${projectId}）にグループがまだないため、OGP は EventPost の名前で出します。`,
  );
}

main().catch((e) => {
  console.error((e as Error).message);
  process.exit(1);
});
