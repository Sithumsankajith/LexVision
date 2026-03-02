import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { Navbar, Footer, PageTransition } from '@lexvision/ui';
import { auth } from '@lexvision/api-client';

export const PublicLayout: React.FC = () => {
    const navigate = useNavigate();
    const [session, setSession] = useState(auth.getSession());

    useEffect(() => {
        // Simple listener for session changes if needed
        const interval = setInterval(() => {
            const currentSession = auth.getSession();
            if (JSON.stringify(currentSession) !== JSON.stringify(session)) {
                setSession(currentSession);
            }
        }, 1000);
        return () => clearInterval(interval);
    }, [session]);

    const handleLogout = () => {
        auth.logout();
        setSession(null);
        navigate('/');
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', width: '100%' }}>
            <Navbar user={session} onLogout={handleLogout} />
            <main style={{ flex: 1 }}>
                <PageTransition>
                    <Outlet />
                </PageTransition>
            </main>
            <Footer />
        </div>
    );
};
