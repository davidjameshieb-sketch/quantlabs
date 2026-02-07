import { DashboardBackground } from '@/components/landing/DashboardBackground';
import { Navbar } from '@/components/landing/Navbar';
import { HeroSection } from '@/components/landing/HeroSection';
import { FleetStatusBar } from '@/components/landing/FleetStatusBar';
import { AIFleetShowcase } from '@/components/landing/AIFleetShowcase';
import { IntelligenceFrameworkSection } from '@/components/landing/IntelligenceFrameworkSection';
import { GovernanceShowcase } from '@/components/landing/GovernanceShowcase';
import { OptimizationShowcase } from '@/components/landing/OptimizationShowcase';
import { EcosystemFlowSection } from '@/components/landing/EcosystemFlowSection';
import { FleetTruthWall } from '@/components/landing/FleetTruthWall';
import { TransparencyPhilosophySection } from '@/components/landing/TransparencyPhilosophySection';
import { AntiHypeTrustSection } from '@/components/landing/AntiHypeTrustSection';
import { AccessModelSection } from '@/components/landing/AccessModelSection';
import { PlatformVisionClose } from '@/components/landing/PlatformVisionClose';
import { Footer } from '@/components/landing/Footer';

const Index = () => {
  return (
    <div className="min-h-screen bg-transparent text-foreground">
      <DashboardBackground />
      <Navbar />
      <main>
        <HeroSection />
        <FleetStatusBar />
        <AIFleetShowcase />
        <IntelligenceFrameworkSection />
        <OptimizationShowcase />
        <GovernanceShowcase />
        <EcosystemFlowSection />
        <FleetTruthWall />
        <TransparencyPhilosophySection />
        <AntiHypeTrustSection />
        <AccessModelSection />
        <PlatformVisionClose />
      </main>
      <Footer />
    </div>
  );
};

export default Index;
