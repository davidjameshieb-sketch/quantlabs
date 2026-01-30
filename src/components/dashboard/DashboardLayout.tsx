import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Brain, Home, BarChart3, Settings, LogOut, Search, ChevronDown, Menu } from 'lucide-react';
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

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export const DashboardLayout = ({ children }: DashboardLayoutProps) => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<typeof TICKERS>([]);
  const [showSearch, setShowSearch] = useState(false);

  // Mock user data
  const user = {
    email: 'trader@example.com',
    tier: 3,
    tierName: 'Strategist',
  };

  useEffect(() => {
    if (searchQuery.length > 0) {
      const results = TICKERS.filter(
        t =>
          t.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
          t.name.toLowerCase().includes(searchQuery.toLowerCase())
      ).slice(0, 5);
      setSearchResults(results);
      setShowSearch(true);
    } else {
      setSearchResults([]);
      setShowSearch(false);
    }
  }, [searchQuery]);

  const handleLogout = () => {
    navigate('/');
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="p-4 border-b border-border/50">
        <Link to="/dashboard" className="flex items-center gap-2">
          <Brain className="w-8 h-8 text-primary" />
          <span className="font-display font-bold text-lg text-gradient-neural">
            Neural Brain
          </span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-2">
        <Link
          to="/dashboard"
          className="flex items-center gap-3 px-3 py-2 rounded-lg text-foreground bg-primary/10 border border-primary/20"
        >
          <BarChart3 className="w-5 h-5 text-primary" />
          <span className="font-medium">Market Scanner</span>
        </Link>

        <div className="pt-4">
          <p className="px-3 py-2 text-xs text-muted-foreground uppercase tracking-wider">
            Markets
          </p>
          {Object.entries(MARKET_LABELS).map(([type, label]) => (
            <Link
              key={type}
              to={`/dashboard?market=${type}`}
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            >
              <span>{label}</span>
            </Link>
          ))}
        </div>
      </nav>

      {/* User section */}
      <div className="p-4 border-t border-border/50">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-foreground truncate max-w-[120px]">
              {user.email}
            </p>
            <div className="flex items-center gap-1 mt-1">
              <span className="text-xs px-2 py-0.5 rounded-full bg-primary/20 text-primary font-medium">
                Tier {user.tier}
              </span>
              <span className="text-xs text-muted-foreground">{user.tierName}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop Sidebar */}
      <aside className="fixed left-0 top-0 bottom-0 w-64 border-r border-border/50 bg-sidebar hidden lg:block">
        <SidebarContent />
      </aside>

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Top bar */}
        <header className="sticky top-0 z-40 border-b border-border/50 bg-background/80 backdrop-blur-xl">
          <div className="flex items-center justify-between h-16 px-4">
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

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="gap-2">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-sm font-bold text-background">
                      {user.email[0].toUpperCase()}
                    </div>
                    <ChevronDown className="w-4 h-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <div className="px-2 py-1.5">
                    <p className="text-sm font-medium">{user.email}</p>
                    <p className="text-xs text-muted-foreground">
                      {user.tierName} (Tier {user.tier})
                    </p>
                  </div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link to="/dashboard/settings" className="cursor-pointer">
                      <Settings className="w-4 h-4 mr-2" />
                      Settings
                    </Link>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleLogout} className="text-destructive cursor-pointer">
                    <LogOut className="w-4 h-4 mr-2" />
                    Logout
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="p-4 lg:p-6">{children}</main>
      </div>
    </div>
  );
};
