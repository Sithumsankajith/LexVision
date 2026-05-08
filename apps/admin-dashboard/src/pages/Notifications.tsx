import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    AlertTriangle,
    Bell,
    BrainCircuit,
    CheckCircle,
    FileText,
    Info,
    Loader2,
    RefreshCw,
    Settings,
    Ticket,
    XCircle,
} from 'lucide-react';
import type { AppNotification } from '@lexvision/types';
import { useNotifications } from '../hooks/useNotifications';

// ---------------------------------------------------------------------------
// Constants & helpers
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
    const diffSec = Math.floor((Date.now() - new Date(isoDate).getTime()) / 1000);
    if (diffSec < 60) return 'just now';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)} min ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} hr ago`;
    if (diffSec < 172800) return 'yesterday';
    return `${Math.floor(diffSec / 86400)} days ago`;
};

const getCategoryMeta = (type: string): { icon: React.ReactNode; label: string; color: string } => {
    if (REPORT_TYPES.has(type)) {
        if (type === 'report_validated' || type === 'report_under_review') {
            return { icon: <CheckCircle size={18} />, label: 'Report', color: '#0ea5e9' };
        }
        if (type === 'report_rejected') {
            return { icon: <XCircle size={18} />, label: 'Report', color: '#64748b' };
        }
        return { icon: <FileText size={18} />, label: 'Report', color: '#0ea5e9' };
    }
    if (AI_TYPES.has(type)) {
        return { icon: <BrainCircuit size={18} />, label: 'AI / ML', color: '#7c3aed' };
    }
    if (TICKET_TYPES.has(type)) {
        return { icon: <Ticket size={18} />, label: 'Ticket', color: '#f59e0b' };
    }
    if (type === 'worker_failure') {
        return { icon: <Settings size={18} />, label: 'System', color: '#dc2626' };
    }
    if (SYSTEM_TYPES.has(type)) {
        return { icon: <AlertTriangle size={18} />, label: 'System', color: '#dc2626' };
    }
    return { icon: <Info size={18} />, label: 'Update', color: '#64748b' };
};

const priorityBadgeStyle = (priority: string): React.CSSProperties => {
    if (priority === 'high') {
        return { background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca' };
    }
    if (priority === 'normal') {
        return { background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a' };
    }
    return { background: '#f1f5f9', color: '#475569', border: '1px solid #e2e8f0' };
};

// Admin accent — indigo
const ACCENT = '#4f46e5';
const ACCENT_HOVER = '#4338ca';

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const StatCard: React.FC<{ label: string; value: number; accent: string }> = ({ label, value, accent }) => (
    <div
        style={{
            flex: 1,
            minWidth: 160,
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 12,
            padding: '16px 20px',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
        }}
    >
        <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--color-text-secondary)', fontWeight: 600 }}>
            {label}
        </span>
        <span style={{ fontSize: '1.875rem', fontWeight: 800, color: accent, lineHeight: 1.1 }}>{value}</span>
    </div>
);

const SkeletonRow: React.FC = () => (
    <div
        style={{
            display: 'flex',
            gap: 16,
            padding: 18,
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            borderRadius: 12,
            alignItems: 'center',
        }}
    >
        <div style={{ width: 40, height: 40, borderRadius: 10, background: '#eef2f7' }} />
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ height: 12, background: '#eef2f7', borderRadius: 4, width: '40%' }} />
            <div style={{ height: 10, background: '#f1f5f9', borderRadius: 4, width: '70%' }} />
        </div>
    </div>
);

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export const Notifications: React.FC = () => {
    const navigate = useNavigate();
    const {
        notifications,
        loading,
        error,
        unreadCount,
        fetchNotifications,
        markRead,
        markAllRead,
    } = useNotifications();
    const [activeTab, setActiveTab] = useState<Tab>('all');

    useEffect(() => {
        fetchNotifications();
        const interval = setInterval(() => {
            if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
                fetchNotifications();
            }
        }, 20_000);
        return () => clearInterval(interval);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const filtered = useMemo(() => filterByTab(notifications, activeTab), [notifications, activeTab]);
    const highPriorityCount = useMemo(
        () => notifications.filter((n) => !n.is_read && n.priority === 'high').length,
        [notifications],
    );
    const systemAlertCount = useMemo(
        () => notifications.filter((n) => SYSTEM_TYPES.has(n.notification_type) || n.notification_type === 'ai_inference_failed').length,
        [notifications],
    );

    const handleNotificationClick = (n: AppNotification) => {
        if (!n.is_read) markRead(n.id);

        if (!n.related_entity_type || !n.related_entity_id) return;

        if (n.related_entity_type === 'evidence_report') {
            navigate('/dashboard/reports');
        } else if (n.related_entity_type === 'ticket') {
            navigate('/dashboard/reports');
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 1100, width: '100%' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 800, color: 'var(--color-text)', letterSpacing: '-0.02em' }}>
                        Notification Centre
                    </h1>
                    <p style={{ margin: '4px 0 0 0', color: 'var(--color-text-secondary)', fontSize: '0.95rem' }}>
                        {unreadCount > 0
                            ? `You have ${unreadCount} unread notification${unreadCount !== 1 ? 's' : ''}.`
                            : 'You are all caught up.'}
                    </p>
                </div>

                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <button
                        onClick={() => fetchNotifications()}
                        disabled={loading}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '8px 14px',
                            border: '1px solid var(--color-border)',
                            background: 'var(--color-surface)',
                            color: 'var(--color-text)',
                            borderRadius: 8,
                            fontWeight: 600,
                            fontSize: '0.875rem',
                            cursor: loading ? 'not-allowed' : 'pointer',
                            opacity: loading ? 0.6 : 1,
                        }}
                    >
                        <RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
                        Refresh
                    </button>
                    {unreadCount > 0 && (
                        <button
                            onClick={markAllRead}
                            style={{
                                padding: '8px 14px',
                                border: `1px solid ${ACCENT}`,
                                background: ACCENT,
                                color: '#fff',
                                borderRadius: 8,
                                fontWeight: 700,
                                fontSize: '0.875rem',
                                cursor: 'pointer',
                            }}
                            onMouseEnter={(e) => ((e.currentTarget as HTMLButtonElement).style.background = ACCENT_HOVER)}
                            onMouseLeave={(e) => ((e.currentTarget as HTMLButtonElement).style.background = ACCENT)}
                        >
                            Mark all read
                        </button>
                    )}
                </div>
            </div>

            {/* Summary cards */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
                <StatCard label="Unread" value={unreadCount} accent={ACCENT} />
                <StatCard label="High priority" value={highPriorityCount} accent="#f59e0b" />
                <StatCard label="System alerts" value={systemAlertCount} accent="#dc2626" />
                <StatCard label="Total" value={notifications.length} accent="#0f172a" />
            </div>

            {/* Tabs */}
            <div
                style={{
                    display: 'flex',
                    gap: 4,
                    background: 'var(--color-surface)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 10,
                    padding: 4,
                    width: 'fit-content',
                    flexWrap: 'wrap',
                    maxWidth: '100%',
                    overflowX: 'auto',
                }}
            >
                {TABS.map((tab) => {
                    const count = tab.key === 'all' ? notifications.length : filterByTab(notifications, tab.key).length;
                    const isActive = activeTab === tab.key;
                    return (
                        <button
                            key={tab.key}
                            onClick={() => setActiveTab(tab.key)}
                            style={{
                                padding: '8px 14px',
                                border: 'none',
                                background: isActive ? '#0f172a' : 'transparent',
                                color: isActive ? '#fff' : 'var(--color-text-secondary)',
                                fontWeight: isActive ? 700 : 500,
                                fontSize: '0.875rem',
                                borderRadius: 7,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 6,
                                whiteSpace: 'nowrap',
                            }}
                        >
                            {tab.label}
                            {count > 0 && (
                                <span
                                    style={{
                                        minWidth: 18,
                                        height: 18,
                                        borderRadius: 999,
                                        background: isActive ? ACCENT : '#e2e8f0',
                                        color: isActive ? '#fff' : '#475569',
                                        fontSize: '0.65rem',
                                        fontWeight: 800,
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        padding: '0 5px',
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
            {loading && filtered.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <SkeletonRow />
                    <SkeletonRow />
                    <SkeletonRow />
                </div>
            ) : error ? (
                <div
                    style={{
                        background: 'var(--color-surface)',
                        border: '1px solid var(--color-border)',
                        borderRadius: 12,
                        padding: 32,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 10,
                        textAlign: 'center',
                    }}
                >
                    <AlertTriangle size={28} color="#f59e0b" />
                    <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--color-text)' }}>
                        Could not load notifications
                    </div>
                    <div style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', maxWidth: 400 }}>
                        {error}
                    </div>
                    <button
                        onClick={() => fetchNotifications()}
                        style={{
                            marginTop: 4,
                            padding: '8px 16px',
                            border: '1px solid var(--color-border)',
                            background: 'var(--color-surface)',
                            color: 'var(--color-text)',
                            borderRadius: 8,
                            fontWeight: 600,
                            fontSize: '0.875rem',
                            cursor: 'pointer',
                        }}
                    >
                        Try again
                    </button>
                </div>
            ) : filtered.length === 0 ? (
                <div
                    style={{
                        background: 'var(--color-surface)',
                        border: '1px solid var(--color-border)',
                        borderRadius: 12,
                        padding: '40px 20px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 10,
                        textAlign: 'center',
                    }}
                >
                    <div
                        style={{
                            width: 56,
                            height: 56,
                            borderRadius: '50%',
                            background: '#f1f5f9',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}
                    >
                        <Bell size={26} color="#94a3b8" />
                    </div>
                    <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--color-text)' }}>
                        No notifications
                    </div>
                    <div style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                        You are all caught up.
                    </div>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {filtered.map((n) => {
                        const meta = getCategoryMeta(n.notification_type);
                        const isClickable = !!n.related_entity_type && !!n.related_entity_id;

                        return (
                            <div
                                key={n.id}
                                onClick={() => handleNotificationClick(n)}
                                style={{
                                    display: 'flex',
                                    gap: 16,
                                    padding: '16px 20px',
                                    borderRadius: 12,
                                    background: n.is_read ? 'var(--color-surface)' : '#eef2ff',
                                    border: `1px solid ${n.is_read ? 'var(--color-border)' : '#c7d2fe'}`,
                                    cursor: isClickable ? 'pointer' : 'default',
                                    alignItems: 'flex-start',
                                    transition: 'box-shadow 0.15s',
                                }}
                                onMouseEnter={(e) => {
                                    if (isClickable) {
                                        (e.currentTarget as HTMLDivElement).style.boxShadow = '0 1px 4px rgba(15,23,42,0.08)';
                                    }
                                }}
                                onMouseLeave={(e) => {
                                    (e.currentTarget as HTMLDivElement).style.boxShadow = 'none';
                                }}
                            >
                                <div
                                    style={{
                                        flexShrink: 0,
                                        width: 40,
                                        height: 40,
                                        borderRadius: 10,
                                        background: `${meta.color}1a`,
                                        color: meta.color,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                    }}
                                >
                                    {meta.icon}
                                </div>

                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 4, flexWrap: 'wrap' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                                            <span style={{ fontWeight: n.is_read ? 600 : 800, fontSize: '0.95rem', color: 'var(--color-text)' }}>
                                                {n.title}
                                            </span>
                                            <span
                                                style={{
                                                    fontSize: '0.65rem',
                                                    fontWeight: 700,
                                                    textTransform: 'uppercase',
                                                    letterSpacing: '0.04em',
                                                    padding: '2px 8px',
                                                    borderRadius: 999,
                                                    ...priorityBadgeStyle(n.priority),
                                                }}
                                            >
                                                {n.priority}
                                            </span>
                                            <span
                                                style={{
                                                    fontSize: '0.7rem',
                                                    fontWeight: 600,
                                                    color: meta.color,
                                                    background: `${meta.color}14`,
                                                    padding: '2px 8px',
                                                    borderRadius: 999,
                                                }}
                                            >
                                                {meta.label}
                                            </span>
                                        </div>
                                        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
                                            {getTimeAgo(n.created_at)}
                                        </span>
                                    </div>
                                    <p style={{ margin: 0, fontSize: '0.875rem', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
                                        {n.message}
                                    </p>

                                    {isClickable && (
                                        <div style={{ marginTop: 6, fontSize: '0.8125rem', color: ACCENT, fontWeight: 600 }}>
                                            View details &rarr;
                                        </div>
                                    )}
                                </div>

                                {!n.is_read && (
                                    <div
                                        style={{
                                            flexShrink: 0,
                                            width: 8,
                                            height: 8,
                                            borderRadius: '50%',
                                            background: ACCENT,
                                            marginTop: 8,
                                        }}
                                    />
                                )}
                            </div>
                        );
                    })}
                    {loading && (
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12, color: 'var(--color-text-secondary)', fontSize: '0.8125rem' }}>
                            <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} />
                            Refreshing...
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export default Notifications;

