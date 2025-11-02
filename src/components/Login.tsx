// Optional: Lazy-load Auth UI if used
// src/components/Login.tsx
import { Suspense, lazy } from 'react';
const AuthUI = lazy(() => import('@supabase/auth-ui-react'));

export default function Login() {
  return (
    <Suspense fallback={null}>
      <AuthUI /* props */ />
    </Suspense>
  );
}
