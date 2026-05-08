import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    AlertTriangle,
    Bell,
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
    error?: string | null;
    onMarkRead: (id: string) => void;
    onMarkAllRead: () => void;
    onClose: () => void;
    onViewAll: () => void;
    onRetry?: () => void;
}

const ACCENT = '#2563eb';
const MOBILE_DROPDOWN_QUERY = '(max-width: 640px)';

const useIsMobileDropdown = (): boolean => {
    const [isMobile, setIsMobile] = useState(() =>
        typeof window !== 'undefined' && window.matchMedia(MOBILE_DROPDOWN_QUERY).matches
    );

    useEffect(() => {
        if (typeof window === 'undefined') return;

        const media = window.matchMedia(MOBILE_DROPDOWN_QUERY);
        const handleChange = () => setIsMobile(media.matches);

        handleChange();
        media.addEventListener('change', handleChange);

        return () => media.removeEventListener('change', handleChange);
    }, []);

    return isMobile;
};

const getTimeAgo = (isoDate: string): string => {
    const diffSec = Math.floor((Date.now() - new Date(isoDate).getTime()) / 1000);
    if (diffSec < 60) return 'just now';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    if (diffSec < 172800) return 'yesterday';
    return `${Math.floor(diffSec / 86400)}d ago`;
};

const getCategoryMeta = (type: string): { icon: React.ReactNode; color: string } => {
    if (type === 'report_validated' || type === 'report_under_review') {
        return { icon: <CheckCircle size={15} />, color: '#0ea5e9' };
    }
    if (type === 'report_rejected') {
        return { icon: <XCircle size={15} />, color: '#64748b' };
    }
    if (type === 'new_report_submitted' || type === 'high_priority_report' || type === 'report_submitted') {
        return { icon: <FileText size={15} />, color: '#0ea5e9' };
    }
    if (type === 'ai_analysis_completed' || type === 'ai_inference_failed') {
        return { icon: <Bot size={15} />, color: '#7c3aed' };
    }
    if (type === 'ticket_issued' || type === 'ticket_action_required') {
        return { icon: <Ticket size={15} />, color: '#f59e0b' };
    }
    if (type === 'worker_failure') {
        return { icon: <Settings size={15} />, color: '#dc2626' };
    }
    if (type === 'system_warning') {
        return { icon: <AlertTriangle size={15} />, color: '#dc2626' };
    }
    return { icon: <Info size={15} />, color: '#64748b' };
};

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
    const navigate = useNavigate();
    const ref = useRef<HTMLDivElement>(null);
    const recent = notifications.slice(0, 5);
    const hasUnread = notifications.some((n) => !n.is_read);
    const unreadCount = notifications.filter((n) => !n.is_read).length;
    const isMobile = useIsMobileDropdown();

    const dropdownStyle: React.CSSProperties = {
        position: isMobile ? 'fixed' : 'absolute',
        top: isMobile ? 58 : 'calc(100% + 8px)',
        right: isMobile ? 16 : 0,
        left: isMobile ? 16 : undefined,
        width: isMobile ? 'auto' : 384,
        maxWidth: isMobile ? 'none' : 'calc(100vw - 2rem)',
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: 12,
        boxShadow: '0 16px 48px rgba(15,23,42,0.18)',
        zIndex: 1100,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        maxHeight: isMobile ? 'calc(100vh - 74px)' : 460,
    };

    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
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

    const handleItemClick = (n: AppNotification) => {
        if (!n.is_read) onMarkRead(n.id);
        onClose();
        if (n.related_entity_type === 'evidence_report' && n.related_entity_id) {
            const pendingTypes = new Set(['new_report_submitted', 'high_priority_report', 'ai_analysis_completed', 'report_under_review']);
            if (pendingTypes.has(n.notification_type)) {
                navigate(`/dashboard/queue/${n.related_entity_id}`);
            } else {
                navigate('/dashboard/history');
            }
        } else if (n.related_entity_type === 'ticket') {
            navigate('/dashboard/history');
        }
    };

    return (
        <div
            ref={ref}
            role="dialog"
            aria-label="Notifications"
            style={dropdownStyle}
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
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <Bell size={15} color={ACCENT} />
                    <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#0f172a' }}>Notifications</span>
                    {notifications.length > 0 && (
                        <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                            ({unreadCount} unread)
                        </span>
                    )}
                </div>
                {hasUnread && (
                    <button
                        onClick={onMarkAllRead}
                        style={{
                            background: 'none',
                            border: 'none',
                            color: ACCENT,
                            fontSize: '0.75rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            padding: '4px 6px',
                            borderRadius: 4,
                            whiteSpace: 'nowrap',
                            flexShrink: 0,
                        }}
                    >
                        Mark all read
                    </button>
                )}
            </div>

            {/* Body */}
            <div style={{ flex: 1, overflowY: 'auto', background: '#fff' }}>
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
                                onClick={() => handleItemClick(n)}
                                style={{
                                    display: 'flex',
                                    gap: 12,
                                    padding: '12px 16px',
                                    borderBottom: '1px solid #f1f5f9',
                                    cursor: 'pointer',
                                    background: n.is_read ? '#fff' : '#eff6ff',
                                    transition: 'background 0.15s',
                                }}
                                onMouseEnter={(e) => ((e.currentTarget as HTMLDivElement).style.background = n.is_read ? '#f8fafc' : '#dbeafe')}
                                onMouseLeave={(e) => ((e.currentTarget as HTMLDivElement).style.background = n.is_read ? '#fff' : '#eff6ff')}
                            >
                                <div
                                    style={{
                                        flexShrink: 0,
                                        width: 28,
                                        height: 28,
                                        borderRadius: 6,
                                        background: `${meta.color}1a`,
                                        color: meta.color,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        marginTop: 1,
                                    }}
                                >
                                    {meta.icon}
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontWeight: n.is_read ? 500 : 700, fontSize: '0.8125rem', color: '#0f172a', marginBottom: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {n.title}
                                    </div>
                                    <div style={{ fontSize: '0.75rem', color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', lineHeight: 1.4 }}>
                                        {n.message}
                                    </div>
                                    <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: 4 }}>{getTimeAgo(n.created_at)}</div>
                                </div>
                                {!n.is_read && (
                                    <div
                                        style={{
                                            flexShrink: 0,
                                            width: 7,
                                            height: 7,
                                            borderRadius: '50%',
                                            background: ACCENT,
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
            <div style={{ borderTop: '1px solid #f1f5f9', padding: '10px 16px', textAlign: 'center', background: '#fff' }}>
                <button
                    onClick={() => {
                        onClose();
                        onViewAll();
                    }}
                    style={{
                        background: 'none',
                        border: 'none',
                        color: ACCENT,
                        fontSize: '0.8125rem',
                        fontWeight: 600,
                        cursor: 'pointer',
                        width: '100%',
                        padding: 4,
                    }}
                >
                    View all notifications &rarr;
                </button>
            </div>
        </div>
    );
};
