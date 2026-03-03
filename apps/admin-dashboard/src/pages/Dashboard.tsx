import React from 'react';
import {
    Users,
    AlertCircle,
    CheckCircle,
    XCircle,
    MoreHorizontal
} from 'lucide-react';
import { Button } from '@lexvision/ui';
import {
    KpiCard,
    Panel,
    DataTable,
    Badge
} from '@lexvision/ui';
import { mockDb } from '@lexvision/api-client';
import type { Report } from '@lexvision/types';

// KPIs generated dynamically below.

export const Dashboard: React.FC = () => {
    const [reports, setReports] = React.useState<Report[]>([]);
    const [auditLogs, setAuditLogs] = React.useState<any[]>([]);
    const [violationStats, setViolationStats] = React.useState<{ type: string, count: number }[]>([]);

    React.useEffect(() => {
        const fetchReports = async () => {
            const data = await mockDb.getAllReports();
            setReports(data.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
        };
        const fetchAdminData = async () => {
            const [logs, stats] = await Promise.all([
                mockDb.adminGetAuditLogs(),
                mockDb.adminGetViolationTypes()
            ]);
            setAuditLogs(logs);
            setViolationStats(stats);
        };
        fetchReports();
        fetchAdminData();

        const interval = setInterval(() => {
            fetchReports();
            fetchAdminData();
        }, 5000);
        return () => clearInterval(interval);
    }, []);

    // Calculate dynamic KPIs
    const totalReports = reports.length;
    const pendingReview = reports.filter(r => r.status === 'under-review').length;
    const verified = reports.filter(r => r.status === 'verified').length;
    const rejected = reports.filter(r => r.status === 'rejected').length;

    const dynamicKPIs = [
        { label: 'Total Reports', value: totalReports.toString(), trend: 'Live Data', isUp: true, icon: <Users size={20} color="#3b82f6" />, color: 'primary' },
        { label: 'Pending Review', value: pendingReview.toString(), trend: 'Live Data', isUp: false, icon: <AlertCircle size={20} color="#f59e0b" />, color: 'warning' },
        { label: 'Verified', value: verified.toString(), trend: 'Live Data', isUp: true, icon: <CheckCircle size={20} color="#10b981" />, color: 'success' },
        { label: 'Rejected', value: rejected.toString(), trend: 'Live Data', isUp: false, icon: <XCircle size={20} color="#ef4444" />, color: 'error' },
    ];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>

            {/* KPI Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--space-6)' }}>
                {dynamicKPIs.map((kpi, index) => (
                    <KpiCard
                        key={index}
                        label={kpi.label}
                        value={kpi.value}
                        trend={kpi.trend}
                        trendDirection={kpi.isUp ? 'up' : 'down'}
                        icon={kpi.icon}
                        color={kpi.color as any}
                    />
                ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 'var(--space-6)' }}>
                {/* Visual Chart Placeholder */}
                <Panel
                    title="Reports by Violation Type"
                    action={<Button variant="ghost" size="sm"><MoreHorizontal size={16} /></Button>}
                >
                    <div style={{ height: '200px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-around', paddingBottom: 'var(--space-2)' }}>
                        {(() => {
                            const colors: Record<string, string> = {
                                'red-light': '#ef4444',
                                'no-helmet': '#f59e0b',
                                'illegal-parking': '#3b82f6',
                                'white-line-crossing': '#10b981',
                                'other': '#8b5cf6'
                            };
                            const maxCount = Math.max(1, ...violationStats.map(s => s.count));

                            if (violationStats.length === 0) {
                                return <div style={{ width: '100%', textAlign: 'center', color: 'var(--color-text-secondary)', alignSelf: 'center' }}>No violation data</div>;
                            }

                            return violationStats.map((stat, i) => {
                                const heightPercent = Math.max(10, Math.round((stat.count / maxCount) * 100));
                                const color = colors[stat.type] || colors['other'];
                                const label = stat.type.replace(/-/g, ' ');

                                return (
                                    <div key={i} title={`${stat.count} reports`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', height: '100%', justifyContent: 'flex-end', flex: 1 }}>
                                        <div style={{ width: '40px', height: `${heightPercent}%`, backgroundColor: color, borderRadius: '4px 4px 0 0', opacity: 0.8, transition: 'height 0.3s ease' }}></div>
                                        <span style={{ fontSize: '0.75rem', fontWeight: '500', color: 'var(--color-text-secondary)', textAlign: 'center', lineHeight: '1.2' }}>{label}</span>
                                    </div>
                                );
                            });
                        })()}
                    </div>
                </Panel>

                {/* Recent Activity */}
                <Panel title="Recent Activity">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                        {auditLogs.slice(0, 5).map((log, i) => {
                            const date = new Date(log.timestamp);
                            let timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                            return (
                                <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                                        {date.toLocaleDateString() === new Date().toLocaleDateString() ? timeStr : date.toLocaleDateString()}
                                    </div>
                                    <div style={{ fontSize: '0.875rem', color: 'var(--color-text)' }}>
                                        <strong>{log.action.replace(/_/g, ' ')}</strong> - {log.target_type} {log.target_id?.substring(0, 8) || ''}
                                        {log.details?.role ? ` (${log.details.role})` : ''}
                                    </div>
                                </div>
                            );
                        })}
                        {auditLogs.length === 0 && <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>No recent activity.</span>}
                    </div>
                    <Button variant="secondary" fullWidth style={{ marginTop: 'var(--space-4)' }}>
                        View All Log
                    </Button>
                </Panel>
            </div>

            {/* Recent Reports Table */}
            <Panel
                title="Recent Reports"
                action={<Button size="sm" variant="outline">View All</Button>}
                noPadding
            >
                <DataTable headers={['Tracking ID', 'Violation Type', 'AI Confidence', 'Date', 'Location', 'Status', 'Action']}>
                    {reports.slice(0, 10).map((report) => (
                        <tr key={report.id}>
                            <td style={{ fontFamily: 'monospace' }}>{report.trackingId}</td>
                            <td>{report.violationType.replace('-', ' ')}</td>
                            <td>
                                <span style={{
                                    color: report.aiAnalysis?.confidence ? (report.aiAnalysis.confidence > 0.8 ? 'var(--color-success)' : 'var(--color-warning)') : 'var(--color-text-secondary)',
                                    fontWeight: '600'
                                }}>
                                    {report.aiAnalysis?.confidence ? `${(report.aiAnalysis.confidence * 100).toFixed(0)}%` : 'N/A'}
                                </span>
                            </td>
                            <td>{new Date(report.datetime).toLocaleDateString()}</td>
                            <td>{report.location.address || report.location.city}</td>
                            <td>
                                <Badge variant={
                                    report.status === 'submitted' ? 'info' :
                                        report.status === 'under-review' ? 'warning' :
                                            report.status === 'verified' ? 'success' :
                                                'error'
                                }>
                                    {report.status.replace('-', ' ')}
                                </Badge>
                            </td>
                            <td>
                                <Button variant="ghost" size="sm">Review</Button>
                            </td>
                        </tr>
                    ))}
                    {reports.length === 0 && (
                        <tr>
                            <td colSpan={7} style={{ textAlign: 'center', padding: '2rem' }}>No recent reports.</td>
                        </tr>
                    )}
                </DataTable>
            </Panel>

        </div>
    );
};
