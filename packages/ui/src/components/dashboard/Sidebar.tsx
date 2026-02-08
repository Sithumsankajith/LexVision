import React from 'react';
import type { ReactNode } from 'react';
import styles from './Sidebar.module.css';

interface SidebarProps {
    logo: ReactNode;
    children: ReactNode;
    footer?: ReactNode;
    isOpen: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({ logo, children, footer, isOpen }) => {
    return (
        <aside className={`${styles.sidebar} ${isOpen ? styles.sidebarOpen : styles.sidebarClosed}`}>
            <div className={styles.header}>
                <div className={styles.logo}>{logo}</div>
            </div>
            <nav className={styles.nav}>
                {children}
            </nav>
            {footer && <div className={styles.footer}>{footer}</div>}
        </aside>
    );
};

interface SidebarItemProps {
    icon?: ReactNode;
    label: string;
    isActive?: boolean;
    onClick?: () => void;
    to?: string; // Optional for wrapping with NavLink
    as?: React.ElementType; // To allow passing NavLink or other components
}

export const SidebarItem: React.FC<SidebarItemProps> = ({ icon, label, isActive, onClick, as: Component = 'button', ...props }) => {
    return (
        <Component
            className={`${styles.navItem} ${isActive ? styles.navItemActive : ''}`}
            onClick={onClick}
            {...props}
        >
            {icon}
            <span>{label}</span>
        </Component>
    );
};
