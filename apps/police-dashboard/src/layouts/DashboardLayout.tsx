import React, { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
    LayoutDashboard,
    List,
    History,
    Settings,
    Bell,
    LogOut,
    Siren
} from 'lucide-react';
import { Button } from '@lexvision/ui';
import {
    DashboardShell,
    Sidebar,
    SidebarItem,
    SidebarFooterName,
    SidebarFooterRole,
    Topbar
} from '@lexvision/ui';
import { auth } from '@lexvision/api-client';

export const DashboardLayout: React.FC = () => {
    const [isMobileOpen, setIsMobileOpen] = useState(false);
    const location = useLocation();
    const navigate = useNavigate();

    const handleLogout = () => {
        auth.logout();
        navigate('/login');
    };

    const getPageTitle = () => {
        if (location.pathname === '/dashboard') return 'Officer Dashboard';
        if (location.pathname.startsWith('/dashboard/queue')) return 'Violation Queue';
        if (location.pathname.startsWith('/dashboard/history')) return 'Case History';
        if (location.pathname.startsWith('/dashboard/settings')) return 'Settings';
        return 'Police Portal';
    };

    const sidebar = (
        <Sidebar
            isOpen={isMobileOpen}
            logo={
                <>
                    <Siren size={24} color="#ef4444" />
                    <span>LexVision Police</span>
                </>
            }
            footer={
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                    <div>
                        <SidebarFooterName>Officer Perera</SidebarFooterName>
                        <SidebarFooterRole>Traffic Div - Col 03</SidebarFooterRole>
                    </div>
                    <Button variant="whiteOutline" fullWidth leftIcon={<LogOut size={16} />} onClick={handleLogout}>
                        End Shift
                    </Button>
                </div>
            }
        >
            <SidebarItem
                as={NavLink}
                to="/dashboard"
                icon={<LayoutDashboard size={20} />}
                label="Dashboard"
                end
            />
            <SidebarItem
                as={NavLink}
                to="/dashboard/queue"
                icon={<List size={20} />}
                label="My Queue"
            />
            <SidebarItem
                as={NavLink}
                to="/dashboard/history"
                icon={<History size={20} />}
                label="History"
            />
            <SidebarItem
                as={NavLink}
                to="/dashboard/settings"
                icon={<Settings size={20} />}
                label="Settings"
            />
        </Sidebar>
    );

    const topbar = (
        <Topbar
            title={getPageTitle()}
            onMobileToggle={() => setIsMobileOpen(!isMobileOpen)}
            actions={
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    <Button variant="ghost" size="sm">
                        <Bell size={20} />
                        <span style={{
                            position: 'absolute',
                            top: '8px',
                            right: '8px',
                            width: '8px',
                            height: '8px',
                            backgroundColor: '#ef4444',
                            borderRadius: '50%'
                        }} />
                    </Button>
                    <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: '#1e293b', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
                        OP
                    </div>
                </div>
            }
        />
    );

    return (
        <DashboardShell
            sidebar={sidebar}
            topbar={topbar}
            onMobileMenuClose={() => setIsMobileOpen(false)}
        >
            <Outlet />
        </DashboardShell>
    );
};
