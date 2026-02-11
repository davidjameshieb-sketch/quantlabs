import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

const Dashboard = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    // Default to Forex Command Center as the primary dashboard
    navigate('/dashboard/forex', { replace: true });
  }, [navigate]);

  return null;
};

export default Dashboard;
