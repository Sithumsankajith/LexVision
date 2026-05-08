import React, { useEffect, useState } from 'react';
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
import { useNotifications } from '../hooks/useNotifications';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const REPORT_TYPES = new Set([
    'new_report_submitted',
    'report_validated',
    'report_rejected',
    'report_under_review',
    'report_submitted',
    'high_priority_report',
]);
const AI_TYPES = new Set(['ai_analysis_completed', 'ai_inference_failed']);
const TICKET_TYPES = new Set(['ticket_issued', 'ticket_action_required']);
const SYSTEM_TYPES = new Set(['system_warning', 'worker_failure']);

type Tab = 'all' | 'reports' | 'ai' | 'tickets' | 'system';

const TABS: { key: Tab; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'reports', label: 'Reports' },
    { key: 'ai', label: 'AI / ML' },
    { key: 'tickets', label: 'Tickets' },
    { key: 'system', label: 'System' },
];

const filterByTab = (items: AppNotification[], tab: Tab): AppNotification[] => {
    if (tab === 'all') return items;
    if (tab === 'reports') return items.filter((n) => REPORT_TYPES.has(n.notification_type));
    if (tab === 'ai') return items.filter((n) => AI_TYPES.has(n.notification_type));
    if (tab === 'tickets') return items.filter((n) => TICKET_TYPES.has(n.notification_type));
    if (tab === 'system') return items.filter((n) => SYSTEM_TYPES.has(n.notification_type));
    return items;
};

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

const getNotificationIcon = (type: string, color: string) => {
    const iconProps = { size: 18, color };
    switch (type) {
        case 'new_report_submitted':
        case 'report_submitted':
        case 'high_priority_report':
            return <FileText {...iconProps} />;
        case 'report_validated':
        case 'report_under_review':
            return <CheckCircle {...iconProps} />;
        case 'report_rejected':
            return <XCircle {...iconProps} />;
        case 'ai_analysis_completed':
        case 'ai_inference_failed':
            return <Bot {...iconProps} />;
        case 'ticket_issued':
        case 'ticket_action_required':
            return <Ticket {...iconProps} />;
        case 'system_warning':
            return <AlertTriangle {...iconProps} />;
        case 'worker_failure':
            return <Settings {...iconProps} />;
        default:
            return <Info {...iconProps} />;
    }
};

const getBorderColor = (priority: string): string => {
    if (priority === 'high') return '#ef4444';
    if (priority === 'normal') return '#f59e0b';
    return '#6b7280';
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const Notifications: React.FC = () => {
    const navigate = useNavigate();
    const { notifications, loading, error, unreadCount, fetchNotifications, markRead, markAllRead } =
        useNotifications();
    const [activeTab, setActiveTab] = useState<Tab>('all');

    useEffect(() => {
        fetchNotifications();
    }, []);

    const filtered = filterByTab(notifications, activeTab);

    const handleNotificationClick = (n: AppNotification) => {
        if (!n.is_read) {
            markRead(n.id);
        }

        if (!n.related_entity_type || !n.related_entity_id) return;

        if (n.related_entity_type === 'evidence_report') {
            const pendingStatuses = new Set(['submitted', 'under-review', 'pending']);
            const extra = n.extra_data || {};
            const status = typeof extra.status === 'string' ? extra.status : '';
            if (pendingStatuses.has(status)) {
                navigate(`/dashboard/queue/${n.related_entity_id}`);
            } else {
                navigate('/dashboard/history');
            }
        } else if (n.related_entity_type === 'ticket') {
            navigate('/dashboard/history');
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
            {/* Page header */}
            <div
                style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: '12px',
                }}
            >
                <div>
                    <h1
                        style={{
                            margin: 0,
                            fontSize: '2rem',
                            fontWeight: '800',
                            color: 'var(--color-text)',
                            letterSpacing: '-0.02em',
                        }}
                    >
                        Notification Centre
                    </h1>
                    <p
                        style={{
                            margin: 'var(--space-1) 0 0 0',
                            color: 'var(--color-text-secondary)',
                            fontSize: '0.95rem',
                            fontWeight: '500',
                        }}
                    >
                        {unreadCount > 0
                            ? `${unreadCount} unread notification${unreadCount !== 1 ? 's' : ''}`
                            : 'All caught up'}
                    </p>
                </div>

                {unreadCount > 0 && (
                    <button
                        onClick={markAllRead}
                        style={{
                            padding: '8px 20px',
                            borderRadius: '8px',
                            border: '1px solid #ef4444',
                            backgroundColor: 'transparent',
                            color: '#ef4444',
                            fontWeight: '700',
                            fontSize: '0.875rem',
                            cursor: 'pointer',
                            transition: 'background-color 0.15s',
                        }}
                        onMouseEnter={(e) =>
                            ((e.currentTarget as HTMLButtonElement).style.backgroundColor = 'rgba(239,68,68,0.08)')
                        }
                        onMouseLeave={(e) =>
                            ((e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent')
                        }
                    >
                        Mark all as read
                    </button>
                )}
            </div>

            {/* Tabs */}
            <div
                style={{
                    display: 'flex',
                    gap: '4px',
                    backgroundColor: '#1e293b',
                    borderRadius: '10px',
                    padding: '4px',
                    width: 'fit-content',
                    flexWrap: 'wrap',
                }}
            >
                {TABS.map((tab) => {
                    const count =
                        tab.key === 'all'
                            ? notifications.length
                            : filterByTab(notifications, tab.key).length;
                    const isActive = activeTab === tab.key;
                    return (
                        <button
                            key={tab.key}
                            onClick={() => setActiveTab(tab.key)}
                            style={{
                                padding: '7px 16px',
                                borderRadius: '7px',
                                border: 'none',
                                backgroundColor: isActive ? '#0f172a' : 'transparent',
                                color: isActive ? '#f1f5f9' : '#94a3b8',
                                fontWeight: isActive ? '700' : '500',
                                fontSize: '0.875rem',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                transition: 'all 0.15s',
                            }}
                        >
                            {tab.label}
                            {count > 0 && (
                                <span
                                    style={{
                                        minWidth: '18px',
                                        height: '18px',
                                        borderRadius: '999px',
                                        backgroundColor: isActive ? '#ef4444' : '#334155',
                                        color: '#fff',
                                        fontSize: '0.65rem',
                                        fontWeight: '700',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        padding: '0 4px',
                                    }}
                                >
                                    {count}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* Content */}
            {loading ? (
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '12px',
                        padding: '64px 0',
                        color: '#64748b',
                        fontSize: '1rem',
                    }}
                >
                    <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
                    Loading notifications...
                </div>
            ) : error ? (
                <div
                    style={{
                        padding: '24px',
                        borderRadius: '12px',
                        backgroundColor: 'rgba(239,68,68,0.08)',
                        border: '1px solid rgba(239,68,68,0.3)',
                        color: '#ef4444',
                        fontWeight: '600',
                    }}
                >
                    {error}
                </div>
            ) : filtered.length === 0 ? (
                <div
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '80px 0',
                        gap: '12px',
                        color: '#475569',
                    }}
                >
                    <Info size={40} color="#334155" />
                    <div style={{ fontWeight: '600', fontSize: '1.1rem', color: '#64748b' }}>
                        No {activeTab === 'all' ? '' : activeTab + ' '}notifications
                    </div>
                    <div style={{ fontSize: '0.875rem', color: '#475569' }}>
                        {activeTab === 'all'
                            ? 'You are all caught up.'
                            : `No notifications in the ${TABS.find((t) => t.key === activeTab)?.label} category.`}
                    </div>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {filtered.map((n) => {
                        const borderColor = getBorderColor(n.priority);
                        const isClickable =
                            !!n.related_entity_type && !!n.related_entity_id;

                        return (
                            <div
                                key={n.id}
                                onClick={() => handleNotificationClick(n)}
                                style={{
                                    display: 'flex',
                                    gap: '16px',
                                    padding: '16px 20px',
                                    borderRadius: '10px',
                                    backgroundColor: n.is_read ? '#1e293b' : 'rgba(239,68,68,0.05)',
                                    border: '1px solid #334155',
                                    borderLeft: `4px solid ${borderColor}`,
                                    cursor: isClickable ? 'pointer' : 'default',
                                    transition: 'background-color 0.15s',
                                    alignItems: 'flex-start',
                                }}
                                onMouseEnter={(e) => {
                                    if (isClickable) {
                                        (e.currentTarget as HTMLDivElement).style.backgroundColor =
                                            'rgba(255,255,255,0.04)';
                                    }
                                }}
                                onMouseLeave={(e) => {
                                    (e.currentTarget as HTMLDivElement).style.backgroundColor =
                                        n.is_read ? '#1e293b' : 'rgba(239,68,68,0.05)';
                                }}
                            >
                                {/* Icon */}
                                <div
                                    style={{
                                        flexShrink: 0,
                                        width: '36px',
                                        height: '36px',
                                        borderRadius: '8px',
                                        backgroundColor: `${borderColor}22`,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        marginTop: '2px',
                                    }}
                                >
                                    {getNotificationIcon(n.notification_type, borderColor)}
                                </div>

                                {/* Body */}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div
                                        style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'flex-start',
                                            gap: '12px',
                                            flexWrap: 'wrap',
                                            marginBottom: '4px',
                                        }}
                                    >
                                        <span
                                            style={{
                                                fontWeight: n.is_read ? '600' : '800',
                                                fontSize: '0.9375rem',
                                                color: '#f1f5f9',
                                            }}
                                        >
                                            {n.title}
                                        </span>
                                        <span style={{ fontSize: '0.75rem', color: '#475569', whiteSpace: 'nowrap' }}>
                                            {getTimeAgo(n.created_at)}
                                        </span>
                                    </div>
                                    <p
                                        style={{
                                            margin: 0,
                                            fontSize: '0.875rem',
                                            color: '#94a3b8',
                                            lineHeight: 1.5,
                                        }}
                                    >
                                        {n.message}
                                    </p>

                                    {/* Action link */}
                                    {isClickable && (
                                        <div
                                            style={{
                                                marginTop: '8px',
                                                fontSize: '0.8125rem',
                                                color: '#ef4444',
                                                fontWeight: '600',
                                            }}
                                        >
                                            {n.related_entity_type === 'evidence_report'
                                                ? 'View report'
                                                : n.related_entity_type === 'ticket'
                                                ? 'View in history'
                                                : 'View'}{' '}
                                            &rarr;
                                        </div>
                                    )}
                                </div>

                                {/* Unread indicator */}
                                {!n.is_read && (
                                    <div
                                        style={{
                                            flexShrink: 0,
                                            width: '8px',
                                            height: '8px',
                                            borderRadius: '50%',
                                            backgroundColor: '#ef4444',
                                            marginTop: '8px',
                                        }}
                                    />
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};
