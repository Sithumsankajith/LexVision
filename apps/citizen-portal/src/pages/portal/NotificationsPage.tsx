import React, { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import {
    AlertCircle,
    AlertTriangle,
    Bell,
    BellRing,
    CheckCircle2,
    ChevronLeft,
    ChevronRight,
    FileText,
    Info,
    TicketIcon,
    Trash2,
} from 'lucide-react';
import { auth } from '@lexvision/api-client';
import type { AppNotification } from '@lexvision/types';
import { useNotifications } from '@/hooks/useNotifications';

// ---- helpers ----

const getNotificationIcon = (type: string, priority: string) => {
    const size = 20;
    if (priority === 'high') {
        return <AlertTriangle size={size} style={{ color: '#f59e0b' }} />;
    }
    switch (type) {
        case 'report_submitted':
            return <FileText size={size} style={{ color: '#14b8a6' }} />;
        case 'ai_analysis_completed':
            return <CheckCircle2 size={size} style={{ color: '#14b8a6' }} />;
        case 'report_under_review':
            return <BellRing size={size} style={{ color: '#f59e0b' }} />;
        case 'report_validated':
            return <CheckCircle2 size={size} style={{ color: '#22c55e' }} />;
        case 'report_rejected':
            return <AlertCircle size={size} style={{ color: '#ef4444' }} />;
        case 'ticket_issued':
            return <TicketIcon size={size} style={{ color: '#f59e0b' }} />;
        case 'system_warning':
        case 'worker_failure':
        case 'ai_inference_failed':
            return <AlertCircle size={size} style={{ color: '#ef4444' }} />;
        default:
            return <Info size={size} style={{ color: '#64748b' }} />;
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

    if (diffSec < 60) return 'Just now';
    if (diffMin < 60) return `${diffMin} min ago`;
    if (diffHr < 24) return `${diffHr} hr ago`;
    if (diffDay === 1) return 'Yesterday';
    if (diffDay < 7) return `${diffDay} days ago`;
    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
};

const PAGE_SIZE = 20;

// ---- Skeleton ----

const NotificationSkeleton: React.FC = () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {Array.from({ length: 5 }).map((_, i) => (
            <div
                key={i}
                style={{
                    background: '#1e293b',
                    border: '1px solid rgba(255,255,255,0.06)',
                    borderRadius: 12,
                    padding: '16px 20px',
                    display: 'flex',
                    gap: 16,
                    alignItems: 'flex-start',
                }}
            >
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#334155', flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                    <div style={{ width: '55%', height: 14, background: '#334155', borderRadius: 6, marginBottom: 8 }} />
                    <div style={{ width: '80%', height: 12, background: '#293548', borderRadius: 6, marginBottom: 6 }} />
                    <div style={{ width: '30%', height: 10, background: '#243044', borderRadius: 6 }} />
                </div>
            </div>
        ))}
    </div>
);

// ---- Notification Card ----

interface NotificationCardProps {
    notification: AppNotification;
    onMarkRead: (id: string) => void;
    onDelete: (id: string) => void;
}

const NotificationCard: React.FC<NotificationCardProps> = ({ notification: n, onMarkRead, onDelete }) => {
    const isHighPriority = n.priority === 'high';
    const hasLink = n.related_entity_type === 'evidence_report' && n.related_entity_id;

    return (
        <div
            style={{
                background: n.is_read ? '#1e293b' : 'rgba(20, 184, 166, 0.06)',
                border: `1px solid ${isHighPriority ? 'rgba(245, 158, 11, 0.3)' : 'rgba(255,255,255,0.07)'}`,
                borderRadius: 12,
                padding: '16px 20px',
                display: 'flex',
                gap: 16,
                alignItems: 'flex-start',
                transition: 'background 0.15s',
            }}
        >
            {/* Icon */}
            <div style={{
                width: 40,
                height: 40,
                borderRadius: '50%',
                background: 'rgba(255,255,255,0.05)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
            }}>
                {getNotificationIcon(n.notification_type, n.priority)}
            </div>

            {/* Content */}
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span style={{
                            fontSize: 15,
                            fontWeight: n.is_read ? 400 : 600,
                            color: n.is_read ? '#94a3b8' : '#f1f5f9',
                        }}>
                            {n.title}
                        </span>
                        {!n.is_read && (
                            <span style={{
                                width: 8,
                                height: 8,
                                borderRadius: '50%',
                                background: '#14b8a6',
                                display: 'inline-block',
                                flexShrink: 0,
                            }} />
                        )}
                        {isHighPriority && (
                            <span style={{
                                fontSize: 11,
                                fontWeight: 600,
                                color: '#f59e0b',
                                background: 'rgba(245, 158, 11, 0.12)',
                                border: '1px solid rgba(245, 158, 11, 0.3)',
                                borderRadius: 4,
                                padding: '1px 6px',
                                textTransform: 'uppercase',
                                letterSpacing: '0.04em',
                            }}>
                                High priority
                            </span>
                        )}
                    </div>
                    <span style={{ fontSize: 12, color: '#475569', flexShrink: 0 }}>
                        {formatTimeAgo(n.created_at)}
                    </span>
                </div>

                <p style={{
                    margin: '6px 0 0',
                    fontSize: 14,
                    color: n.is_read ? '#64748b' : '#94a3b8',
                    lineHeight: 1.5,
                }}>
                    {n.message}
                </p>

                {/* Actions row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10, flexWrap: 'wrap' }}>
                    {hasLink && (
                        <Link
                            to={`/portal/my-reports/${n.related_entity_id!}`}
                            style={{
                                fontSize: 13,
                                color: '#14b8a6',
                                textDecoration: 'none',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 4,
                                fontWeight: 500,
                            }}
                        >
                            View report <ChevronRight size={14} />
                        </Link>
                    )}
                    {!n.is_read && (
                        <button
                            onClick={() => onMarkRead(n.id)}
                            style={{
                                background: 'transparent',
                                border: '1px solid rgba(20,184,166,0.3)',
                                color: '#14b8a6',
                                fontSize: 12,
                                cursor: 'pointer',
                                padding: '3px 10px',
                                borderRadius: 6,
                                transition: 'background 0.15s',
                            }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(20,184,166,0.1)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                            Mark as read
                        </button>
                    )}
                    <button
                        onClick={() => onDelete(n.id)}
                        aria-label="Delete notification"
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: '#475569',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            padding: 4,
                            borderRadius: 4,
                            transition: 'color 0.15s',
                        }}
                        onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                        onMouseLeave={e => (e.currentTarget.style.color = '#475569')}
                    >
                        <Trash2 size={14} />
                    </button>
                </div>
            </div>
        </div>
    );
};

// ---- Main page ----

export const NotificationsPage: React.FC = () => {
    const [page, setPage] = useState(0);
    const { notifications, loading, error, unreadCount, fetchNotifications, markRead, markAllRead, deleteNotification } =
        useNotifications();

    const isAuthenticated = auth.isCitizenAuthenticated() || auth.hasCitizenPortalAccess();
    const isDemoOnly = auth.isClientOnlyDemoCitizenSession();

    if (!isAuthenticated) {
        return <Navigate to="/login" replace />;
    }

    // eslint-disable-next-line react-hooks/rules-of-hooks
    useEffect(() => {
        if (!isDemoOnly) {
            fetchNotifications({ offset: page * PAGE_SIZE, limit: PAGE_SIZE });
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [page, isDemoOnly]);

    const hasUnread = unreadCount > 0;

    return (
        <div style={{ background: '#0f172a', minHeight: '100vh', padding: '40px 16px 80px' }}>
            <div style={{ maxWidth: 720, margin: '0 auto' }}>
                {/* Page header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28, flexWrap: 'wrap', gap: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{
                            width: 44,
                            height: 44,
                            borderRadius: '50%',
                            background: 'rgba(20,184,166,0.12)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}>
                            <Bell size={22} style={{ color: '#14b8a6' }} />
                        </div>
                        <div>
                            <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: '#f1f5f9' }}>
                                My Notifications
                            </h1>
                            {hasUnread && (
                                <p style={{ margin: 0, fontSize: 13, color: '#64748b' }}>
                                    {unreadCount} unread
                                </p>
                            )}
                        </div>
                    </div>

                    {hasUnread && !isDemoOnly && (
                        <button
                            onClick={markAllRead}
                            style={{
                                background: 'rgba(20,184,166,0.1)',
                                border: '1px solid rgba(20,184,166,0.3)',
                                color: '#14b8a6',
                                fontSize: 13,
                                fontWeight: 500,
                                cursor: 'pointer',
                                padding: '8px 16px',
                                borderRadius: 8,
                                transition: 'background 0.15s',
                            }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'rgba(20,184,166,0.18)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'rgba(20,184,166,0.1)')}
                        >
                            Mark all as read
                        </button>
                    )}
                </div>

                {/* Demo mode banner */}
                {isDemoOnly && (
                    <div style={{
                        background: 'rgba(245, 158, 11, 0.08)',
                        border: '1px solid rgba(245, 158, 11, 0.25)',
                        borderRadius: 12,
                        padding: '16px 20px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        marginBottom: 24,
                    }}>
                        <Info size={20} style={{ color: '#f59e0b', flexShrink: 0 }} />
                        <div>
                            <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#f59e0b' }}>
                                Notifications not available in demo mode
                            </p>
                            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#92400e' }}>
                                Sign in with a verified phone number to receive real-time notifications about your reports.
                            </p>
                        </div>
                    </div>
                )}

                {/* Error state */}
                {error && !isDemoOnly && (
                    <div style={{
                        background: 'rgba(239, 68, 68, 0.08)',
                        border: '1px solid rgba(239, 68, 68, 0.25)',
                        borderRadius: 12,
                        padding: '16px 20px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        marginBottom: 24,
                    }}>
                        <AlertCircle size={20} style={{ color: '#ef4444', flexShrink: 0 }} />
                        <div>
                            <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#ef4444' }}>
                                Could not load notifications
                            </p>
                            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#dc2626' }}>{error}</p>
                        </div>
                        <button
                            onClick={() => fetchNotifications({ offset: page * PAGE_SIZE, limit: PAGE_SIZE })}
                            style={{
                                marginLeft: 'auto',
                                background: 'transparent',
                                border: '1px solid rgba(239,68,68,0.4)',
                                color: '#ef4444',
                                fontSize: 12,
                                cursor: 'pointer',
                                padding: '6px 12px',
                                borderRadius: 6,
                                flexShrink: 0,
                            }}
                        >
                            Retry
                        </button>
                    </div>
                )}

                {/* Loading skeleton */}
                {loading && <NotificationSkeleton />}

                {/* Empty state */}
                {!loading && !isDemoOnly && notifications.length === 0 && !error && (
                    <div style={{
                        background: '#1e293b',
                        border: '1px solid rgba(255,255,255,0.07)',
                        borderRadius: 16,
                        padding: '60px 24px',
                        textAlign: 'center',
                    }}>
                        <Bell size={48} style={{ color: '#334155', marginBottom: 16 }} />
                        <h2 style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 600, color: '#64748b' }}>
                            No notifications yet
                        </h2>
                        <p style={{ margin: 0, fontSize: 14, color: '#475569' }}>
                            When you submit reports or they are updated, you'll receive notifications here.
                        </p>
                    </div>
                )}

                {/* Notification list */}
                {!loading && !isDemoOnly && notifications.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {notifications.map(n => (
                            <NotificationCard
                                key={n.id}
                                notification={n}
                                onMarkRead={markRead}
                                onDelete={deleteNotification}
                            />
                        ))}
                    </div>
                )}

                {/* Pagination */}
                {!loading && !isDemoOnly && notifications.length > 0 && (
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 12,
                        marginTop: 32,
                    }}>
                        <button
                            onClick={() => setPage(p => Math.max(0, p - 1))}
                            disabled={page === 0}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                background: '#1e293b',
                                border: '1px solid rgba(255,255,255,0.1)',
                                color: page === 0 ? '#334155' : '#94a3b8',
                                fontSize: 13,
                                cursor: page === 0 ? 'not-allowed' : 'pointer',
                                padding: '8px 14px',
                                borderRadius: 8,
                            }}
                        >
                            <ChevronLeft size={15} /> Previous
                        </button>
                        <span style={{ fontSize: 13, color: '#64748b' }}>Page {page + 1}</span>
                        <button
                            onClick={() => setPage(p => p + 1)}
                            disabled={notifications.length < PAGE_SIZE}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                background: '#1e293b',
                                border: '1px solid rgba(255,255,255,0.1)',
                                color: notifications.length < PAGE_SIZE ? '#334155' : '#94a3b8',
                                fontSize: 13,
                                cursor: notifications.length < PAGE_SIZE ? 'not-allowed' : 'pointer',
                                padding: '8px 14px',
                                borderRadius: 8,
                            }}
                        >
                            Next <ChevronRight size={15} />
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};
