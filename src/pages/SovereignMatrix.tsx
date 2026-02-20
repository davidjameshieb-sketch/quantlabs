// Sovereign Matrix v20.0 — Mechanical Chomp Dashboard
import { useState } from 'react';
import { motion } from 'framer-motion';
import { Grid3x3, RefreshCw, Zap, AlertTriangle, Wifi } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';
import { useSovereignMatrix } from '@/hooks/useSovereignMatrix';
import { CurrencyScoreBar } from '@/components/matrix/CurrencyScoreBar';
import { StrikeCard } from '@/components/matrix/StrikeCard';
import { SignalTable } from '@/components/matrix/SignalTable';

type Env = 'practice' | 'live';

const SovereignMatrix = () => {
  const [environment, setEnvironment] = useState<Env>('live');
  const { loading, matrixResult, error, scanMatrix, fireT1, fireT2, fireT3 } = useSovereignMatrix();

  const handleScan = () => scanMatrix(environment);

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-5xl mx-auto space-y-6">

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <Grid3x3 className="w-7 h-7 text-primary" />
              <div>
                <h1 className="font-display text-2xl md:text-3xl font-bold">Sovereign Matrix</h1>
                <p className="text-muted-foreground text-xs">v20.0 Mechanical Chomp · 30m Macro · Triple-Lock Entry</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link to="/oanda">
                <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs">
                  <Wifi className="w-3.5 h-3.5" />
                  OANDA
                </Button>
              </Link>
              {/* Env toggle */}
              <div className="flex items-center gap-0.5 p-0.5 rounded-lg border border-border/50 bg-muted/10">
                {(['practice', 'live'] as Env[]).map((env) => (
                  <button
                    key={env}
                    onClick={() => setEnvironment(env)}
                    className={cn(
                      'text-[10px] font-mono px-2.5 py-1 rounded-md transition-all',
                      environment === env
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {env.toUpperCase()}
                  </button>
                ))}
              </div>
              <Button
                size="sm"
                onClick={handleScan}
                disabled={loading}
                className="h-8 gap-1.5 text-xs font-mono"
              >
                <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
                {loading ? 'Scanning…' : 'Run Scan'}
              </Button>
            </div>
          </div>
        </motion.div>

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-neural-red/10 border border-neural-red/30 text-neural-red text-xs">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            {error}
          </div>
        )}

        {/* Idle state */}
        {!matrixResult && !loading && !error && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="py-16 text-center space-y-3"
          >
            <Grid3x3 className="w-12 h-12 mx-auto text-muted-foreground/20" />
            <p className="text-sm text-muted-foreground">
              Run the 30m Macro Matrix scan to evaluate all major pairs.
            </p>
            <p className="text-xs text-muted-foreground/60">
              Checks Veff Atlas Wall · G1 Matrix Alignment · G2 Atlas Snap · G3 David Vector slope
            </p>
            <Button onClick={handleScan} disabled={loading} className="mt-4 gap-2">
              <Zap className="w-4 h-4" />
              Run Matrix Scan
            </Button>
          </motion.div>
        )}

        {/* Results */}
        {matrixResult && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-5"
          >
            {/* Scan meta */}
            <div className="flex items-center gap-3 flex-wrap">
              <Badge variant="outline" className="text-[9px] font-mono">
                {new Date(matrixResult.timestamp).toLocaleTimeString()}
              </Badge>
              <Badge
                variant="outline"
                className={cn(
                  'text-[9px] font-mono',
                  matrixResult.strikeCount > 0
                    ? 'border-neural-green/40 text-neural-green bg-neural-green/10'
                    : 'border-border/50 text-muted-foreground'
                )}
              >
                <Zap className="w-2.5 h-2.5 mr-1" />
                {matrixResult.strikeCount} STRIKE{matrixResult.strikeCount !== 1 ? 'S' : ''}
              </Badge>
              <Badge variant="outline" className="text-[9px] font-mono">
                {matrixResult.environment.toUpperCase()}
              </Badge>
              <Badge variant="outline" className="text-[9px] font-mono">
                {matrixResult.signals.length} pairs scanned
              </Badge>
            </div>

            {/* Currency Score Bar */}
            <div className="space-y-2">
              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                30m Synthetic Matrix Strength
              </p>
              <CurrencyScoreBar scores={matrixResult.currencyScores} />
            </div>

            {/* STRIKE Cards */}
            {matrixResult.strikes.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider flex items-center gap-1.5">
                  <Zap className="w-3 h-3 text-neural-green" />
                  Triple-Lock Strikes — 1,250-Unit Scaling Payload
                </p>
                {matrixResult.strikes.map((signal) => (
                  <StrikeCard
                    key={signal.instrument}
                    signal={signal}
                    onFireT1={() => fireT1(signal, environment)}
                    onFireT2={() => fireT2(signal, environment)}
                    onFireT3={() => fireT3(signal, environment)}
                    loading={loading}
                  />
                ))}
              </div>
            )}

            {/* All signals table */}
            <div className="space-y-2">
              <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                All Scanned Pairs
              </p>
              <SignalTable signals={matrixResult.signals} />
            </div>
          </motion.div>
        )}

      </div>
    </div>
  );
};

export default SovereignMatrix;
