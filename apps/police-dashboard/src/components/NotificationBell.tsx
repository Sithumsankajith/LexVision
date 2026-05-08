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
            style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                border: 'none',
                backgroundColor: 'transparent',
                color: '#94a3b8',
                cursor: 'pointer',
                transition: 'background-color 0.15s, color 0.15s',
                flexShrink: 0,
            }}
            onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#1e293b';
                (e.currentTarget as HTMLButtonElement).style.color = '#f1f5f9';
            }}
            onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
                (e.currentTarget as HTMLButtonElement).style.color = '#94a3b8';
            }}
            aria-label={count > 0 ? `${count} unread notifications` : 'Notifications'}
            title="Notifications"
        >
            <Bell size={20} />
            {count > 0 && (
                <span
                    style={{
                        position: 'absolute',
                        top: '4px',
                        right: '4px',
                        minWidth: '16px',
                        height: '16px',
                        borderRadius: '999px',
                        backgroundColor: '#ef4444',
                        color: '#fff',
                        fontSize: '0.65rem',
                        fontWeight: '800',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        lineHeight: 1,
                        padding: '0 3px',
                        border: '1.5px solid #0f172a',
                        letterSpacing: '-0.01em',
                    }}
                >
                    {count > 99 ? '99+' : count}
                </span>
            )}
        </button>
    );
};
