import { Activity } from 'lucide-react';
import { Link } from 'react-router-dom';

export const Footer = () => {
  return (
    <footer className="relative border-t border-border/30 bg-card/10 backdrop-blur-sm">
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
              AI-powered quantitative trading intelligence. Transparent, data-driven, 
              and performance measurable collaborative AI system.
            </p>
            <p className="text-xs text-muted-foreground">
              Market research and analytical intelligence only. Not financial advice.
            </p>
          </div>

          {/* Links */}
          <div>
            <h4 className="font-display font-semibold mb-4 text-foreground">Product</h4>
            <ul className="space-y-2">
              <li>
                <a href="#features" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                  Features
                </a>
              </li>
              <li>
                <a href="#pricing" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                  Pricing
                </a>
              </li>
              <li>
                <Link to="/dashboard" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
                  Dashboard
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
            Powered by collaborative AI intelligence
          </p>
        </div>
      </div>
    </footer>
  );
};
