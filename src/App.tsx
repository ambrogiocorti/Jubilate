import { lazy, Suspense } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './app/AuthProvider';
import { PrefsProvider } from './app/PrefsProvider';
import { ToastProvider } from './app/ToastProvider';
import { LibraryProvider } from './app/LibraryProvider';
import { RoomProvider } from './features/rooms/RoomProvider';
import { AppShell } from './components/layout/AppShell';
import { RequireAuth, RequireRole } from './app/guards';
import { ConfigMissing } from './app/ConfigMissing';
import { UpdatePrompt } from './app/UpdatePrompt';
import { OutboxSync } from './app/OutboxSync';
import { env } from './lib/env';
import { LibraryPage } from './features/library/LibraryPage';
import { SongPage } from './features/song/SongPage';
import { NotFound } from './app/NotFound';
import { Spinner } from './components/ui/Feedback';

const SignInPage = lazy(() => import('./features/auth/SignInPage'));
const SignUpPage = lazy(() => import('./features/auth/SignUpPage'));
const ForgotPasswordPage = lazy(() => import('./features/auth/ForgotPasswordPage'));
const ResetPasswordPage = lazy(() => import('./features/auth/ResetPasswordPage'));
const AuthCallbackPage = lazy(() => import('./features/auth/AuthCallbackPage'));
const ProfilePage = lazy(() => import('./features/account/ProfilePage'));
const DirectorRequestPage = lazy(() => import('./features/account/DirectorRequestPage'));
const FavoritesPage = lazy(() => import('./features/collections/FavoritesPage'));
const CollectionsPage = lazy(() => import('./features/collections/CollectionsPage'));
const CollectionPage = lazy(() => import('./features/collections/CollectionPage'));
const SharedCollectionPage = lazy(() => import('./features/collections/SharedCollectionPage'));
const ArrangementsPage = lazy(() => import('./features/arrangements/ArrangementsPage'));
const ArrangementEditorPage = lazy(() => import('./features/arrangements/ArrangementEditorPage'));
const SharedArrangementPage = lazy(() => import('./features/arrangements/SharedArrangementPage'));
const ContributionsPage = lazy(() => import('./features/contributions/ContributionsPage'));
const ContributionEditorPage = lazy(() => import('./features/contributions/ContributionEditorPage'));
const RoomsPage = lazy(() => import('./features/rooms/RoomsPage'));
const LiveRoomPage = lazy(() => import('./features/rooms/LiveRoomPage'));
const CelebrationsPage = lazy(() => import('./features/celebrations/CelebrationsPage'));
const CelebrationPage = lazy(() => import('./features/celebrations/CelebrationPage'));
const CelebrationPrintPage = lazy(() => import('./features/celebrations/CelebrationPrintPage'));
const CollectionPrintPage = lazy(() => import('./features/collections/CollectionPrintPage'));
const ToolsPage = lazy(() => import('./features/tools/ToolsPage'));
const OfflinePage = lazy(() => import('./features/offline/OfflinePage'));
const ScoreStudioPage = lazy(() => import('./features/score/ScoreStudioPage'));
const AdminRoutes = lazy(() => import('./features/admin/AdminRoutes'));

export function App() {
  if (!env.isConfigured) return <ConfigMissing />;
  return (
    <BrowserRouter>
      <ToastProvider>
        <AuthProvider>
          <PrefsProvider>
            <LibraryProvider>
              <RoomProvider>
                <UpdatePrompt />
                <OutboxSync />
                <Suspense fallback={<Spinner />}>
                <Routes>
                  <Route path="/accedi" element={<SignInPage />} />
                  <Route path="/registrati" element={<SignUpPage />} />
                  <Route path="/recupera-password" element={<ForgotPasswordPage />} />
                  <Route path="/reimposta-password" element={<ResetPasswordPage />} />
                  <Route path="/auth/callback" element={<AuthCallbackPage />} />
                  <Route element={<AppShell />}>
                    <Route index element={<LibraryPage />} />
                    <Route path="canti/:songId" element={<SongPage />} />
                    <Route path="stanze" element={<RoomsPage />} />
                    <Route path="offline" element={<OfflinePage />} />
                    <Route path="condivisi/raccolta/:token" element={<SharedCollectionPage />} />
                    <Route element={<RequireAuth />}>
                      <Route path="profilo" element={<ProfilePage />} />
                      <Route path="direttore" element={<DirectorRequestPage />} />
                      <Route path="preferiti" element={<FavoritesPage />} />
                      <Route path="raccolte" element={<CollectionsPage />} />
                      <Route path="raccolte/:collectionId" element={<CollectionPage />} />
                      <Route path="versioni" element={<ArrangementsPage />} />
                      <Route path="versioni/:arrangementId" element={<ArrangementEditorPage />} />
                      <Route path="condivisi/versione/:token" element={<SharedArrangementPage />} />
                      <Route path="proposte" element={<ContributionsPage />} />
                      <Route path="proposte/nuova" element={<ContributionEditorPage />} />
                      <Route path="proposte/:contributionId" element={<ContributionEditorPage />} />
                      <Route path="stanze/:roomId" element={<LiveRoomPage />} />
                      <Route path="celebrazioni" element={<CelebrationsPage kind="celebration" />} />
                      <Route path="celebrazioni/:celebrationId" element={<CelebrationPage />} />
                      <Route path="prove" element={<CelebrationsPage kind="rehearsal" />} />
                      <Route path="prove/:celebrationId" element={<CelebrationPage />} />
                      <Route path="strumenti" element={<ToolsPage />} />
                      <Route path="spartiti/:scoreId" element={<ScoreStudioPage />} />
                      <Route path="spartiti/nuovo" element={<ScoreStudioPage />} />
                      <Route element={<RequireRole role="admin" />}>
                        <Route path="admin/*" element={<AdminRoutes />} />
                      </Route>
                    </Route>
                    <Route path="home" element={<Navigate to="/" replace />} />
                    <Route path="*" element={<NotFound />} />
                  </Route>
                  <Route element={<RequireAuth />}>
                    <Route path="stampa/celebrazione/:celebrationId" element={<CelebrationPrintPage />} />
                    <Route path="stampa/raccolta/:collectionId" element={<CollectionPrintPage />} />
                  </Route>
                </Routes>
                </Suspense>
              </RoomProvider>
            </LibraryProvider>
          </PrefsProvider>
        </AuthProvider>
      </ToastProvider>
    </BrowserRouter>
  );
}
