import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { SiteLockProvider } from "@/contexts/SiteLockContext";
import { SiteLockGate } from "@/components/SiteLockGate";
import { AdminRoute } from "@/components/AdminRoute";
import { FoundersBroadcastBar } from "@/components/founders/FoundersBroadcastBar";
import { FloatingCommandWidget } from "@/components/founders/FloatingCommandWidget";
import { Navigate } from "react-router-dom";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Ticker from "./pages/Ticker";
import AIAgents from "./pages/AIAgents";
import Evolution from "./pages/Evolution";
import ForexDashboard from "./pages/ForexDashboard";
import ForexOanda from "./pages/ForexOanda";
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
          <SiteLockProvider>
            <SiteLockGate>
              <FoundersBroadcastBar />
              <FloatingCommandWidget />
              <Routes>
                <Route path="/" element={<Navigate to="/dashboard" replace />} />
                <Route path="/auth" element={<Auth />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/dashboard/ticker/:symbol" element={<Ticker />} />
                <Route path="/dashboard/agents" element={<AIAgents />} />
                <Route path="/dashboard/evolution" element={<Evolution />} />
                <Route path="/dashboard/forex" element={<ForexDashboard />} />
                <Route path="/dashboard/forex/oanda" element={<ForexOanda />} />
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
                <Route path="*" element={<NotFound />} />
              </Routes>
            </SiteLockGate>
          </SiteLockProvider>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
