import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import ForexSenate from "./pages/ForexSenate";
import H4Dashboard from "./pages/H4Dashboard";
import KalshiGolf from "./pages/KalshiGolf";
import KalshiSports from "./pages/KalshiSports";
import UniversalAlpha from "./pages/UniversalAlpha";
import CommandCenter from "./pages/CommandCenter";
import PennyStocks from "./pages/PennyStocks";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<ForexSenate />} />
          <Route path="/senate" element={<Navigate to="/" replace />} />
          <Route path="/h4" element={<H4Dashboard />} />
          <Route path="/golf" element={<KalshiGolf />} />
          <Route path="/sports" element={<KalshiSports />} />
          <Route path="/alpha" element={<UniversalAlpha />} />
          <Route path="/command" element={<CommandCenter />} />
          <Route path="/pennies" element={<PennyStocks />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
