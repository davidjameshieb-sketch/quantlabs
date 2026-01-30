import { useParams } from 'react-router-dom';
import { DashboardLayout } from '@/components/dashboard/DashboardLayout';
import { TickerDetail } from '@/components/dashboard/TickerDetail';

const TickerPage = () => {
  return (
    <DashboardLayout>
      <TickerDetail />
    </DashboardLayout>
  );
};

export default TickerPage;
