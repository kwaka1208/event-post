import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { Layout } from '@/components/Layout';
import { RequireAdmin } from '@/components/RequireAdmin';
import { ApplicationsPage } from '@/pages/admin/ApplicationsPage';
import { EventsPage } from '@/pages/EventsPage';
import { JoinPage } from '@/pages/JoinPage';
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
        { path: '/events', element: <EventsPage /> },
        {
          element: <RequireAdmin />,
          children: [{ path: '/admin/applications', element: <ApplicationsPage /> }],
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
