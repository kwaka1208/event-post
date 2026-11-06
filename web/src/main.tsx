import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { Layout } from '@/components/Layout';
import { RequireAdmin } from '@/components/RequireAdmin';
import { RequireMember } from '@/components/RequireMember';
import { AdminEventsPage } from '@/pages/admin/AdminEventsPage';
import { ApplicationsPage } from '@/pages/admin/ApplicationsPage';
import { EventEditPage, EventNewPage } from '@/pages/admin/EventEditPage';
import { MailComposePage } from '@/pages/admin/MailComposePage';
import { MailsPage } from '@/pages/admin/MailsPage';
import { MembersPage } from '@/pages/admin/MembersPage';
import { SettingsPage } from '@/pages/admin/SettingsPage';
import { EventDetailPage } from '@/pages/EventDetailPage';
import { EventsPage } from '@/pages/EventsPage';
import { JoinPage } from '@/pages/JoinPage';
import { MyPage } from '@/pages/MyPage';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { SetupPage } from '@/pages/SetupPage';
import { TopPage } from '@/pages/TopPage';
import { SessionProvider } from '@/session/SessionProvider';
import '@/styles.css';

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
