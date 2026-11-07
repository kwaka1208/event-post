import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { lazy, StrictMode, type ComponentType } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { Layout } from '@/components/Layout';
import { RequireAdmin } from '@/components/RequireAdmin';
import { RequireMember } from '@/components/RequireMember';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { TopPage } from '@/pages/TopPage';
import { SessionProvider } from '@/session/SessionProvider';
import '@/styles.css';

// トップページとページが見つからない画面のほかは、開いたときに読み込む（最初の読み込みを軽くするため）
const page = <K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) =>
  lazy(() => load().then((m) => ({ default: m[name] })));
const AdminEventsPage = page(() => import('@/pages/admin/AdminEventsPage'), 'AdminEventsPage');
const ApplicationsPage = page(() => import('@/pages/admin/ApplicationsPage'), 'ApplicationsPage');
const MailComposePage = page(() => import('@/pages/admin/MailComposePage'), 'MailComposePage');
const MailsPage = page(() => import('@/pages/admin/MailsPage'), 'MailsPage');
const MembersPage = page(() => import('@/pages/admin/MembersPage'), 'MembersPage');
const SettingsPage = page(() => import('@/pages/admin/SettingsPage'), 'SettingsPage');
const EventDetailPage = page(() => import('@/pages/EventDetailPage'), 'EventDetailPage');
const EventsPage = page(() => import('@/pages/EventsPage'), 'EventsPage');
const JoinPage = page(() => import('@/pages/JoinPage'), 'JoinPage');
const MyPage = page(() => import('@/pages/MyPage'), 'MyPage');
const SetupPage = page(() => import('@/pages/SetupPage'), 'SetupPage');
const EventEditPage = page(() => import('@/pages/admin/EventEditPage'), 'EventEditPage');
const EventNewPage = page(() => import('@/pages/admin/EventEditPage'), 'EventNewPage');

const queryClient = new QueryClient({
  // 権限のエラーは再試行しても変わらないので、再試行は 1 回だけにする
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
});

// GitHub Pages のサブパス（web/vite.config.ts の base）。/ で配信するときは空になる
const basename = import.meta.env.BASE_URL.replace(/\/+$/, '');

const router = createBrowserRouter(
  [
    {
      element: <Layout />,
      children: [
        { path: '/', element: <TopPage /> },
        { path: '/setup', element: <SetupPage /> },
        { path: '/join', element: <JoinPage /> },
        {
          element: <RequireMember />,
          children: [
            { path: '/events', element: <EventsPage /> },
            { path: '/events/:id', element: <EventDetailPage /> },
            { path: '/me', element: <MyPage /> },
          ],
        },
        {
          element: <RequireAdmin />,
          children: [
            { path: '/admin/applications', element: <ApplicationsPage /> },
            { path: '/admin/events', element: <AdminEventsPage /> },
            { path: '/admin/events/new', element: <EventNewPage /> },
            { path: '/admin/events/:id', element: <EventEditPage /> },
            { path: '/admin/members', element: <MembersPage /> },
            { path: '/admin/mails', element: <MailsPage /> },
            { path: '/admin/mails/new', element: <MailComposePage /> },
            { path: '/admin/settings', element: <SettingsPage /> },
          ],
        },
        { path: '*', element: <NotFoundPage /> },
      ],
    },
  ],
  { basename },
);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <RouterProvider router={router} />
      </SessionProvider>
    </QueryClientProvider>
  </StrictMode>,
);
