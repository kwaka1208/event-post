// プロフィール画像。設定していない人は、ニックネームの最初の 1 文字を丸の中に出す
interface Props {
  nickname: string;
  photo?: string;
  /** 一辺の大きさ（px） */
  size?: number;
}

export function Avatar({ nickname, photo, size = 40 }: Props) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.42) };
  if (photo) return <img className="avatar" src={photo} alt="" width={size} height={size} style={style} />;
  return (
    <span className="avatar avatar-initial" style={style} aria-hidden="true">
      {Array.from(nickname.trim())[0] ?? '?'}
    </span>
  );
}
