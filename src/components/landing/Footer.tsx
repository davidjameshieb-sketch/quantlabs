import { Activity } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useFoundersCountdown } from '@/hooks/useFoundersEvent';

export const Footer = () => {
  const { time, active } = useFoundersCountdown();

  return (
    <footer className="relative border-t border-border/30 bg-card/10 backdrop-blur-sm">
      {/* Founders Access urgency strip */}
      {active && (
        <div className="border-b border-primary/15 bg-primary/5">
          <div className="container max-w-7xl mx-auto px-4 py-3 flex flex-col sm:flex-row items-center justify-center gap-2 text-center">
            <span className="text-[11px] font-display font-medium text-primary">
              Founders Access Window closes in
            </span>
            <span className="font-mono text-[11px] font-bold text-foreground tabular-nums">
              {String(time.days).padStart(2, '0')}d {String(time.hours).padStart(2, '0')}h{' '}
              {String(time.minutes).padStart(2, '0')}m {String(time.seconds).padStart(2, '0')}s
            </span>
            <span className="text-[10px] text-muted-foreground hidden sm:inline">
              — Early participants receive permanent intelligence priority access consideration.
            </span>
          </div>
        </div>
      )}

      <div className="container max-w-7xl mx-auto px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="md:col-span-2">
            <Link to="/" className="flex items-center gap-2 mb-4">
              <Activity className="w-6 h-6 text-primary" />
              <span className="font-display font-bold text-lg text-gradient-neural">
                QuantLabs
              </span>
            </Link>
            <p className="text-sm text-muted-foreground max-w-md mb-4">
              QuantLabs is not a trading signal platform. It is a coordinated AI intelligence ecosystem
              designed to evolve with financial markets.
            </p>
            <p className="text-xs text-muted-foreground">
              Market research and analytical intelligence only. Not financial advice.
            </p>
          </div>

          {/* Links */}
          <div>
            <h4 className="font-display font-semibold mb-4 text-foreground">Intelligence</h4>
            <ul className="space-y-2">
              <li>
                <Link to="/dashboard" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                  Command Center
                </Link>
              </li>
              <li>
                <a href="#ai-fleet" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                  AI Fleet
                </a>
              </li>
              <li>
                <Link to="/dashboard" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                  Verified Trade Network
                </Link>
              </li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 className="font-display font-semibold mb-4 text-foreground">Legal</h4>
            <ul className="space-y-2">
              <li>
                <span className="text-sm text-muted-foreground">Privacy Policy</span>
              </li>
              <li>
                <span className="text-sm text-muted-foreground">Terms of Service</span>
              </li>
              <li>
                <span className="text-sm text-muted-foreground">Risk Disclaimer</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-12 pt-8 border-t border-border/20 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} QuantLabs. All rights reserved.
          </p>
          <p className="text-xs text-muted-foreground">
            Powered by coordinated AI intelligence ecosystem
          </p>
        </div>
      </div>
    </footer>
  );
};
