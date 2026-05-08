import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    AlertCircle,
    AlertTriangle,
    Bell,
    BellRing,
    CheckCircle2,
    FileText,
    Info,
    TicketIcon,
    X,
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

const getNotificationIcon = (type: string) => {
    const iconProps = { size: 16 };
    switch (type) {
        case 'report_submitted':
            return <FileText {...iconProps} style={{ color: '#14b8a6' }} />;
        case 'ai_analysis_completed':
            return <CheckCircle2 {...iconProps} style={{ color: '#14b8a6' }} />;
        case 'report_under_review':
            return <BellRing {...iconProps} style={{ color: '#f59e0b' }} />;
        case 'report_validated':
            return <CheckCircle2 {...iconProps} style={{ color: '#22c55e' }} />;
        case 'report_rejected':
            return <AlertCircle {...iconProps} style={{ color: '#ef4444' }} />;
        case 'ticket_issued':
            return <TicketIcon {...iconProps} style={{ color: '#f59e0b' }} />;
        case 'high_priority_report':
            return <AlertTriangle {...iconProps} style={{ color: '#f59e0b' }} />;
        case 'system_warning':
        case 'worker_failure':
        case 'ai_inference_failed':
            return <AlertCircle {...iconProps} style={{ color: '#ef4444' }} />;
        default:
            return <Info {...iconProps} style={{ color: '#94a3b8' }} />;
    }
};

const formatTimeAgo = (dateStr: string): string => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHr = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHr / 24);

    if (diffSec < 60) return 'just now';
    if (diffMin < 60) return `${diffMin} min ago`;
    if (diffHr < 24) return `${diffHr} hr ago`;
    if (diffDay === 1) return 'Yesterday';
    if (diffDay < 7) return `${diffDay} days ago`;
    return date.toLocaleDateString();
};

const truncate = (str: string, maxLen: number) =>
    str.length > maxLen ? `${str.slice(0, maxLen - 1)}…` : str;

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
    const hasUnread = notifications.some(n => !n.is_read);

    // Close on outside click
    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                onClose();
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, [onClose]);

    // Close on Escape
    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handleKey);
        return () => document.removeEventListener('keydown', handleKey);
    }, [onClose]);

    const handleNotificationClick = (n: AppNotification) => {
        if (!n.is_read) onMarkRead(n.id);
        if (n.related_entity_type === 'evidence_report' && n.related_entity_id) {
            navigate(`/portal/my-reports/${n.related_entity_id}`);
            onClose();
        }
    };

    return (
        <div
            ref={dropdownRef}
            role="dialog"
            aria-label="Notifications"
            style={{
                position: 'absolute',
                top: 'calc(100% + 12px)',
                right: 0,
                width: 360,
                maxWidth: 'calc(100vw - 32px)',
                background: '#1e293b',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 12,
                boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
                zIndex: 1100,
                overflow: 'hidden',
            }}
        >
            {/* Header */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '14px 16px',
                borderBottom: '1px solid rgba(255,255,255,0.08)',
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Bell size={16} style={{ color: '#14b8a6' }} />
                    <span style={{ color: '#f1f5f9', fontWeight: 600, fontSize: 14 }}>Notifications</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {hasUnread && (
                        <button
                            onClick={onMarkAllRead}
                            style={{
                                background: 'transparent',
                                border: 'none',
                                color: '#14b8a6',
                                fontSize: 12,
                                cursor: 'pointer',
                                padding: '4px 8px',
                                borderRadius: 6,
                                transition: 'background 0.15s',
                            }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(20,184,166,0.1)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                            Mark all read
                        </button>
                    )}
                    <button
                        onClick={onClose}
                        aria-label="Close notifications"
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#64748b',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            padding: 4,
                            borderRadius: 4,
                        }}
                    >
                        <X size={16} />
                    </button>
                </div>
            </div>

            {/* Body */}
            <div style={{ maxHeight: 340, overflowY: 'auto' }}>
                {loading && (
                    <div style={{ padding: '24px 16px', textAlign: 'center', color: '#64748b', fontSize: 14 }}>
                        Loading…
                    </div>
                )}

                {!loading && recent.length === 0 && (
                    <div style={{
                        padding: '32px 16px',
                        textAlign: 'center',
                        color: '#64748b',
                        fontSize: 14,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 8,
                    }}>
                        <Bell size={28} style={{ color: '#334155', marginBottom: 4 }} />
                        <span>No notifications yet</span>
                    </div>
                )}

                {!loading && recent.map(n => (
                    <div
                        key={n.id}
                        onClick={() => handleNotificationClick(n)}
                        style={{
                            display: 'flex',
                            gap: 12,
                            padding: '12px 16px',
                            cursor: (n.related_entity_type === 'evidence_report' && n.related_entity_id) ? 'pointer' : 'default',
                            background: n.is_read ? 'transparent' : 'rgba(20, 184, 166, 0.05)',
                            borderBottom: '1px solid rgba(255,255,255,0.06)',
                            transition: 'background 0.15s',
                        }}
                        onMouseEnter={e => {
                            (e.currentTarget as HTMLDivElement).style.background = n.is_read
                                ? 'rgba(255,255,255,0.03)'
                                : 'rgba(20, 184, 166, 0.08)';
                        }}
                        onMouseLeave={e => {
                            (e.currentTarget as HTMLDivElement).style.background = n.is_read
                                ? 'transparent'
                                : 'rgba(20, 184, 166, 0.05)';
                        }}
                    >
                        {/* Icon area */}
                        <div style={{
                            width: 32,
                            height: 32,
                            borderRadius: '50%',
                            background: 'rgba(255,255,255,0.06)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            flexShrink: 0,
                            marginTop: 2,
                        }}>
                            {getNotificationIcon(n.notification_type)}
                        </div>

                        {/* Content */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 4 }}>
                                <span style={{
                                    fontSize: 13,
                                    fontWeight: n.is_read ? 400 : 600,
                                    color: n.is_read ? '#94a3b8' : '#f1f5f9',
                                    lineHeight: 1.3,
                                }}>
                                    {truncate(n.title, 48)}
                                </span>
                                {!n.is_read && (
                                    <span style={{
                                        width: 8,
                                        height: 8,
                                        borderRadius: '50%',
                                        background: '#14b8a6',
                                        flexShrink: 0,
                                        marginTop: 4,
                                    }} />
                                )}
                            </div>
                            <p style={{
                                margin: '3px 0 0',
                                fontSize: 12,
                                color: '#64748b',
                                lineHeight: 1.4,
                            }}>
                                {truncate(n.message, 90)}
                            </p>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                                <span style={{ fontSize: 11, color: '#475569' }}>
                                    {formatTimeAgo(n.created_at)}
                                </span>
                                {!n.is_read && (
                                    <button
                                        onClick={e => { e.stopPropagation(); onMarkRead(n.id); }}
                                        style={{
                                            background: 'transparent',
                                            border: 'none',
                                            color: '#14b8a6',
                                            fontSize: 11,
                                            cursor: 'pointer',
                                            padding: 0,
                                        }}
                                    >
                                        Mark read
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Footer */}
            <div style={{
                padding: '10px 16px',
                borderTop: '1px solid rgba(255,255,255,0.08)',
                textAlign: 'center',
            }}>
                <button
                    onClick={() => { onViewAll(); onClose(); }}
                    style={{
                        background: 'transparent',
                        border: 'none',
                        color: '#14b8a6',
                        fontSize: 13,
                        cursor: 'pointer',
                        fontWeight: 500,
                        padding: '6px 12px',
                        borderRadius: 6,
                        transition: 'background 0.15s',
                        width: '100%',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(20,184,166,0.1)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                    View all notifications
                </button>
            </div>
        </div>
    );
};
