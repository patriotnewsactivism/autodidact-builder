import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Brain, Activity } from 'lucide-react';
import { cn } from '@/lib/utils';

const navItems = [
  { to: '/', label: 'Home', icon: Brain },
  { to: '/agent', label: 'GitHub Sync', icon: Activity },
];

export const Navigation: React.FC = () => {
  const location = useLocation();

  return (
    <nav className="border-b border-border/50 bg-background/80 backdrop-blur-sm">
      <div className="container mx-auto px-6">
        <div className="flex items-center justify-between h-16">
          <Link to="/" className="flex items-center gap-2 font-bold text-xl">
            <Brain className="w-6 h-6 text-primary" />
            AutoDidact Builder
          </Link>

          <div className="flex items-center gap-1">
            {navItems.map(({ to, label, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                className={cn(
                  'flex items-center gap-2 px-4 py-2 rounded-lg transition-colors',
                  location.pathname === to
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                )}
              >
                <Icon className="w-4 h-4" />
                {label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </nav>
  );
};
