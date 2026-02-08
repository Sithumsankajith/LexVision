import React from 'react';
import type { ReactNode } from 'react';
import styles from './Panel.module.css';

interface PanelProps extends React.HTMLAttributes<HTMLDivElement> {
    title?: string;
    action?: ReactNode;
    children: ReactNode;
    noPadding?: boolean;
}

export const Panel: React.FC<PanelProps> = ({ title, action, children, noPadding = false, className = '', ...props }) => {
    return (
        <div className={`${styles.panel} ${className}`} {...props}>
            {(title || action) && (
                <div className={styles.panelHeader}>
                    {title && <h3 className={styles.panelTitle}>{title}</h3>}
                    {action && <div>{action}</div>}
                </div>
            )}
            <div className={noPadding ? styles.panelContentNoPadding : styles.panelContent}>
                {children}
            </div>
        </div>
    );
};
