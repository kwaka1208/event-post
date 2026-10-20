// 読み込み中・エラーの共通表示
export function Loading() {
  return (
    <main className="main" aria-busy="true">
      <div className="skeleton" style={{ width: '40%', height: 24 }} />
      <div className="skeleton" style={{ height: 80 }} />
    </main>
  );
}

export function LoadError() {
  return (
    <main className="main">
      <section className="card">
        <h1 className="card-title">読み込めませんでした</h1>
        <p role="alert">通信状況を確認して、再読み込みしてください。</p>
        <button type="button" className="button-secondary" onClick={() => location.reload()}>
          再読み込み
        </button>
      </section>
    </main>
  );
}
