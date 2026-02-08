import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { AdminRoute } from "@/components/AdminRoute";
import { FoundersBroadcastBar } from "@/components/founders/FoundersBroadcastBar";
import { FloatingCommandWidget } from "@/components/founders/FloatingCommandWidget";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Ticker from "./pages/Ticker";
import AIAgents from "./pages/AIAgents";
import Evolution from "./pages/Evolution";
import ForexDashboard from "./pages/ForexDashboard";
import Guide from "./pages/Guide";
import Admin from "./pages/Admin";
import BillingSuccess from "./pages/BillingSuccess";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <FoundersBroadcastBar />
          <FloatingCommandWidget />
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/dashboard/ticker/:symbol" element={<Ticker />} />
            <Route path="/dashboard/agents" element={<AIAgents />} />
            <Route path="/dashboard/evolution" element={<Evolution />} />
            <Route path="/dashboard/forex" element={<ForexDashboard />} />
            <Route path="/guide" element={<Guide />} />
            <Route path="/billing/success" element={<BillingSuccess />} />
            <Route
              path="/admin"
              element={
                <AdminRoute>
                  <Admin />
                </AdminRoute>
              }
            />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
