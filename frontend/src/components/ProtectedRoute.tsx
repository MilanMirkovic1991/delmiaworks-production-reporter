import { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client.js';

export function ProtectedRoute({ children, requireEPlant = true }: { children: ReactNode; requireEPlant?: boolean }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['me'],
    queryFn: () => api.me(),
    retry: false,
  });
  const loc = useLocation();
  if (isLoading) return <div className="app">Učitavam...</div>;
  if (isError || !data) return <Navigate to="/login" replace />;
  if (requireEPlant && (!data.eplantId || data.eplantId === 0) && loc.pathname !== '/select-eplant') {
    return <Navigate to="/select-eplant" replace />;
  }
  return <>{children}</>;
}
