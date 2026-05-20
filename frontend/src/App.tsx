import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Login } from './pages/Login.js';
import { ItemSearch } from './pages/ItemSearch.js';
import { SalesOrdersPage } from './pages/SalesOrders.js';
import { ReleasesPage } from './pages/Releases.js';
import { BomView } from './pages/BomView.js';
import { ProtectedRoute } from './components/ProtectedRoute.js';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 30_000 } },
});

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<ProtectedRoute><ItemSearch /></ProtectedRoute>} />
          <Route path="/sales-orders" element={<ProtectedRoute><SalesOrdersPage /></ProtectedRoute>} />
          <Route path="/releases" element={<ProtectedRoute><ReleasesPage /></ProtectedRoute>} />
          <Route path="/bom" element={<ProtectedRoute><BomView /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
