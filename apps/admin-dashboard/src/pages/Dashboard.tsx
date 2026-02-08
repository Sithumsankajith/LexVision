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

// Mock Data
// ... same mock data as before ...
const KPIS = [
    { label: 'Total Reports', value: '1,234', trend: '+12%', isUp: true, icon: <Users size={20} color="#3b82f6" />, color: 'primary' },
    { label: 'Pending Review', value: '56', trend: '-5%', isUp: false, icon: <AlertCircle size={20} color="#f59e0b" />, color: 'warning' },
    { label: 'Verified', value: '892', trend: '+8%', isUp: true, icon: <CheckCircle size={20} color="#10b981" />, color: 'success' },
    { label: 'Rejected', value: '286', trend: '+2%', isUp: false, icon: <XCircle size={20} color="#ef4444" />, color: 'error' },
];

const RECENT_ACTIVITY = [
    { time: '10:42 AM', action: 'Officer Silva verified Report #LEX-982' },
    { time: '10:15 AM', action: 'New report submitted via Portal' },
    { time: '09:30 AM', action: 'System blocked 3 duplicate submissions' },
    { time: '09:12 AM', action: 'Admin logged in from new device' },
    { time: 'Yesterday', action: 'Weekly summary report generated' },
];

const RECENT_REPORTS = [
    { id: 'LEX-2026-A1', type: 'Red Light', date: '2026-02-08', status: 'new', location: 'Duplication Rd, Col 03' },
    { id: 'LEX-2026-A2', type: 'No Helmet', date: '2026-02-08', status: 'review', location: 'Galle Rd, Col 04' },
    { id: 'LEX-2026-B5', type: 'Parking', date: '2026-02-07', status: 'approved', location: 'Union Place, Col 02' },
    { id: 'LEX-2026-C3', type: 'Lane Line', date: '2026-02-07', status: 'rejected', location: 'Baseline Rd, Col 09' },
    { id: 'LEX-2026-D9', type: 'No Helmet', date: '2026-02-07', status: 'approved', location: 'Havelock Rd, Col 05' },
];

export const Dashboard: React.FC = () => {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>

            {/* KPI Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--space-6)' }}>
                {KPIS.map((kpi, index) => (
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
                    {RECENT_REPORTS.map((report) => (
                        <tr key={report.id}>
                            <td style={{ fontFamily: 'monospace' }}>{report.id}</td>
                            <td>{report.type}</td>
                            <td>{report.date}</td>
                            <td>{report.location}</td>
                            <td>
                                <Badge variant={
                                    report.status === 'new' ? 'info' :
                                        report.status === 'review' ? 'warning' :
                                            report.status === 'approved' ? 'success' :
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
                </DataTable>
            </Panel>

        </div>
    );
};
