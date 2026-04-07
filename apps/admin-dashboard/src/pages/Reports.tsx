import React, { useEffect, useState, useMemo } from 'react';
import {
    Filter,
    Download
} from 'lucide-react';
import { Button, Input, Select } from '@lexvision/ui';
import { Panel, DataTable, Badge } from '@lexvision/ui';
import { mockDb } from '@lexvision/api-client';
import type { Report } from '@lexvision/types';

export const Reports: React.FC = () => {
    const [reports, setReports] = useState<Report[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');

    useEffect(() => {
        const fetchReports = async () => {
            const data = await mockDb.getAllReports();
            setReports(data.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
            setLoading(false);
        };
        fetchReports();
        const interval = setInterval(fetchReports, 5000);
        return () => clearInterval(interval);
    }, []);

    const filteredReports = useMemo(() => {
        let result = reports;

        // Status filter
        if (statusFilter !== 'all') {
            result = result.filter(r => r.status === statusFilter);
        }

        // Search filter
        if (search.trim()) {
            const q = search.toLowerCase();
            result = result.filter(r =>
                r.trackingId.toLowerCase().includes(q) ||
                (r.citizen.email || '').toLowerCase().includes(q) ||
                (r.location.address || '').toLowerCase().includes(q) ||
                (r.location.city || '').toLowerCase().includes(q) ||
                r.violationType.toLowerCase().includes(q)
            );
        }

        return result;
    }, [reports, search, statusFilter]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 'bold' }}>All Reports</h1>
                <Button
                    leftIcon={<Download size={16} />}
                    onClick={async () => {
                        try {
                            await mockDb.adminExportReportsCsv();
                        } catch (e) {
                            console.error('Export failed', e);
                            alert('Failed to export CSV');
                        }
                    }}
                >
                    Export CSV
                </Button>
            </div>

            <Panel noPadding style={{ padding: 'var(--space-4)', display: 'flex', gap: 'var(--space-4)', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: '200px' }}>
                    <Input
                        placeholder="Search by Case ID, Citizen Email, or Location..."
                        fullWidth
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                    <span style={{ fontSize: '0.875rem', fontWeight: '500', color: 'var(--color-text-secondary)' }}><Filter size={16} /> Filters:</span>
                    <Select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        options={[
                            { value: 'all', label: 'All Status' },
                            { value: 'submitted', label: 'New' },
                            { value: 'under-review', label: 'Under Review' },
                            { value: 'verified', label: 'Verified' },
                            { value: 'rejected', label: 'Rejected' },
                            { value: 'closed', label: 'Closed' }
                        ]}
                        style={{ width: '140px' }}
                    />
                </div>
                {(search || statusFilter !== 'all') && (
                    <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setStatusFilter('all'); }} style={{ color: 'var(--color-primary)', fontWeight: '700' }}>
                        Reset
                    </Button>
                )}
            </Panel>

            <Panel
                title={`Database Results (${filteredReports.length})`}
                action={<div style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>{loading ? 'Loading...' : `Showing ${filteredReports.length} of ${reports.length} reports`}</div>}
                noPadding
            >
                <DataTable headers={['Tracking ID', 'Citizen', 'Violation Type', 'Location', 'Date', 'Status']}>
                    {filteredReports.map((report) => (
                        <tr key={report.id}>
                            <td style={{ fontFamily: 'monospace', fontWeight: '500' }}>{report.trackingId}</td>
                            <td>{report.citizen.email || report.citizen.phone || 'Anonymous'}</td>
                            <td>
                                {report.violationType.replace('-', ' ')}
                                {report.aiAnalysis?.detectedViolationType && (
                                    <div style={{ fontSize: '0.7rem', color: 'var(--color-primary)' }}>AI: {report.aiAnalysis.detectedViolationType.replace('-', ' ')}</div>
                                )}
                            </td>
                            <td>{report.location.address || report.location.city}</td>
                            <td>{new Date(report.createdAt).toLocaleString()}</td>
                            <td>
                                <Badge variant={
                                    report.status === 'submitted' ? 'info' :
                                        report.status === 'under-review' ? 'warning' :
                                            report.status === 'verified' || report.status === 'closed' ? 'success' :
                                                'error'
                                }>
                                    {report.status.replace('-', ' ')}
                                </Badge>
                            </td>
                        </tr>
                    ))}
                    {filteredReports.length === 0 && !loading && (
                        <tr>
                            <td colSpan={6} style={{ textAlign: 'center', padding: '2rem' }}>
                                {search || statusFilter !== 'all' ? 'No reports match your filters.' : 'No reports found in the system.'}
                            </td>
                        </tr>
                    )}
                </DataTable>
            </Panel>
        </div>
    );
};
