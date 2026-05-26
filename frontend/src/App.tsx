import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Login } from './pages/Login.js';
import { SelectEPlant } from './pages/SelectEPlant.js';
import { SalesOrdersList } from './pages/SalesOrdersList.js';
import { SalesOrderItems } from './pages/SalesOrderItems.js';
import { ReleasesPage } from './pages/Releases.js';
import { WorkOrdersPage } from './pages/WorkOrders.js';
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
          <Route path="/select-eplant" element={<ProtectedRoute requireEPlant={false}><SelectEPlant /></ProtectedRoute>} />
          <Route path="/" element={<ProtectedRoute><SalesOrdersList /></ProtectedRoute>} />
          <Route path="/sales-order/items" element={<ProtectedRoute><SalesOrderItems /></ProtectedRoute>} />
          <Route path="/releases" element={<ProtectedRoute><ReleasesPage /></ProtectedRoute>} />
          <Route path="/work-orders" element={<ProtectedRoute><WorkOrdersPage /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
