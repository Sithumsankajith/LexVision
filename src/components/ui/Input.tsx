import React, { forwardRef } from 'react';
import styles from './Input.module.css';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
    label?: string;
    error?: string;
    fullWidth?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
    ({ label, error, fullWidth = false, className = '', ...props }, ref) => {
        const widthClass = fullWidth ? styles.full : '';
        const errorClass = error ? styles.hasError : '';

        return (
            <div className={`${styles.container} ${widthClass} ${className}`}>
                {label && <label className={styles.label}>{label}</label>}
                <input
                    ref={ref}
                    className={`${styles.input} ${errorClass}`}
                    {...props}
                />
                {error && <span className={styles.errorMessage}>{error}</span>}
            </div>
        );
    }
);

Input.displayName = 'Input';
