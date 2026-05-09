import React, { useState, useEffect, useCallback } from 'react';
import { Outlet, useNavigate } from 'react-router-dom';
import { Navbar, Footer, PageTransition } from '@lexvision/ui';
import { auth } from '@lexvision/api-client';
import { NotificationBell } from '@/components/NotificationBell';
import { NotificationDropdown } from '@/components/NotificationDropdown';
import { useNotifications } from '@/hooks/useNotifications';

const getNavbarSession = () => {
    const staffSession = auth.getSession();
    if (staffSession) {
        return { email: staffSession.email };
    }

    return null;
};

const NotificationBellWrapper: React.FC = () => {
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);
    const { unreadCount, notifications, loading, error, fetchNotifications, markRead, markAllRead } = useNotifications();

    const handleOpen = useCallback(async () => {
        setOpen(prev => {
            if (!prev) {
                // Fetch latest when opening
                fetchNotifications({ limit: 5 }).catch(() => undefined);
            }
            return !prev;
        });
    }, [fetchNotifications]);

    const handleViewAll = useCallback(() => {
        navigate('/portal/notifications');
    }, [navigate]);

    return (
        <div style={{ position: 'relative' }}>
            <NotificationBell count={unreadCount} onClick={handleOpen} />
            {open && (
                <NotificationDropdown
                    notifications={notifications}
                    loading={loading}
                    error={error}
                    onMarkRead={markRead}
                    onMarkAllRead={markAllRead}
                    onClose={() => setOpen(false)}
                    onViewAll={handleViewAll}
                    onRetry={() => fetchNotifications()}
                />
            )}
        </div>
    );
};

export const PublicLayout: React.FC = () => {
    const navigate = useNavigate();
    const [session, setSession] = useState(getNavbarSession());
    const [isCitizenLoggedIn, setIsCitizenLoggedIn] = useState(auth.hasCitizenPortalAccess());

    useEffect(() => {
        // Simple listener for session changes if needed
        const interval = setInterval(() => {
            const currentSession = getNavbarSession();
            if (JSON.stringify(currentSession) !== JSON.stringify(session)) {
                setSession(currentSession);
            }
            const citizenLoggedIn = auth.hasCitizenPortalAccess();
            if (citizenLoggedIn !== isCitizenLoggedIn) {
                setIsCitizenLoggedIn(citizenLoggedIn);
            }
        }, 1000);
        return () => clearInterval(interval);
    }, [session, isCitizenLoggedIn]);

    const handleLogout = () => {
        auth.logout();
        setSession(null);
        setIsCitizenLoggedIn(false);
        navigate('/portal');
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', width: '100%' }}>
            <Navbar
                user={session}
                onLogout={handleLogout}
                notificationSlot={isCitizenLoggedIn ? <NotificationBellWrapper /> : undefined}
            />
            <main style={{ flex: 1 }}>
                <PageTransition>
                    <Outlet />
                </PageTransition>
            </main>
            <Footer />
        </div>
    );
};
