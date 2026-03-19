import React from 'react';
import {
    Users,
    AlertCircle,
    CheckCircle,
    XCircle,
    MoreHorizontal,
    BrainCircuit,
    Activity,
    Zap,
    TrendingUp
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

// --- Donut Chart Component ---
const DonutChart: React.FC<{ data: { label: string; value: number; color: string }[] }> = ({ data }) => {
    const total = data.reduce((s, d) => s + d.value, 0);
    if (total === 0) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--color-text-secondary)', opacity: 0.6 }}>
                <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '2.5rem', marginBottom: '0.5rem' }}>📊</div>
                    No data available
                </div>
            </div>
        );
    }

    let cumulativePercent = 0;
    const gradientParts = data.map(d => {
        const pct = (d.value / total) * 100;
        const start = cumulativePercent;
        cumulativePercent += pct;
        return `${d.color} ${start}% ${cumulativePercent}%`;
    });

    return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-8)', height: '100%', padding: 'var(--space-4) 0' }}>
            <div style={{ position: 'relative', width: '180px', height: '180px', flexShrink: 0 }}>
                <div style={{
                    width: '100%',
                    height: '100%',
                    borderRadius: '50%',
                    background: `conic-gradient(${gradientParts.join(', ')})`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                }} >
                    <div style={{
                        width: '110px',
                        height: '110px',
                        borderRadius: '50%',
                        backgroundColor: 'var(--color-surface)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}>
                        <span style={{ fontSize: '1.75rem', fontWeight: '800', color: 'var(--color-text)' }}>{total}</span>
                        <span style={{ fontSize: '0.7rem', fontWeight: '600', color: 'var(--color-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total</span>
                    </div>
                </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', flex: 1 }}>
                {data.filter(d => d.value > 0).map((d, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                        <div style={{ width: '12px', height: '12px', borderRadius: '3px', backgroundColor: d.color, flexShrink: 0 }} />
                        <span style={{ fontSize: '0.8125rem', fontWeight: '600', color: 'var(--color-text)', flex: 1 }}>{d.label}</span>
                        <span style={{ fontSize: '0.875rem', fontWeight: '800', color: 'var(--color-text)' }}>{d.value}</span>
                        <span style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--color-text-secondary)', minWidth: '36px', textAlign: 'right' }}>{((d.value / total) * 100).toFixed(0)}%</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

// --- Sparkline Trend Component ---
const TrendLine: React.FC<{ data: { date: string; count: number }[] }> = ({ data }) => {
    if (data.length === 0) {
        return (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--color-text-secondary)', opacity: 0.6 }}>
                No trend data yet
            </div>
        );
    }
    const maxCount = Math.max(1, ...data.map(d => d.count));
    const chartHeight = 200;
    const barWidth = Math.max(4, Math.min(24, Math.floor(600 / data.length) - 4));

    return (
        <div style={{ height: `${chartHeight + 40}px`, display: 'flex', flexDirection: 'column' }}>
            <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: '3px', padding: '0 var(--space-2)' }}>
                {data.map((d, i) => {
                    const h = Math.max(4, (d.count / maxCount) * chartHeight);
                    const isLast = i === data.length - 1;
                    return (
                        <div key={i} title={`${d.date}: ${d.count} reports`} style={{
                            width: `${barWidth}px`,
                            height: `${h}px`,
                            background: isLast
                                ? 'linear-gradient(to top, #2563eb, #3b82f6)'
                                : 'linear-gradient(to top, #1e293b, #334155)',
                            borderRadius: '3px 3px 0 0',
                            transition: 'height 0.5s ease',
                            opacity: 0.5 + (i / data.length) * 0.5,
                            cursor: 'pointer',
                            position: 'relative'
                        }} />
                    );
                })}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: 'var(--space-2) var(--space-2) 0', fontSize: '0.65rem', color: 'var(--color-text-secondary)', fontWeight: '600' }}>
                <span>{data[0]?.date?.substring(5) || ''}</span>
                <span>{data[data.length - 1]?.date?.substring(5) || ''}</span>
            </div>
        </div>
    );
};

export const Dashboard: React.FC = () => {
    const [reports, setReports] = React.useState<Report[]>([]);
    const [auditLogs, setAuditLogs] = React.useState<any[]>([]);
    const [violationStats, setViolationStats] = React.useState<{ type: string, count: number }[]>([]);
    const [statusRatio, setStatusRatio] = React.useState<{ status: string, count: number }[]>([]);
    const [reportsTrend, setReportsTrend] = React.useState<{ date: string, count: number }[]>([]);
    const [aiMetrics, setAiMetrics] = React.useState<{ avg_helmet_confidence: number, avg_ocr_confidence: number, avg_inference_latency_seconds: number } | null>(null);

    React.useEffect(() => {
        const fetchData = async () => {
            const [reportsData, logs, stats, ratioData, trendData, aiData] = await Promise.all([
                mockDb.getAllReports(),
                mockDb.adminGetAuditLogs(),
                mockDb.adminGetViolationTypes(),
                mockDb.adminGetStatusRatio(),
                mockDb.adminGetReportsTrend(),
                mockDb.adminGetAiMetrics()
            ]);
            setReports(reportsData.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
            setAuditLogs(logs);
            setViolationStats(stats);
            if (Array.isArray(ratioData)) setStatusRatio(ratioData);
            setReportsTrend(trendData);
            setAiMetrics(aiData);
        };
        fetchData();
        const interval = setInterval(fetchData, 8000);
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

    // Status donut data
    const statusColors: Record<string, string> = {
        'SUBMITTED': '#3b82f6',
        'AI_PROCESSING': '#8b5cf6',
        'UNDER_REVIEW': '#f59e0b',
        'VALIDATED': '#10b981',
        'REJECTED': '#ef4444'
    };
    const donutData = statusRatio.map(s => ({
        label: String(s.status).replace('StatusEnum.', '').replace(/_/g, ' '),
        value: s.count,
        color: statusColors[String(s.status).replace('StatusEnum.', '')] || '#64748b'
    }));

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-8)' }}>

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

            {/* Row 2: Status Donut + Reports Trend */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-6)' }}>
                <Panel
                    title="Report Status Distribution"
                    action={<Badge variant="info">Live</Badge>}
                >
                    <div style={{ height: '220px' }}>
                        <DonutChart data={donutData} />
                    </div>
                </Panel>

                <Panel
                    title="Reports Trend (Last 30 Days)"
                    action={<TrendingUp size={16} color="var(--color-text-secondary)" />}
                >
                    <div style={{ height: '220px' }}>
                        <TrendLine data={reportsTrend} />
                    </div>
                </Panel>
            </div>

            {/* Row 3: Violation Bar Chart + AI Metrics + Activity */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 'var(--space-6)' }}>
                {/* Violation Type Bar Chart */}
                <Panel
                    title="Reports by Violation Type"
                    action={<Button variant="ghost" size="sm" style={{ color: 'var(--color-text-secondary)' }}><MoreHorizontal size={16} /></Button>}
                >
                    <div style={{ height: '250px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-around', padding: 'var(--space-4) 0', gap: 'var(--space-4)' }}>
                        {(() => {
                            const colors: Record<string, string[]> = {
                                'red-light': ['#ef4444', '#dc2626'],
                                'no-helmet': ['#f59e0b', '#d97706'],
                                'helmet': ['#f59e0b', '#d97706'],
                                'illegal-parking': ['#3b82f6', '#2563eb'],
                                'white-line-crossing': ['#10b981', '#059669'],
                                'white-line': ['#10b981', '#059669'],
                                'other': ['#8b5cf6', '#7c3aed']
                            };
                            const maxCount = Math.max(1, ...violationStats.map(s => s.count));

                            if (violationStats.length === 0) {
                                return (
                                    <div style={{ width: '100%', textAlign: 'center', color: 'var(--color-text-secondary)', alignSelf: 'center', opacity: 0.6 }}>
                                        <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📊</div>
                                        No violation data reported yet
                                    </div>
                                );
                            }

                            return violationStats.map((stat, i) => {
                                const heightPercent = Math.max(8, Math.round((stat.count / maxCount) * 100));
                                const [baseColor, darkColor] = colors[stat.type] || colors['other'];
                                const label = stat.type.replace(/-/g, ' ');

                                return (
                                    <div key={i} title={`${stat.count} reports`} style={{
                                        display: 'flex',
                                        flexDirection: 'column',
                                        alignItems: 'center',
                                        gap: 'var(--space-3)',
                                        height: '100%',
                                        justifyContent: 'flex-end',
                                        flex: 1,
                                        minWidth: '60px'
                                    }}>
                                        <div style={{
                                            width: '100%',
                                            maxWidth: '48px',
                                            height: `${heightPercent}%`,
                                            background: `linear-gradient(to top, ${darkColor}, ${baseColor})`,
                                            borderRadius: 'var(--radius-md) var(--radius-md) 4px 4px',
                                            boxShadow: `0 10px 15px -3px ${baseColor}40`,
                                            transition: 'all 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)',
                                            position: 'relative',
                                            display: 'flex',
                                            justifyContent: 'center'
                                        }}>
                                            <div style={{
                                                position: 'absolute',
                                                top: '-24px',
                                                fontSize: '0.75rem',
                                                fontWeight: '800',
                                                color: baseColor
                                            }}>{stat.count}</div>
                                        </div>
                                        <span style={{
                                            fontSize: '0.7rem',
                                            fontWeight: '700',
                                            color: 'var(--color-text-secondary)',
                                            textAlign: 'center',
                                            lineHeight: '1.2',
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.025em'
                                        }}>{label}</span>
                                    </div>
                                );
                            });
                        })()}
                    </div>
                </Panel>

                {/* AI Performance Metrics */}
                <Panel title="AI Performance">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)', padding: 'var(--space-2) 0' }}>
                        {[
                            { label: 'Detection Confidence', value: aiMetrics?.avg_helmet_confidence ?? 0, icon: <BrainCircuit size={16} color="#8b5cf6" />, color: '#8b5cf6' },
                            { label: 'OCR Accuracy', value: aiMetrics?.avg_ocr_confidence ?? 0, icon: <Activity size={16} color="#3b82f6" />, color: '#3b82f6' },
                        ].map((metric, i) => (
                            <div key={i}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                                    {metric.icon}
                                    <span style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>{metric.label}</span>
                                </div>
                                <div style={{ fontSize: '1.5rem', fontWeight: '800', color: 'var(--color-text)', marginBottom: '6px' }}>
                                    {(metric.value * 100).toFixed(1)}%
                                </div>
                                <div style={{
                                    width: '100%',
                                    height: '6px',
                                    backgroundColor: 'var(--color-border)',
                                    borderRadius: '3px',
                                    overflow: 'hidden'
                                }}>
                                    <div style={{
                                        width: `${Math.min(100, metric.value * 100)}%`,
                                        height: '100%',
                                        backgroundColor: metric.color,
                                        borderRadius: '3px',
                                        transition: 'width 0.8s ease'
                                    }} />
                                </div>
                            </div>
                        ))}
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                                <Zap size={16} color="#f59e0b" />
                                <span style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--color-text-secondary)', textTransform: 'uppercase' }}>Avg Latency</span>
                            </div>
                            <div style={{ fontSize: '1.5rem', fontWeight: '800', color: 'var(--color-text)' }}>
                                {(aiMetrics?.avg_inference_latency_seconds ?? 0).toFixed(2)}s
                            </div>
                        </div>
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
                                    <div style={{ fontSize: '0.8125rem', color: 'var(--color-text)' }}>
                                        <strong>{log.action.replace(/_/g, ' ')}</strong> - {log.target_type} {log.target_id?.substring(0, 8) || ''}
                                        {log.details?.role ? ` (${log.details.role})` : ''}
                                    </div>
                                </div>
                            );
                        })}
                        {auditLogs.length === 0 && <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>No recent activity.</span>}
                    </div>
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
                            <td style={{ fontFamily: 'monospace', fontWeight: '700', color: 'var(--color-primary)' }}>#{report.trackingId}</td>
                            <td style={{ fontWeight: '600' }}>{report.violationType.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ')}</td>
                            <td>
                                <span style={{
                                    color: report.aiAnalysis?.confidence ? (report.aiAnalysis.confidence > 0.8 ? 'var(--color-success)' : 'var(--color-warning)') : 'var(--color-text-secondary)',
                                    fontWeight: '800'
                                }}>
                                    {report.aiAnalysis?.confidence ? `${(report.aiAnalysis.confidence * 100).toFixed(0)}%` : 'N/A'}
                                </span>
                            </td>
                            <td style={{ color: 'var(--color-text-secondary)', fontWeight: '500' }}>{new Date(report.datetime).toLocaleDateString()}</td>
                            <td style={{ fontWeight: '600' }}>{report.location.address || report.location.city}</td>
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
                                <Button variant="ghost" size="sm" style={{ fontWeight: '700' }}>Review</Button>
                            </td>
                        </tr>
                    ))}
                    {reports.length === 0 && (
                        <tr>
                            <td colSpan={7} style={{ textAlign: 'center', padding: '4rem', opacity: 0.5 }}>No recent reports found.</td>
                        </tr>
                    )}
                </DataTable>
            </Panel>

        </div>
    );
};
