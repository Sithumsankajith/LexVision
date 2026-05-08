import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Queue } from './pages/Queue';
import { ViolationDetails } from './pages/ViolationDetails';
import { History } from './pages/History';
import { Settings } from './pages/Settings';
import { Notifications } from './pages/Notifications';
import { DashboardLayout } from './layouts/DashboardLayout';
import { auth } from '@lexvision/api-client';

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
    const session = auth.getSession();
    if (!session || !['POLICE', 'ADMIN'].includes(session.role)) {
        if (session) {
            auth.logout();
        }
        return <Navigate to="/login" replace />;
    }
    return <>{children}</>;
};

function App() {
    return (
        <Router>
            <Routes>
                <Route path="/" element={<Navigate to="/login" replace />} />
                <Route path="/login" element={<Login />} />
                <Route
                    path="/dashboard"
                    element={
                        <ProtectedRoute>
                            <DashboardLayout />
                        </ProtectedRoute>
                    }
                >
                    <Route index element={<Dashboard />} />
                    <Route path="queue" element={<Queue />} />
                    <Route path="queue/:id" element={<ViolationDetails />} />
                    <Route path="history" element={<History />} />
                    <Route path="notifications" element={<Notifications />} />
                    <Route path="settings" element={<Settings />} />
                </Route>
            </Routes>
        </Router>
    );
}

export default App;
