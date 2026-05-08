import React from 'react';
import { Bell } from 'lucide-react';

interface NotificationBellProps {
    count: number;
    onClick: () => void;
}

export const NotificationBell: React.FC<NotificationBellProps> = ({ count, onClick }) => {
    const hasUnread = count > 0;

    return (
        <button
            onClick={onClick}
            aria-label={hasUnread ? `${count} unread notifications` : 'Notifications'}
            style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '36px',
                height: '36px',
                border: 'none',
                borderRadius: '8px',
                backgroundColor: 'transparent',
                cursor: 'pointer',
                color: 'var(--color-text-secondary, #94a3b8)',
                transition: 'background-color 0.15s ease, color 0.15s ease',
                outline: 'none',
            }}
            onMouseEnter={e => {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#1e293b';
                (e.currentTarget as HTMLButtonElement).style.color = '#f1f5f9';
            }}
            onMouseLeave={e => {
                (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
                (e.currentTarget as HTMLButtonElement).style.color = 'var(--color-text-secondary, #94a3b8)';
            }}
        >
            <Bell size={20} />
            {hasUnread && (
                <span
                    aria-hidden="true"
                    style={{
                        position: 'absolute',
                        top: '2px',
                        right: '2px',
                        minWidth: '18px',
                        height: '18px',
                        paddingInline: '4px',
                        borderRadius: '9px',
                        backgroundColor: '#ef4444',
                        color: '#ffffff',
                        fontSize: '0.65rem',
                        fontWeight: '800',
                        lineHeight: '18px',
                        textAlign: 'center',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 0 0 2px #0f172a',
                        letterSpacing: '-0.02em',
                    }}
                >
                    {count > 99 ? '99+' : count}
                </span>
            )}
        </button>
    );
};
