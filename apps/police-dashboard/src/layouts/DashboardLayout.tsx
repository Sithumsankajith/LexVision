import React from 'react';
import { Outlet } from 'react-router-dom';
import { Navbar, Footer } from '@lexvision/ui';

export const DashboardLayout: React.FC = () => {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', width: '100%' }}>
            <Navbar />
            <main style={{ flex: 1, padding: 'var(--space-6)' }}>
                <Outlet />
            </main>
            <Footer />
        </div>
    );
};
