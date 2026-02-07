import React from 'react';
import styles from './Card.module.css';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
    children: React.ReactNode;
    className?: string;
    padding?: 'none' | 'sm' | 'md' | 'lg';
    hoverable?: boolean;
}

export const Card: React.FC<CardProps> = ({
    children,
    className = '',
    padding = 'md',
    hoverable = false,
    ...props
}) => {
    const paddingClass = styles[`padding-${padding}`];
    const hoverClass = hoverable ? styles.hoverable : '';

    return (
        <div className={`${styles.card} ${paddingClass} ${hoverClass} ${className}`} {...props}>
            {children}
        </div>
    );
};
