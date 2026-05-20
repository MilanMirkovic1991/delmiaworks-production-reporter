import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client.js';

export function ProtectedRoute({ children }: { children: ReactNode }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['me'],
    queryFn: () => api.me(),
    retry: false,
  });
  if (isLoading) return <div className="app">Loading...</div>;
  if (isError || !data) return <Navigate to="/login" replace />;
  return <>{children}</>;
}
