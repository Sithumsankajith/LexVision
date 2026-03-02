import { Suspense, useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
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
import { Profile } from '@/pages/portal/Profile';
import { ProtectedRoute } from '@/components/ProtectedRoute';
import { PageLoader } from '@lexvision/ui';

// Simple fallback for Suspense (if used purely for code splitting later)
const Loading = () => null;

function AppContent() {
  const [loading, setLoading] = useState(true);
  const location = useLocation();

  useEffect(() => {
    // Show loader on every location change
    setLoading(true);

    // Hide after a reasonable duration to show animation
    const timer = setTimeout(() => {
      setLoading(false);
    }, 800);

    return () => clearTimeout(timer);
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
            <Route path="report" element={
              <ProtectedRoute>
                <ReportWizard />
              </ProtectedRoute>
            } />
            <Route path="track" element={<TrackReport />} />
            <Route path="profile" element={
              <ProtectedRoute>
                <Profile />
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
