/** base（GitHub Pages のリポジトリ名など）を考慮したサイト内 URL */
export function url(path = ''): string {
  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  return `${base}/${path.replace(/^\//, '')}`;
}
