import React from 'react';
import { Bell } from 'lucide-react';

interface NotificationBellProps {
    count: number;
    onClick: () => void;
}

export const NotificationBell: React.FC<NotificationBellProps> = ({ count, onClick }) => {
    return (
        <button
            onClick={onClick}
            aria-label={count > 0 ? `${count} unread notifications` : 'Notifications'}
            style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 36,
                height: 36,
                background: 'rgba(255,255,255,0.1)',
                border: '1px solid rgba(255,255,255,0.25)',
                borderRadius: '8px',
                cursor: 'pointer',
                color: 'rgba(255,255,255,0.85)',
                transition: 'background 0.2s, color 0.2s, border-color 0.2s',
                padding: 0,
                flexShrink: 0,
            }}
            onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.2)';
                (e.currentTarget as HTMLButtonElement).style.color = '#ffffff';
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.45)';
            }}
            onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.1)';
                (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.85)';
                (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.25)';
            }}
        >
            <Bell size={18} />
            {count > 0 && (
                <span
                    aria-hidden="true"
                    style={{
                        position: 'absolute',
                        top: -4,
                        right: -4,
                        minWidth: 18,
                        height: 18,
                        padding: '0 4px',
                        borderRadius: 9,
                        background: '#ef4444',
                        color: '#ffffff',
                        fontSize: 11,
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        lineHeight: 1,
                        boxShadow: '0 0 0 2px var(--color-primary)',
                    }}
                >
                    {count > 99 ? '99+' : count}
                </span>
            )}
        </button>
    );
};
