import { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  PanelLeftClose, 
  PanelLeftOpen, 
  BarChart3, 
  Layers, 
  Target,
  MessageSquare 
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DashboardLayout } from './DashboardLayout';
import { MarketScanner } from './MarketScanner';
import { SectorDashboard } from './SectorDashboard';
import { ConvictionViews } from './ConvictionViews';
import { ChatInterface } from '@/components/chat/ChatInterface';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

type DashboardView = 'scanner' | 'sectors' | 'conviction';

export const SplitViewDashboard = () => {
  const { user } = useAuth();
  const [chatOpen, setChatOpen] = useState(true);
  const [activeView, setActiveView] = useState<DashboardView>('scanner');
  
  // Mock user tier - in production this would come from a profiles table
  const userTier = 3;

  return (
    <DashboardLayout>
      <div className="flex h-[calc(100vh-4rem)] -m-4 lg:-m-6">
        {/* Main Content Panel */}
        <motion.div
          className="flex-1 overflow-auto p-4 lg:p-6"
          animate={{ 
            marginRight: chatOpen ? 0 : 0,
          }}
        >
          {/* View Tabs */}
          <Tabs value={activeView} onValueChange={(v) => setActiveView(v as DashboardView)} className="space-y-6">
            <div className="flex items-center justify-between gap-4">
              <TabsList className="bg-muted/50 border border-border/50">
                <TabsTrigger 
                  value="scanner" 
                  className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-2"
                >
                  <BarChart3 className="w-4 h-4" />
                  <span className="hidden sm:inline">Scanner</span>
                </TabsTrigger>
                <TabsTrigger 
                  value="sectors" 
                  className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-2"
                >
                  <Layers className="w-4 h-4" />
                  <span className="hidden sm:inline">Sectors</span>
                </TabsTrigger>
                <TabsTrigger 
                  value="conviction" 
                  className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground gap-2"
                >
                  <Target className="w-4 h-4" />
                  <span className="hidden sm:inline">Views</span>
                </TabsTrigger>
              </TabsList>

              {/* Chat toggle button (mobile) */}
              <Button
                variant="outline"
                size="icon"
                onClick={() => setChatOpen(!chatOpen)}
                className="lg:hidden border-border/50"
              >
                {chatOpen ? (
                  <PanelLeftClose className="w-4 h-4" />
                ) : (
                  <MessageSquare className="w-4 h-4" />
                )}
              </Button>
            </div>

            <TabsContent value="scanner" className="mt-0">
              <MarketScanner />
            </TabsContent>

            <TabsContent value="sectors" className="mt-0">
              <SectorDashboard />
            </TabsContent>

            <TabsContent value="conviction" className="mt-0">
              <div className="space-y-6">
                <div>
                  <h1 className="font-display text-2xl md:text-3xl font-bold text-gradient-neural">
                    Market Condition Views
                  </h1>
                  <p className="text-muted-foreground mt-1">
                    Analysis lenses for different market conditions
                  </p>
                </div>
                <ConvictionViews />
              </div>
            </TabsContent>
          </Tabs>
        </motion.div>

        {/* Chat Panel */}
        <motion.div
          initial={false}
          animate={{ 
            width: chatOpen ? 400 : 0,
            opacity: chatOpen ? 1 : 0,
          }}
          transition={{ duration: 0.3, ease: 'easeInOut' }}
          className={cn(
            "hidden lg:block border-l border-border/50 bg-background overflow-hidden",
            !chatOpen && "border-l-0"
          )}
        >
          <div className="w-[400px] h-full flex flex-col">
            {/* Chat header with close button */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-border/50">
              <span className="text-sm font-medium text-muted-foreground">AI Assistant</span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setChatOpen(false)}
                className="h-8 w-8"
              >
                <PanelLeftClose className="w-4 h-4" />
              </Button>
            </div>
            <ChatInterface userTier={userTier} className="flex-1 border-0 rounded-none" />
          </div>
        </motion.div>

        {/* Chat toggle (desktop, when closed) */}
        {!chatOpen && (
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="hidden lg:flex flex-col items-center gap-2 p-2 border-l border-border/50"
          >
            <Button
              variant="outline"
              size="icon"
              onClick={() => setChatOpen(true)}
              className="border-border/50"
            >
              <MessageSquare className="w-4 h-4" />
            </Button>
            <span className="text-xs text-muted-foreground [writing-mode:vertical-lr] rotate-180">
              AI Chat
            </span>
          </motion.div>
        )}

        {/* Mobile chat overlay */}
        {chatOpen && (
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            className="lg:hidden fixed inset-0 z-50 bg-background"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
              <span className="font-display text-sm font-semibold">QuantLabs AI</span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setChatOpen(false)}
              >
                <PanelLeftOpen className="w-4 h-4" />
              </Button>
            </div>
            <ChatInterface userTier={userTier} className="h-[calc(100vh-57px)] border-0 rounded-none" />
          </motion.div>
        )}
      </div>
    </DashboardLayout>
  );
};
