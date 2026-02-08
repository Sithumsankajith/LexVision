import React from 'react';
import { useLocation } from 'react-router-dom';

interface PageTransitionProps {
    children: React.ReactNode;
}

export const PageTransition: React.FC<PageTransitionProps> = ({ children }) => {
    const location = useLocation();

    // Simple key-based animation approach
    // When location changes, we key the wrapper div to trigger a CSS animation

    return (
        <div
            key={location.pathname}
            style={{
                animation: 'fadeIn 0.4s ease-out forwards',
            }}
        >
            <style>
                {`
                    @keyframes fadeIn {
                        from { opacity: 0; transform: translateY(10px); }
                        to { opacity: 1; transform: translateY(0); }
                    }
                    @media (prefers-reduced-motion: reduce) {
                        div[style*="animation"] {
                            animation: none !important;
                        }
                    }
                `}
            </style>
            {children}
        </div>
    );
};
