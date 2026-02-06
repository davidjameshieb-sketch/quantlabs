import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { AIIntelligencePanel } from '@/components/dashboard/AIIntelligencePanel';

export const DashboardBackground = () => {
  return (
    <div
      className="fixed inset-0 -z-10 overflow-hidden pointer-events-none select-none"
      aria-hidden="true"
    >
      {/* Render the real dashboard, non-interactive */}
      <div className="w-full h-full opacity-40">
        <DashboardLayout>
          <AIIntelligencePanel />
        </DashboardLayout>
      </div>

      {/* Subtle darkening overlay so text remains readable */}
      <div className="absolute inset-0 bg-background/60" />
    </div>
  );
};
