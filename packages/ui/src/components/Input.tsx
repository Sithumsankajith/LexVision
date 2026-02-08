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
        const errorId = error ? `${props.id || 'input'}-error` : undefined;

        return (
            <div className={`${styles.container} ${widthClass} ${className}`}>
                {label && (
                    <label className={styles.label} htmlFor={props.id}>
                        {label}
                    </label>
                )}
                <input
                    ref={ref}
                    className={`${styles.input} ${errorClass}`}
                    aria-invalid={!!error}
                    aria-describedby={errorId}
                    {...props}
                />
                {error && (
                    <span id={errorId} className={styles.errorMessage} role="alert">
                        {error}
                    </span>
                )}
            </div>
        );
    }
);

Input.displayName = 'Input';
