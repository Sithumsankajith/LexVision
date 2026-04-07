import React, { useState, useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { Navbar, Footer, PageTransition } from '@lexvision/ui';
import { auth } from '@lexvision/api-client';

const getNavbarSession = () => {
    const staffSession = auth.getSession();
    if (staffSession) {
        return { email: staffSession.email };
    }

    const citizenSession = auth.getCitizenSession();
    if (citizenSession) {
        return { email: citizenSession.phone_number };
    }

    return null;
};

export const PublicLayout: React.FC = () => {
    const navigate = useNavigate();
    const [session, setSession] = useState(getNavbarSession());

    useEffect(() => {
        // Simple listener for session changes if needed
        const interval = setInterval(() => {
            const currentSession = getNavbarSession();
            if (JSON.stringify(currentSession) !== JSON.stringify(session)) {
                setSession(currentSession);
            }
        }, 1000);
        return () => clearInterval(interval);
    }, [session]);

    const handleLogout = () => {
        auth.logout();
        auth.logoutCitizen();
        setSession(null);
        navigate('/portal');
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
