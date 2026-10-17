// 本体（EventPost）の定数。グループ固有の値は site/config.yml に書く。
export const EVENTPOST = {
  name: 'EventPost',
  // フッターの「Powered by EventPost」のリンク先（テンプレートリポジトリ）
  url: 'https://github.com/kwaka1208/event-post',
} as const;

/** 開発時に使う Firebase エミュレーターのプロジェクト ID（demo- で始まると実プロジェクトに接続しない） */
export const EMULATOR_PROJECT_ID = 'demo-event-post';
