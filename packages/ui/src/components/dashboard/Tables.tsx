import React from 'react';
import type { ReactNode } from 'react';
import styles from './Tables.module.css';

interface DataTableProps {
    headers: string[];
    children: ReactNode;
}

export const DataTable: React.FC<DataTableProps> = ({ headers, children }) => {
    return (
        <div className={styles.tableContainer}>
            <table className={styles.table}>
                <thead>
                    <tr>
                        {headers.map((header, index) => (
                            <th key={index}>{header}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {children}
                </tbody>
            </table>
        </div>
    );
};

interface BadgeProps {
    children: ReactNode;
    variant?: 'success' | 'warning' | 'error' | 'info' | 'neutral';
    className?: string;
}

export const Badge: React.FC<BadgeProps> = ({ children, variant = 'neutral', className = '' }) => {
    const variantClass =
        variant === 'success' ? styles.badgeSuccess :
            variant === 'warning' ? styles.badgeWarning :
                variant === 'error' ? styles.badgeError :
                    variant === 'info' ? styles.badgeInfo :
                        styles.badgeNeutral;

    return (
        <span className={`${styles.badge} ${variantClass} ${className}`}>
            {children}
        </span>
    );
};
