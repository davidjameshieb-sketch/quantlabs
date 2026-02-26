import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

import ForexOanda from "./pages/ForexOanda";
import SovereignMatrix from "./pages/SovereignMatrix";
import HedgeControlCenter from "./pages/HedgeControlCenter";
import TheCitadel from "./pages/TheCitadel";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/oanda" replace />} />
          <Route path="/oanda" element={<ForexOanda />} />
          <Route path="/matrix" element={<SovereignMatrix />} />
          <Route path="/hedge" element={<HedgeControlCenter />} />
          <Route path="/citadel" element={<TheCitadel />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
