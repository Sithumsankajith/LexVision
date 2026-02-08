import React from 'react';
import type { ReactNode } from 'react';
import { Menu } from 'lucide-react';
import styles from './Topbar.module.css';

interface TopbarProps {
    title: string;
    onMobileToggle: () => void;
    search?: ReactNode;
    actions?: ReactNode;
}

export const Topbar: React.FC<TopbarProps> = ({ title, onMobileToggle, search, actions }) => {
    return (
        <header className={styles.topbar}>
            <button className={styles.mobileToggle} onClick={onMobileToggle}>
                <Menu size={24} />
            </button>
            <h1 className={styles.title}>{title}</h1>
            {search && <div className={styles.search}>{search}</div>}
            {actions && <div className={styles.actions}>{actions}</div>}
        </header>
    );
};
