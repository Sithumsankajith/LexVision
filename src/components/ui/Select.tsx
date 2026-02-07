import React, { forwardRef } from 'react';
import styles from './Select.module.css';

interface Option {
    value: string;
    label: string;
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
    label?: string;
    options: Option[];
    error?: string;
    fullWidth?: boolean;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
    ({ label, options, error, fullWidth = false, className = '', ...props }, ref) => {
        const widthClass = fullWidth ? styles.full : '';
        const errorClass = error ? styles.hasError : '';

        return (
            <div className={`${styles.container} ${widthClass} ${className}`}>
                {label && <label className={styles.label}>{label}</label>}
                <div className={styles.selectWrapper}>
                    <select
                        ref={ref}
                        className={`${styles.select} ${errorClass}`}
                        {...props}
                    >
                        {options.map((option) => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                </div>
                {error && <span className={styles.errorMessage}>{error}</span>}
            </div>
        );
    }
);

Select.displayName = 'Select';
