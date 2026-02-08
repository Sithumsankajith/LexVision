import React from 'react';
import type { ReactNode } from 'react';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import styles from './KpiCard.module.css';

interface KpiCardProps {
    label: string;
    value: string | number;
    trend?: string;
    trendDirection?: 'up' | 'down' | 'neutral';
    icon?: ReactNode;
    color?: 'primary' | 'success' | 'warning' | 'error';
}

export const KpiCard: React.FC<KpiCardProps> = ({
    label,
    value,
    trend,
    trendDirection,
    icon,
    color
}) => {
    return (
        <div className={`${styles.kpiCard} ${color ? `${styles.kpiCardWithBorder} ${styles['border' + color.charAt(0).toUpperCase() + color.slice(1)]}` : ''}`}>
            <div className={styles.kpiHeader}>
                <span className={styles.kpiLabel}>{label}</span>
                {icon}
            </div>
            <div className={styles.kpiValue}>{value}</div>
            {trend && (
                <div className={`${styles.kpiTrend} ${trendDirection === 'up' ? styles.trendUp :
                    trendDirection === 'down' ? styles.trendDown :
                        styles.trendNeutral
                    }`}>
                    {trendDirection === 'up' && <TrendingUp size={16} />}
                    {trendDirection === 'down' && <TrendingDown size={16} />}
                    {trendDirection === 'neutral' && <Minus size={16} />}
                    <span>{trend}</span>
                </div>
            )}
        </div>
    );
};
