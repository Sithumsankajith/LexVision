import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Bell,
    FileText,
    BrainCircuit,
    Ticket,
    AlertTriangle,
    CheckCheck,
    AlertCircle,
    Info,
} from 'lucide-react';
import { Button } from '@lexvision/ui';
import type { AppNotification, NotificationType } from '@lexvision/types';
import { useNotifications } from '../hooks/useNotifications';

// ---------------------------------------------------------------------------
// Category configuration
// ---------------------------------------------------------------------------

type CategoryKey = 'all' | 'reports' | 'aiml' | 'tickets' | 'system';

interface Category {
    key: CategoryKey;
    label: string;
    icon: React.ReactNode;
    types?: NotificationType[];
}

const CATEGORIES: Category[] = [
    { key: 'all', label: 'All', icon: <Bell size={15} /> },
    {
        key: 'reports',
        label: 'Reports',
        icon: <FileText size={15} />,
        types: ['new_report_submitted', 'report_validated', 'report_rejected', 'report_submitted', 'report_under_review', 'high_priority_report'],
    },
    {
        key: 'aiml',
        label: 'AI / ML',
        icon: <BrainCircuit size={15} />,
        types: ['ai_analysis_completed', 'ai_inference_failed'],
    },
    {
        key: 'tickets',
        label: 'Tickets',
        icon: <Ticket size={15} />,
        types: ['ticket_issued', 'ticket_action_required'],
    },
    {
        key: 'system',
        label: 'System',
        icon: <AlertTriangle size={15} />,
        types: ['system_warning', 'worker_failure', 'ai_inference_failed'],
    },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const getPriorityAccent = (priority: AppNotification['priority']): string => {
    if (priority === 'high') return '#ef4444';
    if (priority === 'normal') return '#f59e0b';
    return '#6b7280';
};

const getNotificationIcon = (type: NotificationType, size = 18): React.ReactNode => {
    if (['new_report_submitted', 'report_validated', 'report_rejected', 'report_submitted', 'report_under_review', 'high_priority_report'].includes(type as string)) {
        return <FileText size={size} />;
    }
    if (['ai_analysis_completed', 'ai_inference_failed'].includes(type as string)) {
        return <BrainCircuit size={size} />;
    }
    if (['ticket_issued', 'ticket_action_required'].includes(type as string)) {
        return <Ticket size={size} />;
    }
    if (['system_warning', 'worker_failure'].includes(type as string)) {
        return <AlertTriangle size={size} />;
    }
    return <Info size={size} />;
};

const formatTimestamp = (isoString: string): string => {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);

    if (diffSec < 60) return `${diffSec}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;

    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const EmptyState: React.FC<{ category: string }> = ({ category }) => (
    <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '64px 24px',
        gap: '12px',
    }}>
        <div style={{
            width: '56px',
            height: '56px',
            borderRadius: '16px',
            backgroundColor: '#1e293b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
        }}>
            <Bell size={24} color="#334155" />
        </div>
        <p style={{ margin: 0, fontWeight: '700', color: '#475569', fontSize: '0.9375rem' }}>
            No {category === 'all' ? '' : category + ' '}notifications
        </p>
        <p style={{ margin: 0, color: '#334155', fontSize: '0.8125rem' }}>
            You're all caught up.
        </p>
    </div>
);

const NotificationCard: React.FC<{
    notification: AppNotification;
    onMarkRead: (id: string) => void;
}> = ({ notification: n, onMarkRead }) => {
    const navigate = useNavigate();
    const accentColor = getPriorityAccent(n.priority);
    const isHighPriority = n.priority === 'high';
    const isSystemWarning = n.notification_type === 'system_warning' || n.notification_type === 'worker_failure';

    const handleRelatedLink = () => {
        if (!n.is_read) onMarkRead(n.id);
        if (n.related_entity_type === 'report' || n.related_entity_type === 'evidence_report') {
            navigate('/dashboard/reports');
        }
    };

    const hasLink = n.related_entity_type === 'report' || n.related_entity_type === 'evidence_report';

    return (
        <div style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '16px',
            padding: '16px 20px',
            backgroundColor: '#1e293b',
            borderRadius: '12px',
            border: '1px solid #334155',
            borderLeft: `4px solid ${n.is_read ? '#334155' : accentColor}`,
            opacity: n.is_read ? 0.75 : 1,
            transition: 'opacity 0.2s',
            ...(isHighPriority && !n.is_read ? {
                boxShadow: `0 0 0 1px ${accentColor}30, 0 4px 16px rgba(239, 68, 68, 0.1)`,
            } : {}),
            ...(isSystemWarning && !n.is_read ? {
                backgroundColor: 'rgba(239, 68, 68, 0.05)',
                borderColor: accentColor,
            } : {}),
        }}>
            {/* Icon */}
            <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                backgroundColor: `${accentColor}18`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: accentColor,
                flexShrink: 0,
            }}>
                {getNotificationIcon(n.notification_type)}
            </div>

            {/* Content */}
            <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    justifyContent: 'space-between',
                    gap: '12px',
                    marginBottom: '4px',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', flex: 1 }}>
                        <span style={{
                            fontSize: '0.9375rem',
                            fontWeight: n.is_read ? '500' : '700',
                            color: n.is_read ? '#94a3b8' : '#f1f5f9',
                        }}>
                            {n.title}
                        </span>
                        {/* Priority badge */}
                        {n.priority !== 'low' && (
                            <span style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                padding: '2px 8px',
                                borderRadius: '20px',
                                fontSize: '0.65rem',
                                fontWeight: '800',
                                letterSpacing: '0.04em',
                                textTransform: 'uppercase',
                                backgroundColor: `${accentColor}20`,
                                color: accentColor,
                                border: `1px solid ${accentColor}40`,
                            }}>
                                {n.priority}
                            </span>
                        )}
                        {!n.is_read && (
                            <span style={{
                                width: '8px',
                                height: '8px',
                                borderRadius: '50%',
                                backgroundColor: accentColor,
                                flexShrink: 0,
                            }} />
                        )}
                    </div>

                    {/* Timestamp */}
                    <span style={{
                        fontSize: '0.75rem',
                        color: '#475569',
                        fontWeight: '600',
                        whiteSpace: 'nowrap',
                        flexShrink: 0,
                    }}>
                        {formatTimestamp(n.created_at)}
                    </span>
                </div>

                <p style={{
                    margin: '0 0 8px',
                    fontSize: '0.8125rem',
                    color: n.is_read ? '#64748b' : '#94a3b8',
                    lineHeight: '1.5',
                }}>
                    {n.message}
                </p>

                {/* Actions row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {!n.is_read && (
                        <button
                            onClick={() => onMarkRead(n.id)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '4px 10px',
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
                            <CheckCheck size={13} />
                            Mark read
                        </button>
                    )}
                    {hasLink && (
                        <button
                            onClick={handleRelatedLink}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px',
                                padding: '4px 10px',
                                border: '1px solid #334155',
                                borderRadius: '6px',
                                backgroundColor: 'transparent',
                                color: '#3b82f6',
                                fontSize: '0.75rem',
                                fontWeight: '600',
                                cursor: 'pointer',
                                transition: 'border-color 0.15s, color 0.15s',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.borderColor = '#3b82f6'; }}
                            onMouseLeave={e => { e.currentTarget.style.borderColor = '#334155'; }}
                        >
                            View Report
                        </button>
                    )}
                    {n.related_entity_type === 'ticket' && (
                        <span style={{
                            padding: '4px 10px',
                            fontSize: '0.75rem',
                            fontWeight: '600',
                            color: '#64748b',
                        }}>
                            Ticket #{n.related_entity_id?.substring(0, 8) ?? 'N/A'}
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
};

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export const Notifications: React.FC = () => {
    const { notifications, unreadCount, loading, error, fetchNotifications, markRead, markAllRead } = useNotifications();
    const [activeCategory, setActiveCategory] = useState<CategoryKey>('all');

    useEffect(() => {
        fetchNotifications();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const highPriorityCount = notifications.filter(n => !n.is_read && n.priority === 'high').length;

    const filteredNotifications = (() => {
        const category = CATEGORIES.find(c => c.key === activeCategory);
        if (!category || !category.types) return notifications;
        return notifications.filter(n => category.types!.includes(n.notification_type));
    })();

    const getCategoryCount = (cat: Category): number => {
        if (!cat.types) return notifications.filter(n => !n.is_read).length;
        return notifications.filter(n => !n.is_read && cat.types!.includes(n.notification_type)).length;
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>

            {/* Page header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
                <div>
                    <h1 style={{ margin: '0 0 4px', fontSize: '1.5rem', fontWeight: '800', color: '#f1f5f9' }}>
                        System Notifications
                    </h1>
                    <p style={{ margin: 0, fontSize: '0.875rem', color: '#64748b' }}>
                        Monitor reports, AI events, and system alerts in real-time.
                    </p>
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    leftIcon={<CheckCheck size={15} />}
                    onClick={markAllRead}
                    disabled={unreadCount === 0}
                >
                    Mark all as read
                </Button>
            </div>

            {/* Summary stats */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px' }}>
                {[
                    {
                        label: 'Total Unread',
                        value: unreadCount,
                        icon: <Bell size={18} color="#3b82f6" />,
                        bg: 'rgba(59, 130, 246, 0.1)',
                        border: 'rgba(59, 130, 246, 0.2)',
                    },
                    {
                        label: 'High Priority',
                        value: highPriorityCount,
                        icon: <AlertCircle size={18} color="#ef4444" />,
                        bg: highPriorityCount > 0 ? 'rgba(239, 68, 68, 0.1)' : 'transparent',
                        border: highPriorityCount > 0 ? 'rgba(239, 68, 68, 0.3)' : '#334155',
                    },
                ].map((stat, i) => (
                    <div key={i} style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '14px 16px',
                        backgroundColor: stat.bg || '#1e293b',
                        border: `1px solid ${stat.border}`,
                        borderRadius: '12px',
                    }}>
                        <div style={{
                            width: '38px',
                            height: '38px',
                            borderRadius: '10px',
                            backgroundColor: '#0f172a',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                        }}>
                            {stat.icon}
                        </div>
                        <div>
                            <div style={{ fontSize: '1.5rem', fontWeight: '800', color: '#f1f5f9', lineHeight: 1 }}>
                                {stat.value}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: '600', marginTop: '2px' }}>
                                {stat.label}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Category tabs */}
            <div style={{
                display: 'flex',
                gap: '4px',
                padding: '4px',
                backgroundColor: '#1e293b',
                borderRadius: '10px',
                overflowX: 'auto',
                flexWrap: 'nowrap',
            }}>
                {CATEGORIES.map(cat => {
                    const count = getCategoryCount(cat);
                    const isActive = activeCategory === cat.key;
                    return (
                        <button
                            key={cat.key}
                            onClick={() => setActiveCategory(cat.key)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '6px',
                                padding: '8px 14px',
                                border: 'none',
                                borderRadius: '7px',
                                backgroundColor: isActive ? '#0f172a' : 'transparent',
                                color: isActive ? '#f1f5f9' : '#64748b',
                                fontSize: '0.8125rem',
                                fontWeight: isActive ? '700' : '600',
                                cursor: 'pointer',
                                whiteSpace: 'nowrap',
                                transition: 'all 0.15s',
                                boxShadow: isActive ? '0 1px 4px rgba(0,0,0,0.3)' : 'none',
                            }}
                        >
                            {cat.icon}
                            {cat.label}
                            {count > 0 && (
                                <span style={{
                                    minWidth: '18px',
                                    height: '18px',
                                    paddingInline: '4px',
                                    borderRadius: '9px',
                                    backgroundColor: isActive ? '#ef4444' : '#334155',
                                    color: '#ffffff',
                                    fontSize: '0.65rem',
                                    fontWeight: '800',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                }}>
                                    {count}
                                </span>
                            )}
                        </button>
                    );
                })}
            </div>

            {/* Error state */}
            {error && (
                <div style={{
                    padding: '12px 16px',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid rgba(239, 68, 68, 0.3)',
                    borderRadius: '8px',
                    color: '#ef4444',
                    fontSize: '0.8125rem',
                    fontWeight: '600',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                }}>
                    <AlertTriangle size={15} />
                    {error}
                </div>
            )}

            {/* Notification cards */}
            {loading ? (
                <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '12px',
                }}>
                    {[1, 2, 3].map(i => (
                        <div key={i} style={{
                            height: '88px',
                            backgroundColor: '#1e293b',
                            borderRadius: '12px',
                            border: '1px solid #334155',
                            opacity: 0.5,
                            animation: 'pulse 1.5s ease-in-out infinite',
                        }} />
                    ))}
                </div>
            ) : filteredNotifications.length === 0 ? (
                <div style={{
                    backgroundColor: '#1e293b',
                    borderRadius: '12px',
                    border: '1px solid #334155',
                }}>
                    <EmptyState category={CATEGORIES.find(c => c.key === activeCategory)?.label.toLowerCase() ?? 'all'} />
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {filteredNotifications.map(n => (
                        <NotificationCard
                            key={n.id}
                            notification={n}
                            onMarkRead={markRead}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};
