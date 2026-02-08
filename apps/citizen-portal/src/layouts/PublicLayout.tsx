import React from 'react';
import { Outlet } from 'react-router-dom';
import { Navbar, Footer, PageTransition } from '@lexvision/ui';

export const PublicLayout: React.FC = () => {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', width: '100%' }}>
            <Navbar />
            <main style={{ flex: 1 }}>
                <PageTransition>
                    <Outlet />
                </PageTransition>
            </main>
            <Footer />
        </div>
    );
};
