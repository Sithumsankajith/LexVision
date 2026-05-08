import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    FileText,
    BrainCircuit,
    Ticket,
    AlertTriangle,
    Bell,
    CheckCheck,
    ArrowRight,
    X,
} from 'lucide-react';
import type { AppNotification, NotificationType } from '@lexvision/types';

interface NotificationDropdownProps {
    notifications: AppNotification[];
    loading: boolean;
    onMarkRead: (id: string) => void;
    onMarkAllRead: () => void;
    onClose: () => void;
    onViewAll: () => void;
}

const getNotificationIcon = (type: NotificationType) => {
    if (type === 'new_report_submitted' || type === 'report_validated' || type === 'report_rejected' || type === 'report_submitted' || type === 'report_under_review') {
        return <FileText size={15} />;
    }
    if (type === 'ai_analysis_completed' || type === 'ai_inference_failed') {
        return <BrainCircuit size={15} />;
    }
    if (type === 'ticket_issued' || type === 'ticket_action_required') {
        return <Ticket size={15} />;
    }
    if (type === 'system_warning' || type === 'worker_failure') {
        return <AlertTriangle size={15} />;
    }
    return <Bell size={15} />;
};

const getPriorityColor = (priority: AppNotification['priority']): string => {
    if (priority === 'high') return '#ef4444';
    if (priority === 'normal') return '#f59e0b';
    return '#6b7280';
};

const timeAgo = (isoString: string): string => {
    const now = Date.now();
    const then = new Date(isoString).getTime();
    const diffSec = Math.floor((now - then) / 1000);
    if (diffSec < 60) return `${diffSec}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.floor(diffHr / 24);
    return `${diffDay}d ago`;
};

export const NotificationDropdown: React.FC<NotificationDropdownProps> = ({
    notifications,
    loading,
    onMarkRead,
    onMarkAllRead,
    onClose,
    onViewAll,
}) => {
    const dropdownRef = useRef<HTMLDivElement>(null);
    const navigate = useNavigate();
    const recent = notifications.slice(0, 5);

    // Close on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [onClose]);

    // Close on Escape
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handler);
        return () => document.removeEventListener('keydown', handler);
    }, [onClose]);

    const handleViewAll = () => {
        onViewAll();
        navigate('/dashboard/notifications');
        onClose();
    };

    return (
        <div
            ref={dropdownRef}
            role="dialog"
            aria-label="Notifications"
            style={{
                position: 'absolute',
                top: 'calc(100% + 8px)',
                right: 0,
                width: '360px',
                maxWidth: 'calc(100vw - 16px)',
                backgroundColor: '#1e293b',
                border: '1px solid #334155',
                borderRadius: '12px',
                boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)',
                zIndex: 1000,
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                maxHeight: '380px',
            }}
        >
            {/* Header */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '12px 16px',
                borderBottom: '1px solid #334155',
                flexShrink: 0,
            }}>
                <span style={{ fontSize: '0.875rem', fontWeight: '700', color: '#f1f5f9' }}>
                    Notifications
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <button
                        onClick={onMarkAllRead}
                        title="Mark all as read"
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '4px 8px',
                            border: 'none',
                            borderRadius: '6px',
                            backgroundColor: 'transparent',
                            color: '#64748b',
                            fontSize: '0.75rem',
                            fontWeight: '600',
                            cursor: 'pointer',
                            transition: 'color 0.15s',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.color = '#94a3b8')}
                        onMouseLeave={e => (e.currentTarget.style.color = '#64748b')}
                    >
                        <CheckCheck size={14} />
                        Mark all read
                    </button>
                    <button
                        onClick={onClose}
                        title="Close"
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '28px',
                            height: '28px',
                            border: 'none',
                            borderRadius: '6px',
                            backgroundColor: 'transparent',
                            color: '#64748b',
                            cursor: 'pointer',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.color = '#94a3b8')}
                        onMouseLeave={e => (e.currentTarget.style.color = '#64748b')}
                    >
                        <X size={14} />
                    </button>
                </div>
            </div>

            {/* Notification list */}
            <div style={{ overflowY: 'auto', flex: 1 }}>
                {loading && (
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '32px 16px',
                        color: '#64748b',
                        fontSize: '0.8125rem',
                    }}>
                        Loading…
                    </div>
                )}

                {!loading && recent.length === 0 && (
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '32px 16px',
                        gap: '8px',
                    }}>
                        <Bell size={28} color="#334155" />
                        <span style={{ color: '#64748b', fontSize: '0.8125rem' }}>No notifications</span>
                    </div>
                )}

                {!loading && recent.map(n => {
                    const accentColor = getPriorityColor(n.priority);
                    const isHighPriority = n.priority === 'high';
                    const isSystemWarning = n.notification_type === 'system_warning' || n.notification_type === 'worker_failure';

                    return (
                        <div
                            key={n.id}
                            onClick={() => !n.is_read && onMarkRead(n.id)}
                            style={{
                                display: 'flex',
                                alignItems: 'flex-start',
                                gap: '12px',
                                padding: '12px 16px',
                                borderBottom: '1px solid #1e293b',
                                backgroundColor: n.is_read
                                    ? 'transparent'
                                    : isHighPriority || isSystemWarning
                                        ? 'rgba(239, 68, 68, 0.06)'
                                        : 'rgba(248, 250, 252, 0.03)',
                                cursor: n.is_read ? 'default' : 'pointer',
                                transition: 'background-color 0.15s',
                                borderLeft: `3px solid ${n.is_read ? 'transparent' : accentColor}`,
                            }}
                            onMouseEnter={e => {
                                if (!n.is_read) (e.currentTarget as HTMLDivElement).style.backgroundColor =
                                    isHighPriority ? 'rgba(239, 68, 68, 0.1)' : 'rgba(248, 250, 252, 0.06)';
                            }}
                            onMouseLeave={e => {
                                if (!n.is_read) (e.currentTarget as HTMLDivElement).style.backgroundColor =
                                    isHighPriority || isSystemWarning ? 'rgba(239, 68, 68, 0.06)' : 'rgba(248, 250, 252, 0.03)';
                            }}
                        >
                            {/* Icon */}
                            <div style={{
                                width: '32px',
                                height: '32px',
                                borderRadius: '8px',
                                backgroundColor: `${accentColor}20`,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: accentColor,
                                flexShrink: 0,
                                marginTop: '1px',
                            }}>
                                {getNotificationIcon(n.notification_type)}
                            </div>

                            {/* Content */}
                            <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '6px',
                                    marginBottom: '2px',
                                }}>
                                    <span style={{
                                        fontSize: '0.8125rem',
                                        fontWeight: n.is_read ? '500' : '700',
                                        color: n.is_read ? '#94a3b8' : '#f1f5f9',
                                        flex: 1,
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                    }}>
                                        {n.title}
                                    </span>
                                    {!n.is_read && (
                                        <span style={{
                                            width: '7px',
                                            height: '7px',
                                            borderRadius: '50%',
                                            backgroundColor: accentColor,
                                            flexShrink: 0,
                                        }} />
                                    )}
                                </div>
                                <p style={{
                                    margin: 0,
                                    fontSize: '0.75rem',
                                    color: '#64748b',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                }}>
                                    {n.message}
                                </p>
                                <span style={{
                                    fontSize: '0.7rem',
                                    color: '#475569',
                                    fontWeight: '600',
                                    marginTop: '4px',
                                    display: 'block',
                                }}>
                                    {timeAgo(n.created_at)}
                                </span>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Footer */}
            <div style={{
                borderTop: '1px solid #334155',
                flexShrink: 0,
            }}>
                <button
                    onClick={handleViewAll}
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        width: '100%',
                        padding: '12px',
                        border: 'none',
                        backgroundColor: 'transparent',
                        color: '#3b82f6',
                        fontSize: '0.8125rem',
                        fontWeight: '700',
                        cursor: 'pointer',
                        transition: 'color 0.15s, background-color 0.15s',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgba(59, 130, 246, 0.08)')}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                >
                    View all notifications
                    <ArrowRight size={14} />
                </button>
            </div>
        </div>
    );
};
