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

const RECENT_ACTIVITY = [
    { time: '10:42 AM', action: 'Officer Silva verified Report #LEX-982' },
    { time: '10:15 AM', action: 'New report submitted via Portal' },
    { time: '09:30 AM', action: 'System blocked 3 duplicate submissions' },
    { time: '09:12 AM', action: 'Admin logged in from new device' },
    { time: 'Yesterday', action: 'Weekly summary report generated' },
];

export const Dashboard: React.FC = () => {
    const [reports, setReports] = React.useState<Report[]>([]);

    React.useEffect(() => {
        const fetchReports = async () => {
            const data = await mockDb.getAllReports();
            setReports(data.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
        };
        fetchReports();

        const interval = setInterval(fetchReports, 3000);
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
                        {[
                            { label: 'Red Light', height: '60%', color: '#ef4444' },
                            { label: 'Helmet', height: '85%', color: '#f59e0b' },
                            { label: 'Parking', height: '40%', color: '#3b82f6' },
                            { label: 'Lane', height: '55%', color: '#10b981' },
                            { label: 'Other', height: '30%', color: '#8b5cf6' }
                        ].map((bar, i) => (
                            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', height: '100%', justifyContent: 'flex-end' }}>
                                <div style={{ width: '40px', height: bar.height, backgroundColor: bar.color, borderRadius: '4px 4px 0 0', opacity: 0.8 }}></div>
                                <span style={{ fontSize: '0.75rem', fontWeight: '500', color: 'var(--color-text-secondary)' }}>{bar.label}</span>
                            </div>
                        ))}
                    </div>
                </Panel>

                {/* Recent Activity */}
                <Panel title="Recent Activity">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                        {RECENT_ACTIVITY.map((activity, i) => (
                            <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>{activity.time}</div>
                                <div style={{ fontSize: '0.875rem', color: 'var(--color-text)' }}>{activity.action}</div>
                            </div>
                        ))}
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
                <DataTable headers={['Tracking ID', 'Violation Type', 'Date', 'Location', 'Status', 'Action']}>
                    {reports.slice(0, 10).map((report) => (
                        <tr key={report.id}>
                            <td style={{ fontFamily: 'monospace' }}>{report.trackingId}</td>
                            <td>{report.violationType.replace('-', ' ')}</td>
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
                            <td colSpan={6} style={{ textAlign: 'center', padding: '2rem' }}>No recent reports.</td>
                        </tr>
                    )}
                </DataTable>
            </Panel>

        </div>
    );
};
