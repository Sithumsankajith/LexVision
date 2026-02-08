import React from 'react';
import type { ReactNode } from 'react';
import styles from './DashboardShell.module.css';

interface DashboardShellProps {
    sidebar: ReactNode;
    topbar: ReactNode;
    children: ReactNode;
    isMobileMenuOpen?: boolean;
    onMobileMenuClose?: () => void;
}

export const DashboardShell: React.FC<DashboardShellProps> = ({
    sidebar,
    topbar,
    children,
    onMobileMenuClose
}) => {
    return (
        <div className={styles.shell}>
            {sidebar}
            <div className={styles.main}>
                {topbar}
                <main className={styles.content} onClick={onMobileMenuClose}>
                    {children}
                </main>
            </div>
        </div>
    );
};
