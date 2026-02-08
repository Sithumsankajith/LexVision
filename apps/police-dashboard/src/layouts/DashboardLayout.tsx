import React, { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
    LayoutDashboard,
    List,
    History,
    Settings,
    Menu,
    Bell,
    LogOut,
    Siren
} from 'lucide-react';
import { Input, Button } from '@lexvision/ui';
import styles from './DashboardLayout.module.css';

export const DashboardLayout: React.FC = () => {
    const [isMobileOpen, setIsMobileOpen] = useState(false);
    const location = useLocation();

    const getPageTitle = () => {
        if (location.pathname === '/') return 'Officer Dashboard';
        if (location.pathname.startsWith('/queue')) return 'Violation Queue';
        if (location.pathname.startsWith('/history')) return 'Case History';
        if (location.pathname.startsWith('/settings')) return 'Settings';
        return 'Police Portal';
    };

    const toggleSidebar = () => setIsMobileOpen(!isMobileOpen);

    return (
        <div className={styles.layout}>
            {/* Sidebar */}
            <aside className={`${styles.sidebar} ${isMobileOpen ? styles.open : ''}`}>
                <div className={styles.sidebarHeader}>
                    <div className={styles.sideLogo}>
                        <Siren size={24} color="#ef4444" />
                        <span>LexVision Police</span>
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
                        to="/queue"
                        className={({ isActive }) => `${styles.navItem} ${isActive ? styles.active : ''}`}
                    >
                        <List size={20} />
                        <span>My Queue</span>
                    </NavLink>
                    <NavLink
                        to="/history"
                        className={({ isActive }) => `${styles.navItem} ${isActive ? styles.active : ''}`}
                    >
                        <History size={20} />
                        <span>History</span>
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
                    <div style={{ marginBottom: '12px', padding: '0 8px' }}>
                        <div style={{ fontWeight: '600' }}>Officer Perera</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>Traffic Div - Col 03</div>
                    </div>
                    <Button variant="outline" fullWidth leftIcon={<LogOut size={16} />}>
                        End Shift
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
                        <Input placeholder="Search Case ID..." />
                    </div>

                    <div style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
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
                </header>

                <main className={styles.contentArea} onClick={() => setIsMobileOpen(false)}>
                    <Outlet />
                </main>
            </div>
        </div>
    );
};
