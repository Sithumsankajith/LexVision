import React, { useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
    LayoutDashboard,
    FileText,
    Settings,
    Users,
    Shield,
    Bell,
    LogOut
} from 'lucide-react';
import { Button } from '@lexvision/ui';
import {
    DashboardShell,
    Sidebar,
    SidebarItem,
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
        if (location.pathname === '/dashboard') return 'Dashboard';
        if (location.pathname.startsWith('/dashboard/reports')) return 'Reports Management';
        if (location.pathname.startsWith('/dashboard/users')) return 'User Management';
        if (location.pathname.startsWith('/dashboard/settings')) return 'Settings';
        return 'Admin Portal';
    };

    const sidebar = (
        <Sidebar
            isOpen={isMobileOpen}
            logo={
                <>
                    <Shield size={24} />
                    <span>LexVision Admin</span>
                </>
            }
            footer={
                <Button variant="whiteOutline" fullWidth leftIcon={<LogOut size={16} />} onClick={handleLogout}>
                    Sign Out
                </Button>
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
                to="/dashboard/reports"
                icon={<FileText size={20} />}
                label="Reports"
            />
            <SidebarItem
                as={NavLink}
                to="/dashboard/users"
                icon={<Users size={20} />}
                label="Users"
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
                    </Button>
                    <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: '#ddd', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
                        A
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
