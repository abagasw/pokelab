import { useAuthStore } from '@stores/authStore';
import {
  ChevronDown,
  FlaskConical,
  Layers3,
  LogIn,
  LogOut,
  Menu,
  Package,
  Search,
  User,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';

const navItems = [
  { href: '/lab', label: 'Lab', icon: FlaskConical },
  { href: '/cards', label: 'Kartu', icon: Search },
  { href: '/decks', label: 'Deck', icon: Layers3 },
  { href: '/collections', label: 'Inventory', icon: Package },
];

export default function Navigation() {
  const { user, authReady, isAuthenticated, logout } = useAuthStore();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [pathname, setPathname] = useState('/');
  const [currentPath, setCurrentPath] = useState('/');

  useEffect(() => {
    setPathname(window.location.pathname);
    setCurrentPath(`${window.location.pathname}${window.location.search}`);
  }, []);

  const handleLogout = async () => {
    await logout();
    window.location.href = '/';
  };

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const loginHref =
    currentPath && !['/', '/login', '/register'].includes(pathname)
      ? `/login?redirect=${encodeURIComponent(currentPath)}`
      : '/login';

  const NavLink = ({ href, label }: (typeof navItems)[number]) => (
    <a
      href={href}
      className={`relative inline-flex h-9 items-center px-2 text-sm font-semibold transition-colors after:absolute after:inset-x-2 after:bottom-1 after:h-0.5 after:rounded-full after:transition-opacity ${
        isActive(href)
          ? 'text-white after:bg-red-400 after:opacity-100'
          : 'text-zinc-400 after:opacity-0 hover:text-white'
      }`}
    >
      {label}
    </a>
  );

  return (
    <nav className="sticky top-0 z-50 w-full bg-[#111111]/78 backdrop-blur-xl supports-[backdrop-filter]:bg-[#111111]/62">
      <div className="container flex h-14 items-center px-6 md:px-8">
        <a href="/" className="mr-6 flex min-w-fit items-center gap-2.5">
          <span className="leading-tight">
            <span className="block text-sm font-bold text-foreground">PokeLab</span>
          </span>
        </a>

        <div className="hidden flex-1 items-center justify-between md:flex">
          <div className="flex items-center gap-4">
            {navItems.map((item) => (
              <NavLink key={item.href} {...item} />
            ))}
          </div>

          <div className="flex items-center gap-3">
            {authReady && isAuthenticated ? (
              <div className="relative">
                <button
                  onClick={() => setShowUserMenu((value) => !value)}
                  className="inline-flex h-9 items-center gap-2 rounded-full bg-white/5 px-2.5 text-sm font-medium transition-colors hover:bg-white/10"
                  aria-expanded={showUserMenu}
                  aria-label="Buka menu akun"
                >
                  <span className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-md bg-primary/10 text-primary">
                    {user?.avatar_url ? (
                      <img src={user.avatar_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <User className="h-4 w-4" />
                    )}
                  </span>
                  <span className="hidden max-w-28 truncate lg:inline">{user?.username || 'User'}</span>
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                </button>

                {showUserMenu && (
                  <div className="absolute right-0 mt-2 w-56 overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-lg">
                    <a
                      href="/profile"
                      className="flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-accent"
                      onClick={() => setShowUserMenu(false)}
                    >
                      <User className="h-4 w-4 text-muted-foreground" />
                      Profil Saya
                    </a>
                    <a
                      href="/collections"
                      className="flex items-center gap-2 px-3 py-2.5 text-sm hover:bg-accent"
                      onClick={() => setShowUserMenu(false)}
                    >
                      <Package className="h-4 w-4 text-muted-foreground" />
                      Inventory
                    </a>
                    <button
                      onClick={handleLogout}
                      className="flex w-full items-center gap-2 border-t border-border px-3 py-2.5 text-left text-sm text-destructive hover:bg-accent"
                    >
                      <LogOut className="h-4 w-4" />
                      Logout
                    </button>
                  </div>
                )}
              </div>
            ) : authReady ? (
              <a
                href={loginHref}
                className="inline-flex h-9 items-center gap-2 rounded-full bg-red-500 px-4 text-sm font-semibold text-white transition-colors hover:bg-red-400"
              >

                Login
              </a>
            ) : null}
          </div>
        </div>

        <button
          onClick={() => setShowMobileMenu((value) => !value)}
          className="ml-auto inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/5 text-foreground md:hidden"
          aria-expanded={showMobileMenu}
          aria-label="Buka navigasi"
        >
          {showMobileMenu ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {showMobileMenu && (
        <div className="bg-[#111111]/95 backdrop-blur md:hidden">
          <div className="container space-y-1 px-6 py-4">
            {navItems.map(({ href, label, icon: Icon }) => (
              <a
                key={href}
                href={href}
                className={`flex items-center gap-3 rounded-md px-3 py-3 text-sm font-medium ${
                  isActive(href) ? 'bg-red-500 text-white' : 'text-zinc-400 hover:bg-white/10 hover:text-white'
                }`}
                onClick={() => setShowMobileMenu(false)}
              >
                <Icon className="h-4 w-4" />
                {label}
              </a>
            ))}

            <div className="mt-3 border-t border-white/10 pt-3">
              {authReady && isAuthenticated ? (
                <>
                  <a
                    href="/profile"
                    className="flex items-center gap-3 rounded-md px-3 py-3 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground"
                    onClick={() => setShowMobileMenu(false)}
                  >
                    <User className="h-4 w-4" />
                    Profil
                  </a>
                  <button
                    onClick={() => {
                      setShowMobileMenu(false);
                      handleLogout();
                    }}
                    className="flex w-full items-center gap-3 rounded-md px-3 py-3 text-left text-sm font-medium text-destructive hover:bg-accent"
                  >
                 
                    Logout
                  </button>
                </>
              ) : authReady ? (
                <a
                  href={loginHref}
                  className="flex items-center gap-3 rounded-md bg-red-500 px-3 py-3 text-sm font-semibold text-white"
                  onClick={() => setShowMobileMenu(false)}
                >
                  
                  Login
                </a>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}
