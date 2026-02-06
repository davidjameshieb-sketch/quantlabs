import { DashboardBackground } from '@/components/landing/DashboardBackground';
import { Navbar } from '@/components/landing/Navbar';
import { HeroSection } from '@/components/landing/HeroSection';
import { FleetStatusBar } from '@/components/landing/FleetStatusBar';
import { AIFleetShowcase } from '@/components/landing/AIFleetShowcase';
import { EcosystemFlowSection } from '@/components/landing/EcosystemFlowSection';
import { FleetTruthWall } from '@/components/landing/FleetTruthWall';
import { TransparencyPhilosophySection } from '@/components/landing/TransparencyPhilosophySection';
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
        <EcosystemFlowSection />
        <FleetTruthWall />
        <TransparencyPhilosophySection />
        <AccessModelSection />
        <PlatformVisionClose />
      </main>
      <Footer />
    </div>
  );
};

export default Index;
