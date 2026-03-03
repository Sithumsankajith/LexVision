import React from 'react';
import styles from './Button.module.css';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'secondary' | 'ghost' | 'outline' | 'danger' | 'whiteGhost' | 'whiteOutline';
    size?: 'sm' | 'md' | 'lg';
    isLoading?: boolean;
    leftIcon?: React.ReactNode;
    rightIcon?: React.ReactNode;
    fullWidth?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
    children,
    variant = 'primary',
    size = 'md',
    isLoading = false,
    leftIcon,
    rightIcon,
    fullWidth = false,
    className = '',
    disabled,
    ...props
}) => {
    const widthClass = fullWidth ? styles.full : '';
    const loadingClass = isLoading ? styles.loading : '';

    return (
        <button
            className={`
        ${styles.btn} 
        ${styles[variant]} 
        ${styles[size]} 
        ${widthClass} 
        ${loadingClass} 
        ${className}
      `}
            disabled={disabled || isLoading}
            {...props}
        >
            {isLoading && <span className={styles.spinner}></span>}
            {!isLoading && leftIcon && <span className={styles.iconLeft}>{leftIcon}</span>}
            <span className={styles.content}>{children}</span>
            {!isLoading && rightIcon && <span className={styles.iconRight}>{rightIcon}</span>}
        </button>
    );
};
