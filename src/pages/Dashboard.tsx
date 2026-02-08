import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import AIAgents from './AIAgents';

const Dashboard = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    if (searchParams.get('market') === 'forex') {
      navigate('/dashboard/forex', { replace: true });
    }
  }, [searchParams, navigate]);

  return <AIAgents />;
};

export default Dashboard;
