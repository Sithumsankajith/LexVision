import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Filter,
    FileText,
    BrainCircuit,
    History
} from 'lucide-react';
import { Button, Input, Select } from '@lexvision/ui';
import { Panel, DataTable, Badge } from '@lexvision/ui';
import { mockDb } from '@lexvision/api-client';
import type { Report } from '@lexvision/types';

export const Queue: React.FC = () => {
    const [reports, setReports] = useState<Report[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const navigate = useNavigate();

    useEffect(() => {
        const fetchReports = async () => {
            const data = await mockDb.getAllReports();
            setReports(data.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
            setLoading(false);
        };
        fetchReports();
        const interval = setInterval(fetchReports, 3000);
        return () => clearInterval(interval);
    }, []);

    const filteredReports = useMemo(() => {
        let result = reports;

        // Status filter
        if (statusFilter !== 'all') {
            result = result.filter(r => r.status === statusFilter);
        }

        // Search
        if (search.trim()) {
            const q = search.toLowerCase();
            result = result.filter(r =>
                r.trackingId.toLowerCase().includes(q) ||
                (r.location.address || '').toLowerCase().includes(q) ||
                (r.location.city || '').toLowerCase().includes(q) ||
                (r.vehicle?.plate || '').toLowerCase().includes(q) ||
                (r.aiAnalysis?.detectedPlate || '').toLowerCase().includes(q) ||
                r.violationType.toLowerCase().includes(q)
            );
        }

        return result;
    }, [reports, search, statusFilter]);

    const handleResetFilters = () => {
        setSearch('');
        setStatusFilter('all');
    };

    const handleExport = async () => {
        try {
            await mockDb.adminExportReportsCsv();
        } catch {
            alert('Export failed. You may need admin privileges.');
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-8)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h1 style={{ margin: 0, fontSize: '2rem', fontWeight: '800', color: 'var(--color-text)', letterSpacing: '-0.02em' }}>Violation Queue</h1>
                    <p style={{ margin: 'var(--space-1) 0 0 0', color: 'var(--color-text-secondary)', fontSize: '0.875rem', fontWeight: '500' }}>Manage and verify reported traffic violations in real-time</p>
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
                    <Button variant="outline" leftIcon={<History size={18} />} onClick={() => navigate('/dashboard/history')}>History</Button>
                    <Button leftIcon={<FileText size={18} />} onClick={handleExport}>Export Report</Button>
                </div>
            </div>

            {/* Filter Bar */}
            <Panel className="filter-bar" noPadding style={{ padding: 'var(--space-6)', display: 'flex', gap: 'var(--space-6)', alignItems: 'center', flexWrap: 'wrap', backgroundColor: 'var(--color-surface)', boxShadow: 'var(--shadow-md)' }}>
                <div style={{ flex: 1, minWidth: '300px' }}>
                    <Input
                        placeholder="Search by Case ID, Location, or Vehicle Number..."
                        fullWidth
                        style={{ height: '52px', fontSize: '1rem' }}
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', color: 'var(--color-text-secondary)', fontWeight: '700', fontSize: '0.875rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        <Filter size={18} /> Filters
                    </div>
                    <Select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        options={[
                            { value: 'all', label: 'All Status' },
                            { value: 'submitted', label: 'New Reports' },
                            { value: 'under-review', label: 'In Review' },
                            { value: 'verified', label: 'Verified' },
                            { value: 'rejected', label: 'Rejected' }
                        ]}
                        style={{ width: '180px', height: '52px' }}
                    />
                </div>

                <Button
                    variant="ghost"
                    style={{ height: '52px', fontWeight: '700', color: 'var(--color-primary)' }}
                    onClick={handleResetFilters}
                >Reset Filters</Button>
            </Panel>

            {/* Queue Table */}
            <Panel
                title={`Active Cases`}
                action={<Badge variant="info">{loading ? 'Syncing...' : `${filteredReports.length} Reports Found`}</Badge>}
                noPadding
            >
                <DataTable headers={['Case ID', 'Source', 'Violation Type', 'Location', 'Timestamp', 'Status', 'Action']}>
                    {filteredReports.map((item) => (
                        <tr key={item.id}>
                            <td style={{ fontFamily: 'monospace', fontWeight: '700', color: 'var(--color-primary)', fontSize: '0.875rem' }}>#{item.trackingId.substring(0, 12)}</td>
                            <td>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                    <div style={{
                                        width: '32px',
                                        height: '32px',
                                        borderRadius: 'var(--radius-full)',
                                        backgroundColor: 'var(--color-background)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center'
                                    }}>
                                        <FileText size={16} color="var(--color-primary)" />
                                    </div>
                                    <span style={{ fontWeight: '600' }}>Citizen</span>
                                    {item.aiAnalysis?.detectedViolationType && (
                                        <Badge variant="warning"><BrainCircuit size={10} /> AI Flag</Badge>
                                    )}
                                </div>
                            </td>
                            <td>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                    <span style={{ fontWeight: '700', color: 'var(--color-text)' }}>{item.violationType.replace(/-/g, ' ')}</span>
                                    {item.aiAnalysis?.detectedViolationType && (
                                        <span style={{ fontSize: '0.75rem', color: 'var(--color-primary)', fontWeight: '600', opacity: 0.8 }}>
                                            Confidence: {((item.aiAnalysis.confidence || 0) * 100).toFixed(0)}%
                                        </span>
                                    )}
                                </div>
                            </td>
                            <td>
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    <span style={{ fontWeight: '600' }}>{item.location.address || item.location.city}</span>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>Sri Lanka</span>
                                </div>
                            </td>
                            <td style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)', fontWeight: '500' }}>
                                {new Date(item.datetime).toLocaleDateString()} <br />
                                <span style={{ opacity: 0.7 }}>{new Date(item.datetime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            </td>
                            <td>
                                <Badge variant={
                                    item.status === 'submitted' ? 'info' :
                                        item.status === 'under-review' ? 'warning' :
                                            item.status === 'rejected' ? 'error' :
                                                'success'
                                }>
                                    {item.status.replace(/-/g, ' ')}
                                </Badge>
                            </td>
                            <td>
                                <Button
                                    size="sm"
                                    variant="primary"
                                    onClick={() => navigate(`/dashboard/queue/${item.id}`)}
                                    style={{ fontWeight: '700', borderRadius: 'var(--radius-md)' }}
                                >
                                    Details
                                </Button>
                            </td>
                        </tr>
                    ))}
                    {filteredReports.length === 0 && !loading && (
                        <tr>
                            <td colSpan={7} style={{ textAlign: 'center', padding: '4rem' }}>
                                <div style={{ opacity: 0.5, fontSize: '1.25rem' }}>
                                    {search || statusFilter !== 'all' ? 'No cases match your filters' : 'No violation cases in the queue'}
                                </div>
                            </td>
                        </tr>
                    )}
                </DataTable>
            </Panel>
        </div>
    );
};
