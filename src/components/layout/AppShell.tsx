import { publicAsset } from '../../lib/env';
import { Suspense, type ReactNode } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../../app/AuthProvider';
import { usePrefs } from '../../app/PrefsProvider';
import { useOnline } from '../../lib/useOnline';
import { Icon, type IconName } from '../ui/Icon';
import { Button } from '../ui/Button';
import { Spinner } from '../ui/Feedback';
import { RoomBanner } from '../../features/rooms/RoomBanner';
import { LegalLinks } from '../../features/legal/LegalPage';

interface NavItem { to: string; label: string; icon: IconName; end?: boolean }

function useNav() {
  const { isRegistered, isDirector, isAdmin } = useAuth();
  const main: NavItem[] = [{ to: '/', label: 'Libretto dei canti e accordi', icon: 'library', end: true }];
  const personal: NavItem[] = isRegistered
    ? [
        { to: '/preferiti', label: 'Preferiti', icon: 'heart' },
        { to: '/raccolte', label: 'Raccolte', icon: 'folder' },
        { to: '/versioni', label: 'Le mie versioni', icon: 'layers' },
        { to: '/proposte', label: 'Proposte', icon: 'send' },
      ]
    : [];
  const choir: NavItem[] = [
    { to: '/stanze', label: 'Stanze', icon: 'radio' },
    ...(isRegistered ? [{ to: '/celebrazioni', label: 'Celebrazioni', icon: 'calendar' as IconName }] : []),
    ...(isRegistered ? [{ to: '/prove', label: 'Prove del coro', icon: 'mic' as IconName }] : []),
    ...(isRegistered ? [{ to: '/strumenti', label: 'Metronomo', icon: 'metronome' as IconName }] : []),
  ];
  const device: NavItem[] = [{ to: '/offline', label: 'Disponibili offline', icon: 'download' }];
  const admin: NavItem[] = isAdmin ? [{ to: '/admin', label: 'Amministrazione', icon: 'shield' }] : [];
  const bottom: NavItem[] = [
    { to: '/', label: 'Libretto', icon: 'library', end: true },
    ...(isRegistered ? [{ to: '/raccolte', label: 'Raccolte', icon: 'folder' as IconName }] : []),
    { to: '/stanze', label: 'Stanze', icon: 'radio' },
    ...(isDirector ? [{ to: '/celebrazioni', label: 'Scalette', icon: 'calendar' as IconName }] : []),
    isRegistered ? { to: '/profilo', label: 'Profilo', icon: 'user' } : { to: '/accedi', label: 'Accedi', icon: 'logIn' },
  ];
  return { main, personal, choir, device, admin, bottom };
}

function NavGroup({ label, items }: { label?: string; items: NavItem[] }) {
  if (!items.length) return null;
  return (
    <nav className="nav-group" aria-label={label ?? 'Principale'}>
      {label && <div className="nav-group__label">{label}</div>}
      {items.map((i) => (
        <NavLink key={i.to} to={i.to} end={i.end} className="nav-link">
          <Icon name={i.icon} />
          {i.label}
        </NavLink>
      ))}
    </nav>
  );
}

export function Brand({ sub = false }: { sub?: boolean }) {
  return (
    <Link to="/" className="brand" aria-label="Jubilate Deo, vai al libretto dei canti">
      <img src={publicAsset('favicon.svg')} alt="" width={30} height={30} />
      <span>
        Jubilate Deo
        {sub && <span className="brand__sub">La musica che unisce la comunità</span>}
      </span>
    </Link>
  );
}

function ThemeToggle() {
  const { prefs, update } = usePrefs();
  const dark =
    prefs.theme === 'dark' || (prefs.theme === 'system' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  return (
    <Button variant="ghost" iconOnly icon={dark ? 'sun' : 'moon'} onClick={() => update({ theme: dark ? 'light' : 'dark' })}>
      {dark ? 'Passa al tema chiaro' : 'Passa al tema scuro'}
    </Button>
  );
}

export function AppShell({ children }: { children?: ReactNode }) {
  const nav = useNav();
  const { isRegistered, profile } = useAuth();
  const online = useOnline();
  const location = useLocation();
  const flush = /^\/(canti|stanze)\/[^/]+/.test(location.pathname) || location.pathname.startsWith('/condivisi/versione');

  return (
    <div className="app">
      <a className="skip-link" href="#main">Vai al contenuto</a>
      <aside className="sidebar" aria-label="Navigazione">
        <Brand sub />
        <NavGroup items={nav.main} />
        <NavGroup label="Personale" items={nav.personal} />
        <NavGroup label="Coro e celebrazioni" items={nav.choir} />
        <NavGroup label="Dispositivo" items={nav.device} />
        <NavGroup label="Parrocchia" items={nav.admin} />
        <div className="sidebar__footer">
          {isRegistered ? (
            <NavLink to="/profilo" className="nav-link">
              <Icon name="user" />
              <span className="grow" style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{profile?.display_name || 'Profilo'}</span>
            </NavLink>
          ) : (
            <NavLink to="/accedi" className="nav-link">
              <Icon name="logIn" />
              Accedi o registrati
            </NavLink>
          )}
        </div>
      </aside>

      <header className="topbar">
        <Brand />
        <div className="topbar__actions">
          {!online && (
            <span className="offline-pill" role="status">
              <Icon name="wifiOff" size={14} /> Offline
            </span>
          )}
          <ThemeToggle />
        </div>
      </header>

      <div style={{ minWidth: 0 }}>
        <RoomBanner />
        <main id="main" className={flush ? 'main main--flush' : 'main'} tabIndex={-1}>
          <Suspense fallback={<Spinner />}>{children ?? <Outlet />}</Suspense>
          {!flush && <LegalLinks />}
        </main>
      </div>

      <nav className="bottomnav" aria-label="Navigazione principale">
        {nav.bottom.map((i) => (
          <NavLink key={i.to} to={i.to} end={i.end}>
            <Icon name={i.icon} />
            <span>{i.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
