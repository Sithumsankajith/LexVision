import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    FileText,
    ArrowRight,
    Clock,
    AlertTriangle,
    CheckCircle,
    BrainCircuit
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

    // KPIs from all reports
    const totalReports = reports.length;
    const newSubmissions = reports.filter(r => r.status === 'submitted' || r.status === 'under-review').length;
    const verified = reports.filter(r => r.status === 'verified').length;
    const resolvedToday = reports.filter(r =>
        (r.status === 'verified' || r.status === 'rejected' || r.status === 'closed') &&
        new Date(r.updatedAt).toDateString() === new Date().toDateString()
    ).length;

    const dynamicKPIs = [
        { label: 'Total Reports', value: totalReports.toString(), sub: 'All Time', color: 'primary', icon: <FileText size={20} color="#3b82f6" /> },
        { label: 'Active Queue', value: newSubmissions.toString(), sub: 'Needs attention', color: 'warning', icon: <AlertTriangle size={20} color="#f59e0b" /> },
        { label: 'Verified', value: verified.toString(), sub: 'Fines issued', color: 'success', icon: <CheckCircle size={20} color="#10b981" /> },
        { label: 'Resolved Today', value: resolvedToday.toString(), sub: 'Shift total', color: 'error', icon: <Clock size={20} color="#ef4444" /> },
    ];

    // Show ALL recent reports for full visibility (not filtered by status)
    const recentReports = reports.slice(0, 10);
    // Active cases needing attention
    const activeCases = reports.filter(r => r.status === 'submitted' || r.status === 'under-review');

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

            {/* Active Queue Panel */}
            {activeCases.length > 0 && (
                <Panel
                    noPadding
                    title={<div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>🚨 Active Queue (<span style={{ color: 'var(--color-primary)' }}>{activeCases.length}</span>)</div>}
                    action={
                        <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard/queue')}>
                            View Full Queue <ArrowRight size={16} style={{ marginLeft: '4px' }} />
                        </Button>
                    }
                >
                    <DataTable headers={['Case ID', 'Type', 'Location', 'Time', 'Priority', 'AI Confidence', 'Action']}>
                        {activeCases.slice(0, 5).map((item) => (
                            <tr key={item.id}>
                                <td style={{ fontFamily: 'monospace', fontWeight: '500' }}>{item.trackingId}</td>
                                <td>{item.violationType.replace(/-/g, ' ')}</td>
                                <td>{item.location.address || item.location.city}</td>
                                <td style={{ color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
                                    <Clock size={14} style={{ verticalAlign: 'text-bottom', marginRight: '4px' }} />
                                    {new Date(item.datetime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </td>
                                <td>
                                    <Badge variant={
                                        item.violationType === 'red-light' ? 'error' :
                                            item.violationType === 'helmet' || item.violationType === 'no-helmet' ? 'warning' : 'info'
                                    }>
                                        {item.violationType === 'red-light' ? 'HIGH' :
                                            item.violationType === 'helmet' || item.violationType === 'no-helmet' ? 'MEDIUM' : 'LOW'}
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
                    </DataTable>
                </Panel>
            )}

            {/* Recent Submissions - ALL reports for full visibility */}
            <Panel
                noPadding
                title={<div style={{ fontWeight: 'bold', fontSize: '1.1rem' }}>Recent Citizen Submissions (<span style={{ color: 'var(--color-primary)' }}>{reports.length}</span>)</div>}
                action={
                    <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard/queue')}>
                        View All <ArrowRight size={16} style={{ marginLeft: '4px' }} />
                    </Button>
                }
            >
                <DataTable headers={['Case ID', 'Type', 'Location', 'Date', 'Status', 'AI', 'Action']}>
                    {recentReports.map((item) => (
                        <tr key={item.id}>
                            <td style={{ fontFamily: 'monospace', fontWeight: '500' }}>{item.trackingId}</td>
                            <td>{item.violationType.replace(/-/g, ' ')}</td>
                            <td>{item.location.address || item.location.city}</td>
                            <td style={{ color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
                                {new Date(item.datetime).toLocaleDateString()}{' '}
                                {new Date(item.datetime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </td>
                            <td>
                                <Badge variant={
                                    item.status === 'submitted' ? 'info' :
                                        item.status === 'under-review' ? 'warning' :
                                            item.status === 'verified' || item.status === 'closed' ? 'success' : 'error'
                                }>
                                    {item.status.replace(/-/g, ' ')}
                                </Badge>
                            </td>
                            <td>
                                {item.aiAnalysis?.confidence ? (
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <BrainCircuit size={14} color="var(--color-primary)" />
                                        <span style={{ fontWeight: '600', color: item.aiAnalysis.confidence > 0.8 ? 'var(--color-success)' : 'var(--color-warning)' }}>
                                            {(item.aiAnalysis.confidence * 100).toFixed(0)}%
                                        </span>
                                    </span>
                                ) : (
                                    <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.8rem' }}>—</span>
                                )}
                            </td>
                            <td>
                                <Button size="sm" variant="outline" onClick={() => navigate(`/dashboard/queue/${item.id}`)}>
                                    {item.status === 'submitted' || item.status === 'under-review' ? 'Review' : 'View'}
                                </Button>
                            </td>
                        </tr>
                    ))}
                    {reports.length === 0 && !loading && (
                        <tr>
                            <td colSpan={7} style={{ textAlign: 'center', padding: '2rem' }}>No citizen submissions yet.</td>
                        </tr>
                    )}
                </DataTable>
            </Panel>

        </div>
    );
};
