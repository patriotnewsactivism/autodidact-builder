import { useContext } from 'react';
import { AuthContext } from '@/auth/auth-context';

export const useAuth = () => useContext(AuthContext);

