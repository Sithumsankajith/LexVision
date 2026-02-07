import { Suspense, useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { PublicLayout } from './layouts/PublicLayout';
import { Home } from './pages/public/Home';
import { HowItWorks } from './pages/public/HowItWorks';
import { Features } from './pages/public/Features';
import { Demo } from './pages/public/Demo';
import { FAQ } from './pages/public/FAQ';
import { Contact } from './pages/public/Contact';
import { PortalHome } from './pages/portal/PortalHome';
import { ReportWizard } from './pages/portal/ReportWizard';
import { TrackReport } from './pages/portal/TrackReport';
import { PageLoader } from './components/ui/PageLoader';

// Simple fallback for Suspense (if used purely for code splitting later)
const Loading = () => null;

function App() {
  const [initialLoad, setInitialLoad] = useState(true);

  useEffect(() => {
    // Simulate initial asset loading / app readiness
    const timer = setTimeout(() => {
      setInitialLoad(false);
    }, 1000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <Router>
      <PageLoader isLoading={initialLoad} />
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
          </Route>

          {/* Citizen Portal Routes */}
          {/* Reusing PublicLayout for now, but could be separate */}
          <Route path="/portal" element={<PublicLayout />}>
            <Route index element={<PortalHome />} />
            <Route path="report" element={<ReportWizard />} />
            <Route path="track" element={<TrackReport />} />
          </Route>
        </Routes>
      </Suspense>
    </Router>
  );
}

export default App;
