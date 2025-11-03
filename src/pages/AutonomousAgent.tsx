import { IntegratedAgentWorkspace } from '@/components/IntegratedAgentWorkspace';
import { Auth } from '@/components/Auth';
import { useAuth } from '@/auth/AuthProvider';
import { Loader2 } from 'lucide-react';

const AutonomousAgentPage = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
          <p className="text-slate-400">Initializing autonomous agent...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Auth />;
  }

  return <IntegratedAgentWorkspace />;
};

export default AutonomousAgentPage;
