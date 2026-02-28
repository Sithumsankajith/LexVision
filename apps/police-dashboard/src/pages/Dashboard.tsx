import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    FileText,
    ArrowRight,
    Clock,
    AlertTriangle,
    CheckCircle
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

// KPIs generated dynamically below
export const Dashboard: React.FC = () => {
    const [reports, setReports] = useState<Report[]>([]);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    React.useEffect(() => {
        const fetchReports = async () => {
            const data = await mockDb.getAllReports();
            setReports(data.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
            setLoading(false);
        };
        fetchReports();

        const interval = setInterval(fetchReports, 3000);
        return () => clearInterval(interval);
    }, []);

    // Filter reports for the Dashboard (only those needing attention)
    const activeReports = reports.filter(r => r.status === 'submitted' || r.status === 'under-review');

    // All active reports are part of the unified queue
    const currentQueue = activeReports;

    // Calculate dynamic KPIs
    const resolvedToday = reports.filter(r =>
        (r.status === 'verified' || r.status === 'rejected') &&
        new Date(r.updatedAt).toDateString() === new Date().toDateString()
    ).length;

    const assignedCases = activeReports.length;
    const highPriority = activeReports.filter(r => r.violationType === 'red-light').length;
    const pendingReview = activeReports.filter(r => r.status === 'under-review').length;

    const dynamicKPIs = [
        { label: 'Assigned Cases', value: assignedCases.toString(), sub: 'Active Queue', color: 'primary', icon: <FileText size={20} color="#3b82f6" /> },
        { label: 'High Priority', value: highPriority.toString(), sub: 'Action required', color: 'error', icon: <AlertTriangle size={20} color="#ef4444" /> },
        { label: 'Pending Review', value: pendingReview.toString(), sub: 'In Progress', color: 'warning', icon: <Clock size={20} color="#f59e0b" /> },
        { label: 'Resolved Today', value: resolvedToday.toString(), sub: 'Shift total', color: 'success', icon: <CheckCircle size={20} color="#10b981" /> },
    ];



    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>

            {/* Row 1: KPI Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--space-6)' }}>
                {dynamicKPIs.map((kpi, index) => (
                    <KpiCard
                        key={index}
                        label={kpi.label}
                        value={kpi.value}
                        trend={kpi.sub}
                        trendDirection="neutral"
                        color={kpi.color as any}
                        icon={kpi.icon}
                    />
                ))}
            </div>

            {/* Row 2: Queue Panel with Tabs */}
            <Panel
                noPadding
                title={<div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>Citizen Submissions (<span style={{ color: 'var(--color-primary)' }}>{currentQueue.length}</span>)</div>}
                action={
                    <Button variant="ghost" size="sm" onClick={() => navigate('/queue')}>
                        View Full Queue <ArrowRight size={16} style={{ marginLeft: '4px' }} />
                    </Button>
                }
            >
                <DataTable headers={[
                    'Case ID',
                    'Type',
                    'Location',
                    'Time',
                    'Priority',
                    'AI Confidence',
                    'Action'
                ]}>
                    {currentQueue.slice(0, 10).map((item) => (
                        <tr key={item.id}>
                            <td style={{ fontFamily: 'monospace', fontWeight: '500' }}>{item.trackingId}</td>
                            <td>{item.violationType.replace('-', ' ')}</td>
                            <td>{item.location.address || item.location.city}</td>
                            <td style={{ color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
                                <Clock size={14} style={{ verticalAlign: 'text-bottom', marginRight: '4px' }} />
                                {new Date(item.datetime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </td>
                            <td>
                                <Badge variant={
                                    (item.violationType === 'red-light') ? 'error' :
                                        item.violationType === 'helmet' ? 'warning' :
                                            'info'
                                }>
                                    {(item.violationType === 'red-light') ? 'HIGH' :
                                        item.violationType === 'helmet' ? 'MEDIUM' : 'LOW'}
                                </Badge>
                            </td>
                            <td>
                                <span style={{
                                    color: item.aiAnalysis?.confidence ? (item.aiAnalysis.confidence > 0.8 ? 'var(--color-success)' : 'var(--color-warning)') : 'var(--color-text-secondary)',
                                    fontWeight: '600'
                                }}>
                                    {item.aiAnalysis?.confidence ? `${(item.aiAnalysis.confidence * 100).toFixed(0)}%` : 'N/A'}
                                </span>
                            </td>
                            <td>
                                <Button size="sm" variant="secondary" onClick={() => navigate(`/dashboard/queue/${item.id}`)}>Review</Button>
                            </td>
                        </tr>
                    ))}
                    {currentQueue.length === 0 && !loading && (
                        <tr>
                            <td colSpan={7} style={{ textAlign: 'center', padding: '2rem' }}>Queue is empty.</td>
                        </tr>
                    )}
                </DataTable>
            </Panel>

        </div>
    );
};
