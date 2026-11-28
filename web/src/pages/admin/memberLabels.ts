import type { Role } from '@/lib/membership';

/** 役割の呼び方（メンバー管理の一覧と詳細） */
export const roleLabels: Record<Role, string> = { owner: '特権管理者', admin: '管理者', member: '参加者' };
