import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Filter,
    Download
} from 'lucide-react';
import { Button, Input, Select } from '@lexvision/ui';
import { Panel, DataTable, Badge } from '@lexvision/ui';
import { mockDb } from '@lexvision/api-client';
import type { Report } from '@lexvision/types';

export const History: React.FC = () => {
    const [reports, setReports] = useState<Report[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [resolutionFilter, setResolutionFilter] = useState('all');
    const navigate = useNavigate();

    useEffect(() => {
        const fetchReports = async () => {
            const data = await mockDb.getAllReports();
            const closedCases = data.filter(r => r.status === 'verified' || r.status === 'rejected');
            setReports(closedCases.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()));
            setLoading(false);
        };
        fetchReports();
    }, []);

    const filteredReports = useMemo(() => {
        let result = reports;

        if (resolutionFilter !== 'all') {
            result = result.filter(r => r.status === resolutionFilter);
        }

        if (search.trim()) {
            const q = search.toLowerCase();
            result = result.filter(r =>
                r.trackingId.toLowerCase().includes(q) ||
                (r.location.address || '').toLowerCase().includes(q) ||
                (r.location.city || '').toLowerCase().includes(q) ||
                r.violationType.toLowerCase().includes(q)
            );
        }

        return result;
    }, [reports, search, resolutionFilter]);

    const handleExport = async () => {
        try {
            await mockDb.adminExportReportsCsv();
        } catch {
            alert('Export failed.');
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 'bold' }}>My Case History</h1>
                <Button leftIcon={<Download size={16} />} onClick={handleExport}>Export Report</Button>
            </div>

            {/* Filter Bar */}
            <Panel className="filter-bar" noPadding style={{ padding: 'var(--space-4)', display: 'flex', gap: 'var(--space-4)', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: '200px' }}>
                    <Input
                        placeholder="Search by Case ID or Location..."
                        fullWidth
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                    <span style={{ fontSize: '0.875rem', fontWeight: '500', color: 'var(--color-text-secondary)' }}><Filter size={16} /> Resolution:</span>
                    <Select
                        value={resolutionFilter}
                        onChange={(e) => setResolutionFilter(e.target.value)}
                        options={[
                            { value: 'all', label: 'All Cases' },
                            { value: 'verified', label: 'Verified Cases' },
                            { value: 'rejected', label: 'Rejected Cases' }
                        ]}
                        style={{ width: '150px' }}
                    />
                </div>

                {(search || resolutionFilter !== 'all') && (
                    <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setResolutionFilter('all'); }} style={{ color: 'var(--color-primary)', fontWeight: '700' }}>
                        Reset
                    </Button>
                )}
            </Panel>

            {/* Table */}
            <Panel
                title={`Closed Cases (${filteredReports.length})`}
                action={<div style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>{loading ? 'Loading...' : `Showing ${filteredReports.length} of ${reports.length} cases`}</div>}
                noPadding
            >
                <DataTable headers={['Tracking ID', 'Violation Type', 'Location', 'Closed On', 'Resolution', 'Action']}>
                    {filteredReports.map((item) => (
                        <tr key={item.id}>
                            <td style={{ fontFamily: 'monospace', fontWeight: '600' }}>{item.trackingId}</td>
                            <td>{item.violationType.replace(/-/g, ' ')}</td>
                            <td>{item.location.address || item.location.city}</td>
                            <td>{new Date(item.updatedAt).toLocaleString()}</td>
                            <td>
                                <Badge variant={
                                    item.status === 'verified' ? 'success' : 'error'
                                }>
                                    {item.status.replace(/-/g, ' ').toUpperCase()}
                                </Badge>
                            </td>
                            <td>
                                <Button size="sm" variant="outline" onClick={() => navigate(`/dashboard/queue/${item.id}`)}>View Details</Button>
                            </td>
                        </tr>
                    ))}
                    {filteredReports.length === 0 && !loading && (
                        <tr>
                            <td colSpan={6} style={{ textAlign: 'center', padding: '2rem' }}>
                                {search || resolutionFilter !== 'all' ? 'No cases match your filters.' : 'No case history found.'}
                            </td>
                        </tr>
                    )}
                </DataTable>
            </Panel>
        </div>
    );
};
