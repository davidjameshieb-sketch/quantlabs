import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Brain, 
  ChevronLeft, 
  BookOpen, 
  Activity, 
  Target, 
  Zap, 
  BarChart3, 
  TrendingUp,
  Lightbulb,
  GraduationCap,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Gauge,
  Radio,
  LineChart,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { 
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';

type ExplanationMode = 'beginner' | 'technical';

const Guide = () => {
  const [mode, setMode] = useState<ExplanationMode>('beginner');

  const toggleMode = () => setMode(prev => prev === 'beginner' ? 'technical' : 'beginner');

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <Link to="/dashboard" className="flex items-center gap-2">
            <ChevronLeft className="w-5 h-5" />
            <Activity className="w-6 h-6 text-primary" />
            <span className="font-display font-bold text-lg">QuantLabs</span>
          </Link>
          
          {/* Mode Toggle */}
          <div className="flex items-center gap-3">
            <span className={cn("text-sm", mode === 'beginner' ? 'text-foreground' : 'text-muted-foreground')}>
              <Lightbulb className="w-4 h-4 inline mr-1" />
              Simple
            </span>
            <Switch 
              checked={mode === 'technical'} 
              onCheckedChange={toggleMode}
            />
            <span className={cn("text-sm", mode === 'technical' ? 'text-foreground' : 'text-muted-foreground')}>
              <GraduationCap className="w-4 h-4 inline mr-1" />
              Technical
            </span>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-5xl">
        {/* Hero */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-12"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary mb-4">
            <BookOpen className="w-4 h-4" />
            <span className="text-sm font-medium">Complete Platform Guide</span>
          </div>
          <h1 className="font-display text-4xl md:text-5xl font-bold mb-4">
            <span className="text-gradient-neural">Understanding QuantLabs</span>
          </h1>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            {mode === 'beginner' 
              ? "Learn how to read our dashboards in plain English. No trading jargon required!"
              : "Technical documentation for our analysis methodology and signal generation logic."
            }
          </p>
        </motion.div>

        {/* Quick Start */}
        <Card className="mb-8 border-primary/20 bg-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-primary" />
              Quick Start
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-3 gap-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">1</div>
                <div>
                  <p className="font-medium">Browse Markets</p>
                  <p className="text-sm text-muted-foreground">
                    {mode === 'beginner' ? "Pick a market tab (Stocks, Crypto, Forex...)" : "Navigate to /dashboard and select market type filter"}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">2</div>
                <div>
                  <p className="font-medium">Check the Colors</p>
                  <p className="text-sm text-muted-foreground">
                    {mode === 'beginner' ? "Green = bullish, Red = bearish. Look for 'CLEAN' badges" : "Bias indicator + Efficiency verdict provide primary signal"}
                  </p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold">3</div>
                <div>
                  <p className="font-medium">Read the Strategy</p>
                  <p className="text-sm text-muted-foreground">
                    {mode === 'beginner' ? "PRESSING = go for it. AVOIDING = stay away" : "Strategy state reflects macro strength × efficiency matrix"}
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Main Sections */}
        <Tabs defaultValue="metrics" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="metrics" className="gap-1">
              <Gauge className="w-4 h-4" />
              <span className="hidden sm:inline">Metrics</span>
            </TabsTrigger>
            <TabsTrigger value="signals" className="gap-1">
              <Radio className="w-4 h-4" />
              <span className="hidden sm:inline">Signals</span>
            </TabsTrigger>
            <TabsTrigger value="charts" className="gap-1">
              <LineChart className="w-4 h-4" />
              <span className="hidden sm:inline">Charts</span>
            </TabsTrigger>
            <TabsTrigger value="strategy" className="gap-1">
              <Target className="w-4 h-4" />
              <span className="hidden sm:inline">Strategy</span>
            </TabsTrigger>
          </TabsList>

          {/* Metrics Tab */}
          <TabsContent value="metrics">
            <div className="space-y-6">
              {/* Efficiency */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="w-5 h-5 text-neural-cyan" />
                    {mode === 'beginner' ? "Movement Quality (Efficiency)" : "Efficiency Score"}
                  </CardTitle>
                  <CardDescription>
                    {mode === 'beginner' 
                      ? "How smooth or choppy is the price movement?"
                      : "Ratio of net directional movement to total price path"
                    }
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={mode}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                    >
                      {mode === 'beginner' ? (
                        <div className="space-y-4">
                          <p className="text-muted-foreground">
                            Think of efficiency like a road trip. Did you take the <strong>highway</strong> (clean, direct) 
                            or get lost on <strong>back roads</strong> (noisy, choppy)? High efficiency means price moved 
                            directly toward its goal.
                          </p>
                          <div className="grid sm:grid-cols-3 gap-3">
                            <div className="p-3 rounded-lg bg-neural-green/10 border border-neural-green/30">
                              <Badge className="bg-neural-green/20 text-neural-green border-neural-green/30 mb-2">CLEAN</Badge>
                              <p className="text-sm">Highway driving - direct movement to destination</p>
                            </div>
                            <div className="p-3 rounded-lg bg-neural-orange/10 border border-neural-orange/30">
                              <Badge className="bg-neural-orange/20 text-neural-orange border-neural-orange/30 mb-2">MIXED</Badge>
                              <p className="text-sm">Some detours - trend visible but with bumps</p>
                            </div>
                            <div className="p-3 rounded-lg bg-neural-red/10 border border-neural-red/30">
                              <Badge className="bg-neural-red/20 text-neural-red border-neural-red/30 mb-2">NOISY</Badge>
                              <p className="text-sm">Lost in traffic - no clear direction</p>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <div className="p-4 rounded-lg bg-muted/50 font-mono text-sm">
                            Efficiency = |Net Move| / Total Path Length
                            <br />
                            <span className="text-muted-foreground">where Total Path = Σ|High_i - Low_i| for each candle</span>
                          </div>
                          <div className="grid sm:grid-cols-3 gap-3">
                            <div className="p-3 rounded-lg border">
                              <Badge variant="outline" className="mb-2">CLEAN (&gt;0.60)</Badge>
                              <p className="text-sm text-muted-foreground">Trending market. High directional conviction.</p>
                            </div>
                            <div className="p-3 rounded-lg border">
                              <Badge variant="outline" className="mb-2">MIXED (0.30-0.60)</Badge>
                              <p className="text-sm text-muted-foreground">Trend present with retracements.</p>
                            </div>
                            <div className="p-3 rounded-lg border">
                              <Badge variant="outline" className="mb-2">NOISY (&lt;0.30)</Badge>
                              <p className="text-sm text-muted-foreground">Range-bound or consolidating.</p>
                            </div>
                          </div>
                        </div>
                      )}
                    </motion.div>
                  </AnimatePresence>
                </CardContent>
              </Card>

              {/* Confidence */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Gauge className="w-5 h-5 text-neural-purple" />
                    {mode === 'beginner' ? "Trend Strength (Confidence)" : "Confidence Score"}
                  </CardTitle>
                  <CardDescription>
                    {mode === 'beginner' 
                      ? "How committed is the market to this direction?"
                      : "Trend core divergence normalized by volatility"
                    }
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={mode}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                    >
                      {mode === 'beginner' ? (
                        <div className="space-y-4">
                          <p className="text-muted-foreground">
                            Confidence is like measuring how far apart two train tracks are. When the fast and slow 
                            trend lines <strong>separate widely</strong>, it shows strong directional commitment - 
                            like a <strong>confident stride</strong> vs hesitant steps.
                          </p>
                          <div className="flex items-center gap-4 p-4 rounded-lg bg-gradient-to-r from-neural-red/10 via-neural-orange/10 to-neural-green/10">
                            <div className="text-center">
                              <p className="text-2xl font-bold text-neural-red">0%</p>
                              <p className="text-xs text-muted-foreground">Hesitant</p>
                            </div>
                            <div className="flex-1 h-3 rounded-full bg-gradient-to-r from-neural-red via-neural-orange to-neural-green" />
                            <div className="text-center">
                              <p className="text-2xl font-bold text-neural-green">100%</p>
                              <p className="text-xs text-muted-foreground">Committed</p>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <div className="p-4 rounded-lg bg-muted/50 font-mono text-sm">
                            Confidence = min((|FastCore - SlowCore| / ATR) × 100, 100)
                            <br />
                            <span className="text-muted-foreground">FastCore: 8-period RQK | SlowCore: 21-period RQK</span>
                          </div>
                          <ul className="space-y-2 text-sm">
                            <li className="flex items-center gap-2">
                              <span className="w-3 h-3 rounded-full bg-neural-green" />
                              <strong>&gt;80%:</strong> Strong structural divergence. High conviction setup.
                            </li>
                            <li className="flex items-center gap-2">
                              <span className="w-3 h-3 rounded-full bg-neural-orange" />
                              <strong>40-80%:</strong> Developing structure. Monitor for confirmation.
                            </li>
                            <li className="flex items-center gap-2">
                              <span className="w-3 h-3 rounded-full bg-neural-red" />
                              <strong>&lt;40%:</strong> Compressed cores. No clear directional commitment.
                            </li>
                          </ul>
                        </div>
                      )}
                    </motion.div>
                  </AnimatePresence>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Signals Tab */}
          <TabsContent value="signals">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Radio className="w-5 h-5 text-neural-cyan" />
                  {mode === 'beginner' ? "AI Signal Lights" : "Neural Signal Matrix"}
                </CardTitle>
                <CardDescription>
                  {mode === 'beginner' 
                    ? "These lights turn on when specific market conditions are detected"
                    : "Boolean state indicators derived from core analysis metrics"
                  }
                </CardDescription>
              </CardHeader>
              <CardContent>
                <AnimatePresence mode="wait">
                  <motion.div
                    key={mode}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                  >
                    <div className="grid sm:grid-cols-2 gap-4">
                      {[
                        { 
                          name: 'Trend Active', 
                          beginner: 'Price is moving in a clear direction',
                          technical: '|FastCore - SlowCore| > 0.5 × ATR',
                          color: 'neural-cyan'
                        },
                        { 
                          name: 'Clean Flow', 
                          beginner: 'Movement is smooth, not choppy',
                          technical: 'Efficiency Score > 0.60',
                          color: 'neural-green'
                        },
                        { 
                          name: 'High Conviction', 
                          beginner: 'Strong commitment to direction',
                          technical: 'Confidence > 70%',
                          color: 'neural-purple'
                        },
                        { 
                          name: 'Structure Gaining', 
                          beginner: 'The trend is getting stronger',
                          technical: 'SpreadDelta > 0 (cores diverging)',
                          color: 'neural-orange'
                        },
                        { 
                          name: 'Volatility Expanding', 
                          beginner: 'Price swings are growing larger',
                          technical: 'Current ATR > 14-period ATR SMA',
                          color: 'neural-red'
                        },
                        { 
                          name: 'Trending Mode', 
                          beginner: 'Market is trending, not sideways',
                          technical: 'Efficiency ≥ 0.30',
                          color: 'primary'
                        },
                      ].map((signal) => (
                        <div 
                          key={signal.name}
                          className="p-4 rounded-lg border border-border/50 bg-card/50 flex items-start gap-3"
                        >
                          <div className={cn(
                            "w-4 h-4 rounded-full mt-0.5 flex-shrink-0",
                            `bg-${signal.color} shadow-lg shadow-${signal.color}/50`
                          )} 
                          style={{ 
                            backgroundColor: `hsl(var(--${signal.color}))`,
                            boxShadow: `0 0 10px hsl(var(--${signal.color}) / 0.5)`
                          }}
                          />
                          <div>
                            <p className="font-medium">{signal.name}</p>
                            <p className={cn(
                              "text-sm",
                              mode === 'technical' ? 'font-mono text-xs' : 'text-muted-foreground'
                            )}>
                              {mode === 'beginner' ? signal.beginner : signal.technical}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                </AnimatePresence>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Charts Tab */}
          <TabsContent value="charts">
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <LineChart className="w-5 h-5 text-neural-cyan" />
                    {mode === 'beginner' ? "The Price Chart" : "OHLC Price Visualization"}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={mode}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                    >
                      {mode === 'beginner' ? (
                        <div className="space-y-4">
                          <p className="text-muted-foreground">
                            The price chart shows you where the price has been. The <strong className="text-neural-cyan">blue/cyan color</strong> appears 
                            when price is going up, and <strong className="text-neural-red">red</strong> when it's going down.
                          </p>
                          <div className="p-4 rounded-lg bg-muted/50">
                            <p className="text-sm">💡 <strong>Tip:</strong> Use the timeframe buttons (15m, 1h, 4h, 1d) to zoom in or out. 
                            Shorter timeframes show recent detail, longer timeframes show the bigger picture.</p>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <p className="text-muted-foreground">
                            Area chart rendering of close prices with gradient fill. Color determined by comparing 
                            current close to period open. Timeframe selection affects analysis window.
                          </p>
                          <div className="p-4 rounded-lg bg-muted/50 font-mono text-sm">
                            Color = close &gt; data[0].close ? 'bullish' : 'bearish'
                          </div>
                        </div>
                      )}
                    </motion.div>
                  </AnimatePresence>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-primary" />
                    {mode === 'beginner' ? "Trend Lines Explained" : "Trend Core Visualization"}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={mode}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                    >
                      {mode === 'beginner' ? (
                        <div className="space-y-4">
                          <p className="text-muted-foreground">
                            Imagine two moving averages: one that reacts quickly (<strong className="text-neural-cyan">Fast Core - blue</strong>) and 
                            one that moves slowly (<strong className="text-neural-purple">Slow Core - purple</strong>). When they separate, 
                            a trend is forming. When they cross, the trend may be changing.
                          </p>
                          <div className="grid sm:grid-cols-2 gap-4">
                            <div className="p-4 rounded-lg border border-neural-cyan/30 bg-neural-cyan/5">
                              <p className="font-medium text-neural-cyan mb-1">Fast Core</p>
                              <p className="text-sm text-muted-foreground">Reacts quickly to price changes. Shows short-term momentum.</p>
                            </div>
                            <div className="p-4 rounded-lg border border-neural-purple/30 bg-neural-purple/5">
                              <p className="font-medium text-neural-purple mb-1">Slow Core</p>
                              <p className="text-sm text-muted-foreground">Moves slowly. Shows the underlying trend structure.</p>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          <p className="text-muted-foreground">
                            Rational Quadratic Kernel (RQK) regression applied at two periods: 
                            Fast (8) for momentum, Slow (21) for structure.
                          </p>
                          <div className="p-4 rounded-lg bg-muted/50 font-mono text-sm">
                            RQK(x) = Σ[K(x, x_i) × y_i] / Σ[K(x, x_i)]
                            <br />
                            <span className="text-muted-foreground">where K is the rational quadratic kernel</span>
                          </div>
                        </div>
                      )}
                    </motion.div>
                  </AnimatePresence>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Strategy Tab */}
          <TabsContent value="strategy">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Target className="w-5 h-5 text-primary" />
                  {mode === 'beginner' ? "What Should I Do?" : "Strategy State Matrix"}
                </CardTitle>
                <CardDescription>
                  {mode === 'beginner' 
                    ? "The AI combines all signals to suggest an approach"
                    : "2D mapping of Macro Strength × Efficiency Verdict"
                  }
                </CardDescription>
              </CardHeader>
              <CardContent>
                <AnimatePresence mode="wait">
                  <motion.div
                    key={mode}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                  >
                    <div className="space-y-4">
                      {[
                        { 
                          state: 'PRESSING', 
                          beginner: '🚀 Full speed ahead - optimal conditions',
                          technical: 'Strong + Clean: Maximum conviction. Trend structure with efficient execution.',
                          color: 'bg-neural-cyan/20 text-neural-cyan border-neural-cyan/30'
                        },
                        { 
                          state: 'TRACKING', 
                          beginner: '🎯 Standard cruising - good setup, stay alert',
                          technical: 'Strong + Mixed: Trend present with noise. Standard trend-following approach.',
                          color: 'bg-neural-purple/20 text-neural-purple border-neural-purple/30'
                        },
                        { 
                          state: 'HOLDING', 
                          beginner: '⏸️ Hold position - choppy but trend intact',
                          technical: 'Strong + Noisy: Bias valid but execution choppy. Consider reduced size.',
                          color: 'bg-neural-orange/20 text-neural-orange border-neural-orange/30'
                        },
                        { 
                          state: 'WATCHING', 
                          beginner: '👀 Observe only - setup forming, not ready',
                          technical: 'Moderate + Not Noisy: Setup developing. Monitor for entry signals.',
                          color: 'bg-muted text-muted-foreground border-border'
                        },
                        { 
                          state: 'AVOIDING', 
                          beginner: '🛑 Stay away - no edge, chop zone',
                          technical: 'Weak/Noisy: No statistical edge present. Opportunity cost of capital.',
                          color: 'bg-neural-red/20 text-neural-red border-neural-red/30'
                        },
                      ].map((item) => (
                        <div 
                          key={item.state}
                          className={cn("p-4 rounded-lg border", item.color)}
                        >
                          <p className="font-bold mb-1">{item.state}</p>
                          <p className="text-sm opacity-80">
                            {mode === 'beginner' ? item.beginner : item.technical}
                          </p>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                </AnimatePresence>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* FAQ Section */}
        <div className="mt-12">
          <h2 className="font-display text-2xl font-bold mb-6 flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-primary" />
            Frequently Asked Questions
          </h2>
          <Accordion type="single" collapsible className="space-y-2">
            <AccordionItem value="q1" className="border rounded-lg px-4">
              <AccordionTrigger>
                {mode === 'beginner' ? "I'm new to trading. Where do I start?" : "What data sources power the analysis?"}
              </AccordionTrigger>
              <AccordionContent>
                {mode === 'beginner' 
                  ? "Start by exploring the Stocks or Crypto tabs. Look for tickers with 'CLEAN' efficiency badges and 'PRESSING' or 'TRACKING' strategy states. These represent the clearest market conditions. Click on any ticker to see the detailed analysis."
                  : "Currently using simulated market data for demonstration. The analysis engine applies real technical analysis methodologies including RQK-based trend detection, efficiency ratio calculations, and volatility-normalized confidence scoring."
                }
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="q2" className="border rounded-lg px-4">
              <AccordionTrigger>
                {mode === 'beginner' ? "What do the colors mean?" : "How is the strategy state determined?"}
              </AccordionTrigger>
              <AccordionContent>
                {mode === 'beginner' 
                  ? "Green/Cyan = Bullish (price likely to go up). Red = Bearish (price likely to go down). Purple = Neutral or special conditions. Orange = Mixed or caution. The brighter the color, the stronger the signal."
                  : "Strategy state is derived from a 2D matrix mapping Macro Strength (from confidence thresholds: >80% = Strong, 40-80% = Moderate, <40% = Weak) against Efficiency Verdict (Clean/Mixed/Noisy). Each cell maps to a specific strategy state."
                }
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="q3" className="border rounded-lg px-4">
              <AccordionTrigger>
                {mode === 'beginner' ? "Should I only trade 'PRESSING' signals?" : "What is the Rational Quadratic Kernel?"}
              </AccordionTrigger>
              <AccordionContent>
                {mode === 'beginner' 
                  ? "PRESSING represents the highest conviction conditions, but TRACKING is also a valid trading state. The key is to avoid AVOIDING states. Think of it like a traffic light: PRESSING is green, TRACKING is yellow-green, HOLDING is yellow, WATCHING is orange, and AVOIDING is red."
                  : "RQK is a kernel function used in kernel regression that provides smooth, adaptive trend estimation. Unlike simple moving averages, RQK weights historical data using a rational function that better captures trend structure while filtering noise. Formula: K(x, x') = (1 + ||x - x'||² / (2αℓ²))^(-α)"
                }
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="q4" className="border rounded-lg px-4">
              <AccordionTrigger>
                {mode === 'beginner' ? "How often does the data update?" : "What timeframes are analyzed?"}
              </AccordionTrigger>
              <AccordionContent>
                {mode === 'beginner' 
                  ? "The charts update in real-time as market data comes in. You can change the timeframe (15m, 1h, 4h, 1d) to see different perspectives - shorter for quick trades, longer for the big picture."
                  : "Analysis is computed across 7 timeframes: 1m, 5m, 15m, 1h, 4h, 1d, 1w. Multi-timeframe alignment is checked by comparing bias direction across available timeframes. Higher tier subscriptions unlock more granular timeframes."
                }
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>

        {/* CTA */}
        <Card className="mt-12 bg-gradient-to-br from-primary/10 to-secondary/10 border-primary/20">
          <CardContent className="flex flex-col sm:flex-row items-center justify-between gap-4 p-6">
            <div>
              <h3 className="font-display text-xl font-bold">Ready to explore?</h3>
              <p className="text-muted-foreground">Apply what you've learned on real market data</p>
            </div>
            <Button asChild size="lg" className="gap-2">
              <Link to="/dashboard">
                Go to Dashboard
                <ArrowRight className="w-4 h-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default Guide;
