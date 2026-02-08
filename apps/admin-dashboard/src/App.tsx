import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { DashboardLayout } from './layouts/DashboardLayout';

function App() {
    return (
        <Router>
            <Routes>
                <Route path="/" element={<Navigate to="/login" replace />} />
                <Route path="/login" element={<Login />} />
                <Route path="/dashboard" element={<DashboardLayout />}>
                    <Route index element={<Dashboard />} />
                </Route>
            </Routes>
        </Router>
    );
}

export default App;
