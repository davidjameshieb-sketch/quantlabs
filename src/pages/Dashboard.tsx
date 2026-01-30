import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { MarketScanner } from '@/components/dashboard/MarketScanner';

const Dashboard = () => {
  return (
    <DashboardLayout>
      <MarketScanner />
    </DashboardLayout>
  );
};

export default Dashboard;
