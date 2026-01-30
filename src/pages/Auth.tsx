import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Brain, Mail, Lock, Eye, EyeOff, ArrowRight, Chrome } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { NeuralBackground } from '@/components/landing/NeuralBackground';

const Auth = () => {
  const navigate = useNavigate();
  const [isLogin, setIsLogin] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    
    // For now, simulate auth and redirect to dashboard
    setTimeout(() => {
      setIsLoading(false);
      navigate('/dashboard');
    }, 1000);
  };

  const handleGoogleAuth = () => {
    setIsLoading(true);
    // For now, simulate auth and redirect to dashboard
    setTimeout(() => {
      setIsLoading(false);
      navigate('/dashboard');
    }, 1000);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <NeuralBackground />
      
      {/* Gradient overlays */}
      <div className="fixed inset-0 bg-gradient-to-b from-transparent via-background/50 to-background pointer-events-none" />
      <div className="fixed top-1/4 left-1/4 w-96 h-96 bg-primary/10 rounded-full blur-3xl pointer-events-none" />
      <div className="fixed bottom-1/4 right-1/4 w-96 h-96 bg-secondary/10 rounded-full blur-3xl pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 w-full max-w-md"
      >
        {/* Logo */}
        <Link to="/" className="flex items-center justify-center gap-2 mb-8">
          <Brain className="w-10 h-10 text-primary" />
          <span className="font-display font-bold text-2xl text-gradient-neural">
            Neural Brain
          </span>
        </Link>

        <Card className="border-border/50 bg-card/80 backdrop-blur-xl">
          <CardHeader className="text-center">
            <CardTitle className="font-display text-2xl">
              {isLogin ? 'Welcome Back' : 'Start Your Free Trial'}
            </CardTitle>
            <CardDescription>
              {isLogin
                ? 'Sign in to access your dashboard'
                : '2 weeks free, then choose your tier'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Google OAuth */}
            <Button
              variant="outline"
              className="w-full mb-6 border-border/50 hover:bg-muted/50"
              onClick={handleGoogleAuth}
              disabled={isLoading}
            >
              <Chrome className="w-5 h-5 mr-2" />
              Continue with Google
            </Button>

            <div className="relative mb-6">
              <Separator />
              <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-4 text-xs text-muted-foreground">
                or
              </span>
            </div>

            {/* Email/Password form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="trader@example.com"
                    className="pl-10 bg-muted/50 border-border/50"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    className="pl-10 pr-10 bg-muted/50 border-border/50"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={6}
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                className="w-full glow-cyan font-display"
                disabled={isLoading}
              >
                {isLoading ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-background/30 border-t-background rounded-full animate-spin" />
                    Processing...
                  </span>
                ) : (
                  <>
                    {isLogin ? 'Sign In' : 'Create Account'}
                    <ArrowRight className="ml-2 w-4 h-4" />
                  </>
                )}
              </Button>
            </form>

            {/* Toggle login/signup */}
            <p className="text-center text-sm text-muted-foreground mt-6">
              {isLogin ? "Don't have an account?" : 'Already have an account?'}
              <button
                type="button"
                className="ml-2 text-primary hover:underline"
                onClick={() => setIsLogin(!isLogin)}
              >
                {isLogin ? 'Sign up' : 'Sign in'}
              </button>
            </p>

            {!isLogin && (
              <p className="text-center text-xs text-muted-foreground mt-4">
                By signing up, you agree to our Terms of Service and Privacy Policy.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Back to home */}
        <p className="text-center mt-6">
          <Link
            to="/"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            ← Back to home
          </Link>
        </p>
      </motion.div>
    </div>
  );
};

export default Auth;
