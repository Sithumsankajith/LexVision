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
    Loader2,
    TicketIcon,
    XCircle,
    X,
} from 'lucide-react';
import type { AppNotification } from '@lexvision/types';

interface NotificationDropdownProps {
    notifications: AppNotification[];
    loading: boolean;
    error?: string | null;
    onMarkRead: (id: string) => void;
    onMarkAllRead: () => void;
    onClose: () => void;
    onViewAll: () => void;
    onRetry?: () => void;
}

const ACCENT = '#0d9488';

const getCategoryMeta = (type: string): { icon: React.ReactNode; color: string } => {
    if (type === 'report_validated') return { icon: <CheckCircle2 size={15} />, color: '#10b981' };
    if (type === 'report_under_review') return { icon: <BellRing size={15} />, color: '#f59e0b' };
    if (type === 'report_rejected') return { icon: <XCircle size={15} />, color: '#ef4444' };
    if (type === 'report_submitted') return { icon: <FileText size={15} />, color: ACCENT };
    if (type === 'ai_analysis_completed') return { icon: <CheckCircle2 size={15} />, color: '#7c3aed' };
    if (type === 'ai_inference_failed') return { icon: <AlertCircle size={15} />, color: '#ef4444' };
    if (type === 'ticket_issued') return { icon: <TicketIcon size={15} />, color: '#f59e0b' };
    if (type === 'high_priority_report') return { icon: <AlertTriangle size={15} />, color: '#f59e0b' };
    return { icon: <Info size={15} />, color: '#64748b' };
};

const formatTimeAgo = (dateStr: string): string => {
    const diffSec = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (diffSec < 60) return 'just now';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)} min ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} hr ago`;
    if (diffSec < 172800) return 'yesterday';
    return `${Math.floor(diffSec / 86400)} days ago`;
};

const truncate = (str: string, maxLen: number) =>
    str.length > maxLen ? `${str.slice(0, maxLen - 1)}…` : str;

const SkeletonItem: React.FC = () => (
    <div style={{ display: 'flex', gap: 12, padding: '12px 16px', borderBottom: '1px solid #f1f5f9' }}>
        <div style={{ width: 28, height: 28, borderRadius: 6, background: '#eef2f7', flexShrink: 0 }} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ height: 10, background: '#eef2f7', borderRadius: 4, width: '60%' }} />
            <div style={{ height: 8, background: '#f1f5f9', borderRadius: 4, width: '85%' }} />
        </div>
    </div>
);

export const NotificationDropdown: React.FC<NotificationDropdownProps> = ({
    notifications,
    loading,
    error,
    onMarkRead,
    onMarkAllRead,
    onClose,
    onViewAll,
    onRetry,
}) => {
    const dropdownRef = useRef<HTMLDivElement>(null);
    const navigate = useNavigate();
    const recent = notifications.slice(0, 5);
    const hasUnread = notifications.some((n) => !n.is_read);

    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
                onClose();
            }
        };
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('mousedown', handleClick);
        document.addEventListener('keydown', handleKey);
        return () => {
            document.removeEventListener('mousedown', handleClick);
            document.removeEventListener('keydown', handleKey);
        };
    }, [onClose]);

    const handleNotificationClick = (n: AppNotification) => {
        if (!n.is_read) onMarkRead(n.id);
        if (n.related_entity_type === 'evidence_report' && n.related_entity_id) {
            navigate(`/portal/my-reports/${n.related_entity_id}`);
            onClose();
        } else if (n.related_entity_type === 'ticket') {
            navigate('/portal/my-reports');
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
                width: 380,
                maxWidth: 'calc(100vw - 32px)',
                background: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: 12,
                boxShadow: '0 16px 48px rgba(15,23,42,0.18)',
                zIndex: 1100,
                overflow: 'hidden',
            }}
        >
            {/* Header */}
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '12px 16px',
                    borderBottom: '1px solid #f1f5f9',
                }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Bell size={15} color={ACCENT} />
                    <span style={{ color: '#0f172a', fontWeight: 700, fontSize: 14 }}>Notifications</span>
                    {notifications.length > 0 && (
                        <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                            ({notifications.filter((n) => !n.is_read).length} unread)
                        </span>
                    )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {hasUnread && (
                        <button
                            onClick={onMarkAllRead}
                            style={{
                                background: 'transparent',
                                border: 'none',
                                color: ACCENT,
                                fontSize: 12,
                                fontWeight: 600,
                                cursor: 'pointer',
                                padding: '4px 8px',
                                borderRadius: 6,
                            }}
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
                            color: '#94a3b8',
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
            <div style={{ maxHeight: 360, overflowY: 'auto' }}>
                {loading && recent.length === 0 ? (
                    <>
                        <SkeletonItem />
                        <SkeletonItem />
                        <SkeletonItem />
                    </>
                ) : error ? (
                    <div style={{ padding: '24px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, textAlign: 'center' }}>
                        <AlertTriangle size={22} color="#f59e0b" />
                        <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#0f172a' }}>Could not load notifications</div>
                        {onRetry && (
                            <button
                                onClick={onRetry}
                                style={{
                                    fontSize: '0.75rem',
                                    fontWeight: 600,
                                    color: ACCENT,
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                    padding: 4,
                                }}
                            >
                                Try again
                            </button>
                        )}
                    </div>
                ) : recent.length === 0 ? (
                    <div style={{ padding: '32px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, textAlign: 'center' }}>
                        <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <Bell size={18} color="#94a3b8" />
                        </div>
                        <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#0f172a' }}>No notifications</div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>You are all caught up.</div>
                    </div>
                ) : (
                    recent.map((n) => {
                        const meta = getCategoryMeta(n.notification_type);
                        return (
                            <div
                                key={n.id}
                                onClick={() => handleNotificationClick(n)}
                                style={{
                                    display: 'flex',
                                    gap: 12,
                                    padding: '12px 16px',
                                    cursor: n.related_entity_type === 'evidence_report' && n.related_entity_id ? 'pointer' : 'default',
                                    background: n.is_read ? '#fff' : '#f0fdfa',
                                    borderBottom: '1px solid #f1f5f9',
                                    transition: 'background 0.15s',
                                }}
                                onMouseEnter={(e) => ((e.currentTarget as HTMLDivElement).style.background = n.is_read ? '#f8fafc' : '#ccfbf1')}
                                onMouseLeave={(e) => ((e.currentTarget as HTMLDivElement).style.background = n.is_read ? '#fff' : '#f0fdfa')}
                            >
                                <div
                                    style={{
                                        width: 28,
                                        height: 28,
                                        borderRadius: 6,
                                        background: `${meta.color}1a`,
                                        color: meta.color,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        flexShrink: 0,
                                        marginTop: 2,
                                    }}
                                >
                                    {meta.icon}
                                </div>

                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 13, fontWeight: n.is_read ? 500 : 700, color: '#0f172a', lineHeight: 1.3 }}>
                                        {truncate(n.title, 48)}
                                    </div>
                                    <p style={{ margin: '3px 0 0', fontSize: 12, color: '#64748b', lineHeight: 1.4 }}>
                                        {truncate(n.message, 90)}
                                    </p>
                                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>{formatTimeAgo(n.created_at)}</div>
                                </div>

                                {!n.is_read && (
                                    <span
                                        style={{
                                            width: 7,
                                            height: 7,
                                            borderRadius: '50%',
                                            background: ACCENT,
                                            flexShrink: 0,
                                            marginTop: 6,
                                        }}
                                    />
                                )}
                            </div>
                        );
                    })
                )}
                {loading && recent.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: 8, color: '#94a3b8', fontSize: '0.75rem' }}>
                        <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />
                        Refreshing...
                    </div>
                )}
            </div>

            {/* Footer */}
            <div style={{ padding: '10px 16px', borderTop: '1px solid #f1f5f9', textAlign: 'center' }}>
                <button
                    onClick={() => {
                        onViewAll();
                        onClose();
                    }}
                    style={{
                        background: 'transparent',
                        border: 'none',
                        color: ACCENT,
                        fontSize: 13,
                        cursor: 'pointer',
                        fontWeight: 600,
                        padding: '6px 12px',
                        borderRadius: 6,
                        width: '100%',
                    }}
                >
                    View all notifications &rarr;
                </button>
            </div>
        </div>
    );
};
