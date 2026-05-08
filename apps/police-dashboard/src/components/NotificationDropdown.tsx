import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    AlertTriangle,
    Bot,
    CheckCircle,
    FileText,
    Info,
    Loader2,
    Settings,
    Ticket,
    XCircle,
} from 'lucide-react';
import type { AppNotification } from '@lexvision/types';

interface NotificationDropdownProps {
    notifications: AppNotification[];
    loading: boolean;
    onMarkRead: (id: string) => void;
    onMarkAllRead: () => void;
    onClose: () => void;
    onViewAll: () => void;
}

const getTimeAgo = (isoDate: string): string => {
    const now = Date.now();
    const then = new Date(isoDate).getTime();
    const diffMs = now - then;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHr = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHr / 24);

    if (diffSec < 60) return 'just now';
    if (diffMin < 60) return `${diffMin}m ago`;
    if (diffHr < 24) return `${diffHr}h ago`;
    if (diffDay === 1) return 'yesterday';
    return `${diffDay}d ago`;
};

const getNotificationIcon = (type: string) => {
    switch (type) {
        case 'new_report_submitted':
        case 'high_priority_report':
            return <FileText size={15} />;
        case 'report_validated':
        case 'report_under_review':
            return <CheckCircle size={15} />;
        case 'report_rejected':
            return <XCircle size={15} />;
        case 'ai_analysis_completed':
        case 'ai_inference_failed':
            return <Bot size={15} />;
        case 'ticket_issued':
        case 'ticket_action_required':
            return <Ticket size={15} />;
        case 'system_warning':
            return <AlertTriangle size={15} />;
        case 'worker_failure':
            return <Settings size={15} />;
        default:
            return <Info size={15} />;
    }
};

const getPriorityColor = (priority: string): string => {
    if (priority === 'high') return '#ef4444';
    if (priority === 'normal') return '#f59e0b';
    return '#6b7280';
};

export const NotificationDropdown: React.FC<NotificationDropdownProps> = ({
    notifications,
    loading,
    onMarkRead,
    onMarkAllRead,
    onClose,
    onViewAll,
}) => {
    const navigate = useNavigate();
    const ref = useRef<HTMLDivElement>(null);
    const recent = notifications.slice(0, 5);

    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [onClose]);

    const handleItemClick = (n: AppNotification) => {
        if (!n.is_read) {
            onMarkRead(n.id);
        }
        if (n.related_entity_type === 'evidence_report' && n.related_entity_id) {
            onClose();
            navigate(`/dashboard/queue/${n.related_entity_id}`);
        } else if (n.related_entity_type === 'ticket' && n.related_entity_id) {
            onClose();
            navigate('/dashboard/history');
        }
    };

    return (
        <div
            ref={ref}
            style={{
                position: 'absolute',
                top: 'calc(100% + 8px)',
                right: 0,
                width: '360px',
                maxWidth: 'calc(100vw - 16px)',
                backgroundColor: '#1e293b',
                border: '1px solid #334155',
                borderRadius: '12px',
                boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
                zIndex: 1000,
                overflow: 'hidden',
            }}
        >
            {/* Header */}
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '14px 16px',
                    borderBottom: '1px solid #334155',
                }}
            >
                <span style={{ fontWeight: '700', fontSize: '0.9rem', color: '#f1f5f9' }}>
                    Notifications
                </span>
                <button
                    onClick={onMarkAllRead}
                    style={{
                        background: 'none',
                        border: 'none',
                        color: '#ef4444',
                        fontSize: '0.75rem',
                        fontWeight: '600',
                        cursor: 'pointer',
                        padding: '2px 6px',
                        borderRadius: '4px',
                    }}
                >
                    Mark all read
                </button>
            </div>

            {/* Body */}
            <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                {loading ? (
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: '8px',
                            padding: '32px 16px',
                            color: '#64748b',
                            fontSize: '0.875rem',
                        }}
                    >
                        <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                        Loading...
                    </div>
                ) : recent.length === 0 ? (
                    <div
                        style={{
                            textAlign: 'center',
                            padding: '32px 16px',
                            color: '#64748b',
                            fontSize: '0.875rem',
                        }}
                    >
                        No notifications yet
                    </div>
                ) : (
                    recent.map((n) => {
                        const priorityColor = getPriorityColor(n.priority);
                        return (
                            <div
                                key={n.id}
                                onClick={() => handleItemClick(n)}
                                style={{
                                    display: 'flex',
                                    gap: '10px',
                                    padding: '12px 16px',
                                    borderBottom: '1px solid #1e2d3d',
                                    cursor: 'pointer',
                                    backgroundColor: n.is_read ? 'transparent' : 'rgba(239,68,68,0.05)',
                                    transition: 'background-color 0.15s',
                                }}
                                onMouseEnter={(e) =>
                                    ((e.currentTarget as HTMLDivElement).style.backgroundColor = 'rgba(255,255,255,0.04)')
                                }
                                onMouseLeave={(e) =>
                                    ((e.currentTarget as HTMLDivElement).style.backgroundColor = n.is_read ? 'transparent' : 'rgba(239,68,68,0.05)')
                                }
                            >
                                {/* Icon */}
                                <div
                                    style={{
                                        flexShrink: 0,
                                        width: '28px',
                                        height: '28px',
                                        borderRadius: '6px',
                                        backgroundColor: `${priorityColor}22`,
                                        color: priorityColor,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        marginTop: '1px',
                                    }}
                                >
                                    {getNotificationIcon(n.notification_type)}
                                </div>

                                {/* Content */}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div
                                        style={{
                                            fontWeight: n.is_read ? '500' : '700',
                                            fontSize: '0.8125rem',
                                            color: '#f1f5f9',
                                            marginBottom: '2px',
                                            whiteSpace: 'nowrap',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                        }}
                                    >
                                        {n.title}
                                    </div>
                                    <div
                                        style={{
                                            fontSize: '0.75rem',
                                            color: '#94a3b8',
                                            overflow: 'hidden',
                                            textOverflow: 'ellipsis',
                                            display: '-webkit-box',
                                            WebkitLineClamp: 2,
                                            WebkitBoxOrient: 'vertical',
                                            lineHeight: 1.4,
                                        }}
                                    >
                                        {n.message}
                                    </div>
                                    <div style={{ fontSize: '0.7rem', color: '#475569', marginTop: '4px' }}>
                                        {getTimeAgo(n.created_at)}
                                    </div>
                                </div>

                                {/* Unread dot */}
                                {!n.is_read && (
                                    <div
                                        style={{
                                            flexShrink: 0,
                                            width: '7px',
                                            height: '7px',
                                            borderRadius: '50%',
                                            backgroundColor: '#ef4444',
                                            marginTop: '6px',
                                        }}
                                    />
                                )}
                            </div>
                        );
                    })
                )}
            </div>

            {/* Footer */}
            <div
                style={{
                    borderTop: '1px solid #334155',
                    padding: '10px 16px',
                    textAlign: 'center',
                }}
            >
                <button
                    onClick={() => {
                        onClose();
                        onViewAll();
                    }}
                    style={{
                        background: 'none',
                        border: 'none',
                        color: '#ef4444',
                        fontSize: '0.8125rem',
                        fontWeight: '600',
                        cursor: 'pointer',
                        width: '100%',
                        padding: '4px',
                    }}
                >
                    View all notifications
                </button>
            </div>
        </div>
    );
};
