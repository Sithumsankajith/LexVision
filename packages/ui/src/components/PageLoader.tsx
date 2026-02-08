import React, { useEffect, useState } from 'react';

import styles from './PageLoader.module.css';

interface PageLoaderProps {
    isLoading: boolean;
}

export const PageLoader: React.FC<PageLoaderProps> = ({ isLoading }) => {
    const [shouldRender, setShouldRender] = useState(true);

    useEffect(() => {
        if (!isLoading) {
            const timer = setTimeout(() => {
                setShouldRender(false);
            }, 500); // Match CSS transition duration
            return () => clearTimeout(timer);
        }
    }, [isLoading]);

    if (!shouldRender) return null;

    return (
        <div
            className={styles.loaderContainer}
            style={{ opacity: isLoading ? 1 : 0, pointerEvents: isLoading ? 'all' : 'none' }}
        >
            <div className={styles.loaderContent}>
                <div className={styles.logo}>
                    <img src="/images/blue-lexvision.png" alt="Loading..." style={{ height: '80px', width: 'auto' }} />
                </div>
            </div>
        </div>
    );
};
