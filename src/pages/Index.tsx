import { DashboardBackground } from '@/components/landing/DashboardBackground';
import { Navbar } from '@/components/landing/Navbar';
import { HeroSection } from '@/components/landing/HeroSection';
import { AIFleetShowcase } from '@/components/landing/AIFleetShowcase';
import { DemonstrationSection } from '@/components/landing/DemonstrationSection';
import { TrustFlowSection } from '@/components/landing/TrustFlowSection';
import { EdgeDiscoverySection } from '@/components/landing/EdgeDiscoverySection';
import { PlatformStatsSection } from '@/components/landing/PlatformStatsSection';
import { PricingSection } from '@/components/landing/PricingSection';
import { ConfidenceCloseSection } from '@/components/landing/ConfidenceCloseSection';
import { Footer } from '@/components/landing/Footer';

const Index = () => {
  return (
    <div className="min-h-screen bg-transparent text-foreground">
      <DashboardBackground />
      <Navbar />
      <main>
        <HeroSection />
        <AIFleetShowcase />
        <DemonstrationSection />
        <TrustFlowSection />
        <EdgeDiscoverySection />
        <PlatformStatsSection />
        <PricingSection />
        <ConfidenceCloseSection />
      </main>
      <Footer />
    </div>
  );
};

export default Index;
