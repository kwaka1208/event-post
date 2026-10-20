import { Link } from 'react-router';

export function NotFoundPage() {
  return (
    <main className="main">
      <section className="card">
        <h1 className="card-title">ページが見つかりません</h1>
        <p>URL が間違っているか、ページが削除された可能性があります。</p>
        <Link to="/" className="button-secondary">
          トップページへ
        </Link>
      </section>
    </main>
  );
}
