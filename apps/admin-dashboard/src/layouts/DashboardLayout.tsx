import React, { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
    LayoutDashboard,
    FileText,
    Settings,
    Users,
    Shield,
    Menu,
    Bell,
    LogOut
} from 'lucide-react';
import { Input, Button } from '@lexvision/ui';
import styles from './DashboardLayout.module.css';

export const DashboardLayout: React.FC = () => {
    const [isMobileOpen, setIsMobileOpen] = useState(false);
    const location = useLocation();

    const getPageTitle = () => {
        switch (location.pathname) {
            case '/': return 'Dashboard';
            case '/reports': return 'Reports Management';
            case '/users': return 'User Management';
            case '/settings': return 'Settings';
            default: return 'Admin Portal';
        }
    };

    const toggleSidebar = () => setIsMobileOpen(!isMobileOpen);

    return (
        <div className={styles.layout}>
            {/* Sidebar */}
            <aside className={`${styles.sidebar} ${isMobileOpen ? styles.open : ''}`}>
                <div className={styles.sidebarHeader}>
                    <div className={styles.logo}>
                        <Shield size={24} />
                        <span>LexVision Admin</span>
                    </div>
                </div>

                <nav className={styles.nav}>
                    <NavLink
                        to="/"
                        className={({ isActive }) => `${styles.navItem} ${isActive ? styles.active : ''}`}
                        end
                    >
                        <LayoutDashboard size={20} />
                        <span>Dashboard</span>
                    </NavLink>
                    <NavLink
                        to="/reports"
                        className={({ isActive }) => `${styles.navItem} ${isActive ? styles.active : ''}`}
                    >
                        <FileText size={20} />
                        <span>Reports</span>
                    </NavLink>
                    <NavLink
                        to="/users"
                        className={({ isActive }) => `${styles.navItem} ${isActive ? styles.active : ''}`}
                    >
                        <Users size={20} />
                        <span>Users</span>
                    </NavLink>
                    <NavLink
                        to="/settings"
                        className={({ isActive }) => `${styles.navItem} ${isActive ? styles.active : ''}`}
                    >
                        <Settings size={20} />
                        <span>Settings</span>
                    </NavLink>
                </nav>

                <div className={styles.userSection}>
                    <Button variant="outline" fullWidth leftIcon={<LogOut size={16} />}>
                        Sign Out
                    </Button>
                </div>
            </aside>

            {/* Main Content */}
            <div className={styles.mainContent}>
                <header className={styles.topbar}>
                    <button className={styles.mobileToggle} onClick={toggleSidebar}>
                        <Menu size={24} />
                    </button>

                    <h1 className={styles.pageTitle}>{getPageTitle()}</h1>

                    <div className={styles.searchBar}>
                        <Input placeholder="Search..." />
                    </div>

                    <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
                        <Button variant="ghost" size="sm">
                            <Bell size={20} />
                        </Button>
                        <div style={{ width: '32px', height: '32px', borderRadius: '50%', backgroundColor: '#ddd', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
                            A
                        </div>
                    </div>
                </header>

                <main className={styles.contentArea} onClick={() => setIsMobileOpen(false)}>
                    <Outlet />
                </main>
            </div>
        </div>
    );
};
