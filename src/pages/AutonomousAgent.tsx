import { AutonomousAgent } from '@/components/AutonomousAgent';
import { Auth } from '@/components/Auth';
import { useAuth } from '@/hooks/useAuth';

const AutonomousAgentPage = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-primary">Loading...</div>
      </div>
    );
  }

  if (!user) {
    return <Auth />;
  }

  return <AutonomousAgent />;
};

export default AutonomousAgentPage;
