import type { RegistrationStatus } from '@/lib/registrations';

const labels: Record<RegistrationStatus, { text: string; className: string }> = {
  open: { text: '受付中', className: 'badge' },
  registered: { text: '申込済み', className: 'badge badge-done' },
  'registered-started': { text: '申込済み', className: 'badge badge-done' },
  full: { text: '満員', className: 'badge badge-few' },
  closed: { text: '締切', className: 'badge badge-draft' },
  ended: { text: '終了', className: 'badge badge-draft' },
  draft: { text: '下書き', className: 'badge badge-draft' },
};

export function EventBadge({ status }: { status: RegistrationStatus }) {
  const { text, className } = labels[status];
  return <span className={className}>{text}</span>;
}
