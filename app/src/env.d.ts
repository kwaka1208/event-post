/** astro.config.ts の vite.define でビルド時に埋め込む、config.yml の firebase */
declare const __FIREBASE_CONFIG__: {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
};
