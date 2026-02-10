import { useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { SnapshotStatusBar } from '@/components/dashboard/SnapshotStatusBar';
import { Activity, Home, BarChart3, Settings, LogOut, Search, ChevronDown, ChevronRight, Menu, BookOpen, Bot, LogIn, Shield, Globe, Wifi } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { TICKERS, MARKET_LABELS } from '@/lib/market';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { isFoundersEventActive } from '@/lib/foundersEvent';
import { FoundersWelcomeOverlay } from '@/components/founders/FoundersWelcomeOverlay';
import { EdgeHealthSidebar } from '@/components/dashboard/EdgeHealthSidebar';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export const DashboardLayout = ({ children }: DashboardLayoutProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, signOut, isAdmin } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<typeof TICKERS>([]);
  const [showSearch, setShowSearch] = useState(false);
  const isForexActive = location.pathname.startsWith('/dashboard/forex');

  const userEmail = user?.email || '';
  const isLoggedIn = !!user;

  useEffect(() => {
    if (searchQuery.length > 0) {
      const sanitizedQuery = searchQuery.trim().slice(0, 50);
      const results = TICKERS.filter(
        t =>
          t.symbol.toLowerCase().includes(sanitizedQuery.toLowerCase()) ||
          t.name.toLowerCase().includes(sanitizedQuery.toLowerCase())
      ).slice(0, 5);
      setSearchResults(results);
      setShowSearch(true);
    } else {
      setSearchResults([]);
      setShowSearch(false);
    }
  }, [searchQuery]);

  const handleLogout = async () => {
    await signOut();
    navigate('/');
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="p-4 border-b border-border/50">
        <Link to="/" className="flex items-center gap-2">
          <Activity className="w-8 h-8 text-primary" />
          <span className="font-display font-bold text-lg text-gradient-neural">
            QuantLabs
          </span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-2">
        <Link
          to="/dashboard"
          className={cn(
            "flex items-center gap-3 px-3 py-2 rounded-lg transition-colors",
            location.pathname === '/dashboard'
              ? "text-foreground bg-primary/10 border border-primary/20"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
          )}
        >
          <Bot className="w-5 h-5 text-primary" />
          <span className="font-medium">AI Strategy Agents</span>
        </Link>

        <Link
          to="/dashboard/evolution"
          className={cn(
            "flex items-center gap-3 px-3 py-2 rounded-lg transition-colors",
            location.pathname === '/dashboard/evolution'
              ? "text-foreground bg-primary/10 border border-primary/20"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
          )}
        >
          <Activity className="w-5 h-5" />
          <span className="font-medium">Market Evolution</span>
        </Link>

        {/* Forex Intelligence — Collapsible Group */}
        <div className="space-y-0.5">
          <button
            onClick={() => navigate('/dashboard/forex')}
            className={cn(
              "flex items-center justify-between w-full px-3 py-2 rounded-lg transition-colors",
              isForexActive
                ? "text-foreground bg-primary/10 border border-primary/20"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
            )}
          >
            <div className="flex items-center gap-3">
              <BarChart3 className="w-5 h-5 text-primary" />
              <span className="font-medium">Forex Intelligence</span>
            </div>
            <ChevronRight className={cn(
              "w-4 h-4 transition-transform duration-200",
              isForexActive && "rotate-90"
            )} />
          </button>

          {isForexActive && (
            <div className="ml-8 space-y-0.5 border-l border-border/30 pl-3">
              <Link
                to="/dashboard/forex"
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors",
                  location.pathname === '/dashboard/forex'
                    ? "text-foreground bg-muted/60 font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
                )}
              >
                <Globe className="w-3.5 h-3.5" />
                Overview
              </Link>
              <Link
                to="/dashboard/forex/oanda"
                className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors",
                  location.pathname === '/dashboard/forex/oanda'
                    ? "text-foreground bg-muted/60 font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
                )}
              >
                <Wifi className="w-3.5 h-3.5" />
                OANDA Broker
              </Link>
            </div>
          )}
        </div>

        <div className="pt-4">
          <p className="px-3 py-2 text-xs text-muted-foreground uppercase tracking-wider">
            Markets
          </p>
          {Object.entries(MARKET_LABELS).map(([type, label]) => (
            <Link
              key={type}
              to={type === 'forex' ? '/dashboard/forex' : `/dashboard?market=${type}`}
              className="flex items-center justify-between px-3 py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            >
              <span>{label}</span>
              <span className="text-xs text-muted-foreground/60">5+</span>
            </Link>
          ))}
        </div>

        <div className="pt-4 border-t border-border/30 mt-4 space-y-1">
          {isAdmin && (
            <Link
              to="/admin"
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            >
              <Shield className="w-5 h-5" />
              <span>Admin Panel</span>
            </Link>
          )}
          <Link
            to="/guide"
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          >
            <BookOpen className="w-5 h-5" />
            <span>Platform Guide</span>
          </Link>
        </div>
      </nav>

      {/* Edge Health Panel */}
      <div className="border-t border-border/30">
        <EdgeHealthSidebar />
      </div>

      {/* User section */}
      <div className="p-4 border-t border-border/50">
        {isLoggedIn ? (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground truncate max-w-[120px]">
                {userEmail}
              </p>
              <div className="flex items-center gap-1 mt-1">
                <span className="text-xs px-2 py-0.5 rounded-full bg-primary/20 text-primary font-medium">
                  {isFoundersEventActive() ? 'Founders' : 'Edge'}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <Link to="/auth">
            <Button variant="outline" size="sm" className="w-full gap-2">
              <LogIn className="w-4 h-4" />
              {isFoundersEventActive() ? 'Sign In' : 'Sign In for Edge'}
            </Button>
          </Link>
        )}
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background" style={{ paddingTop: isFoundersEventActive() ? '36px' : '0px' }}>
      {/* Welcome Overlay */}
      <FoundersWelcomeOverlay />
      {/* Desktop Sidebar */}
      <aside className="fixed left-0 top-0 bottom-0 w-64 border-r border-border/50 bg-sidebar hidden lg:block">
        <SidebarContent />
      </aside>

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Top bar */}
        <header className="sticky top-0 z-40 border-b border-border/50 bg-background/80 backdrop-blur-xl">
          <div className="flex items-center justify-between h-16 px-4">
            {/* Data Status Bar */}
            <div className="hidden xl:block absolute top-1 right-4">
              <SnapshotStatusBar />
            </div>
            {/* Mobile menu */}
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="lg:hidden">
                  <Menu className="w-5 h-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-64 p-0 bg-sidebar">
                <SidebarContent />
              </SheetContent>
            </Sheet>

            {/* Search */}
            <div className="relative flex-1 max-w-md mx-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Search tickers..."
                className="pl-10 bg-muted/50 border-border/50"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onBlur={() => setTimeout(() => setShowSearch(false), 200)}
                onFocus={() => searchQuery.length > 0 && setShowSearch(true)}
                maxLength={50}
              />
              {showSearch && searchResults.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-card border border-border rounded-lg shadow-lg overflow-hidden z-50">
                  {searchResults.map((ticker) => (
                    <Link
                      key={ticker.symbol}
                      to={`/dashboard/ticker/${ticker.symbol}`}
                      className="flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors"
                      onClick={() => {
                        setSearchQuery('');
                        setShowSearch(false);
                      }}
                    >
                      <div>
                        <p className="font-medium text-foreground">{ticker.symbol}</p>
                        <p className="text-xs text-muted-foreground">{ticker.name}</p>
                      </div>
                      <span className="text-xs px-2 py-1 rounded bg-muted text-muted-foreground">
                        {MARKET_LABELS[ticker.type]}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* Right actions */}
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" asChild>
                <Link to="/">
                  <Home className="w-5 h-5" />
                </Link>
              </Button>

              {isLoggedIn ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="gap-2">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-sm font-bold text-background">
                        {userEmail[0]?.toUpperCase() || 'U'}
                      </div>
                      <ChevronDown className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <div className="px-2 py-1.5">
                      <p className="text-sm font-medium">{userEmail}</p>
                      <p className="text-xs text-muted-foreground">QuantLabs Edge Access</p>
                    </div>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link to="/dashboard/settings" className="cursor-pointer">
                        <Settings className="w-4 h-4 mr-2" />
                        Settings
                      </Link>
                    </DropdownMenuItem>
                    {isAdmin && (
                      <DropdownMenuItem asChild>
                        <Link to="/admin" className="cursor-pointer">
                          <Shield className="w-4 h-4 mr-2" />
                          Admin Panel
                        </Link>
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem onClick={handleLogout} className="text-destructive cursor-pointer">
                      <LogOut className="w-4 h-4 mr-2" />
                      Logout
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <Button asChild size="sm" className="font-display">
                  <Link to="/auth">Sign In</Link>
                </Button>
              )}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
};
