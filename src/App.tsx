import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import TimeBasedThemeProvider from "@/components/TimeBasedThemeProvider";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Trial from "./pages/Trial";
import Dashboard from "./pages/Dashboard";
import Connectors from "./pages/Connectors";
import RawData from "./pages/RawData";
import ResetPassword from "./pages/ResetPassword";
import NotFound from "./pages/NotFound";
import AdminPanel from "./pages/AdminPanel";
import HealthProgression from "./pages/HealthProgression";
import PrivacyPolicy from "./pages/PrivacyPolicy";
import TermsOfService from "./pages/TermsOfService";
import Blog from "./pages/Blog";
import WhatIsCustomerHealthScore from "./pages/blog/WhatIsCustomerHealthScore";
import CustomerHealthScoreVsNps from "./pages/blog/CustomerHealthScoreVsNps";
import CustomerSuccessKpis from "./pages/blog/CustomerSuccessKpis";
import Contact from "./pages/Contact";

const queryClient = new QueryClient();

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/auth" replace />;
  return <>{children}</>;
};

const App = () => (
  <TimeBasedThemeProvider>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/trial" element={<Trial />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
              <Route path="/connectors" element={<ProtectedRoute><Connectors /></ProtectedRoute>} />
              <Route path="/raw-data" element={<ProtectedRoute><RawData /></ProtectedRoute>} />
              <Route path="/health-progression" element={<ProtectedRoute><HealthProgression /></ProtectedRoute>} />
              <Route path="/admin-9x7k" element={<AdminPanel />} />
              <Route path="/privacy" element={<PrivacyPolicy />} />
              <Route path="/terms" element={<TermsOfService />} />
              <Route path="/blog" element={<Blog />} />
              <Route path="/blog/what-is-customer-health-score" element={<WhatIsCustomerHealthScore />} />
              <Route path="/blog/customer-health-score-vs-nps" element={<CustomerHealthScoreVsNps />} />
              <Route path="/blog/customer-success-kpis-saas-2026" element={<CustomerSuccessKpis />} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </TimeBasedThemeProvider>
);

export default App;
