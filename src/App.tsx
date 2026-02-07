import { Suspense } from 'react';
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

// Simple loading component
const Loading = () => <div style={{ padding: '20px', textAlign: 'center' }}>Loading...</div>;

function App() {
  return (
    <Router>
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
