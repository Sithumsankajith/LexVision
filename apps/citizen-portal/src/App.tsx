import { Suspense, useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation, Navigate } from 'react-router-dom';
import { PublicLayout } from './layouts/PublicLayout';
import { Home } from '@/pages/public/Home';
import { HowItWorks } from '@/pages/public/HowItWorks';
import { Features } from '@/pages/public/Features';
import { Demo } from '@/pages/public/Demo';
import { FAQ } from '@/pages/public/FAQ';
import { Contact } from '@/pages/public/Contact';
import { Login } from '@/pages/public/Login';
import { Register } from '@/pages/public/Register';
import { PortalHome } from '@/pages/portal/PortalHome';
import { ReportWizard } from '@/pages/portal/ReportWizard';
import { TrackReport } from '@/pages/portal/TrackReport';
import { MyReports } from '@/pages/portal/MyReports';
import { MyReportDetail } from '@/pages/portal/MyReportDetail';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { PageLoader } from '@lexvision/ui';

// Simple fallback for Suspense (if used purely for code splitting later)
const Loading = () => null;

function AppContent() {
  const [loading, setLoading] = useState(true);
  const location = useLocation();

  useEffect(() => {
    const showTimer = setTimeout(() => {
      setLoading(true);
    }, 0);

    const hideTimer = setTimeout(() => {
      setLoading(false);
    }, 800);

    return () => {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
    };
  }, [location.pathname]);

  return (
    <>
      <PageLoader isLoading={loading} />
      <Suspense fallback={<Loading />}>
        <Routes>
          {/* Public Website Routes */}
          <Route path="/" element={<PublicLayout />}>
            <Route index element={<Home />} />
            <Route path="how-it-works" element={<HowItWorks />} />
            <Route path="features" element={<Features />} />
            <Route path="demo" element={<Demo />} />
            <Route path="faq" element={<FAQ />} />
            <Route path="contact" element={<Contact />} />
            <Route path="login" element={<Login />} />
            <Route path="register" element={<Register />} />
          </Route>

          {/* Citizen Portal Routes */}
          <Route path="/portal" element={<PublicLayout />}>
            <Route index element={<PortalHome />} />
            <Route path="report" element={<ReportWizard />} />
            <Route path="track" element={<TrackReport />} />
            <Route path="my-reports" element={
              <ProtectedRoute>
                <MyReports />
              </ProtectedRoute>
            } />
            <Route path="my-reports/:reportId" element={
              <ProtectedRoute>
                <MyReportDetail />
              </ProtectedRoute>
            } />
            <Route path="profile" element={
              <ProtectedRoute>
                <Navigate to="/portal/my-reports" replace />
              </ProtectedRoute>
            } />
          </Route>
        </Routes>
      </Suspense>
    </>
  );
}

function App() {
  return (
    <Router>
      <AppContent />
    </Router>
  );
}

export default App;
