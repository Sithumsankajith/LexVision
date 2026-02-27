import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Filter,
    Calendar,
    Download
} from 'lucide-react';
import { Button, Input, Select } from '@lexvision/ui';
import { Panel, DataTable, Badge } from '@lexvision/ui';
import { mockDb } from '@lexvision/api-client';
import type { Report } from '@lexvision/types';

export const History: React.FC = () => {
    const [reports, setReports] = useState<Report[]>([]);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        const fetchReports = async () => {
            const data = await mockDb.getAllReports();

            // Filter only CLOSED cases
            const closedCases = data.filter(r => r.status === 'verified' || r.status === 'rejected');

            setReports(closedCases.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()));
            setLoading(false);
        };
        fetchReports();
    }, []);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 'bold' }}>My Case History</h1>
                <Button leftIcon={<Download size={16} />}>Export Report</Button>
            </div>

            {/* Filter Bar */}
            <Panel className="filter-bar" noPadding style={{ padding: 'var(--space-4)', display: 'flex', gap: 'var(--space-4)', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: '200px' }}>
                    <Input placeholder="Search by Case ID or Location..." fullWidth />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                    <span style={{ fontSize: '0.875rem', fontWeight: '500', color: 'var(--color-text-secondary)' }}><Filter size={16} /> Resolution:</span>
                    <Select
                        value="all"
                        onChange={() => { }}
                        options={[
                            { value: 'all', label: 'All Cases' },
                            { value: 'verified', label: 'Verified Cases' },
                            { value: 'rejected', label: 'Rejected Cases' }
                        ]}
                        style={{ width: '150px' }}
                    />
                </div>

                <Button variant="outline" leftIcon={<Calendar size={16} />}>Date Range</Button>
            </Panel>

            {/* Queue Table */}
            <Panel
                title={`Closed Cases (${reports.length})`}
                action={<div style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>{loading ? 'Loading...' : `Showing past cases`}</div>}
                noPadding
            >
                <DataTable headers={['Tracking ID', 'Violation Type', 'Location', 'Closed On', 'Resolution', 'Action']}>
                    {reports.map((item) => (
                        <tr key={item.id}>
                            <td style={{ fontFamily: 'monospace', fontWeight: '600' }}>{item.trackingId}</td>
                            <td>{item.violationType.replace('-', ' ')}</td>
                            <td>{item.location.address || item.location.city}</td>
                            <td>{new Date(item.updatedAt).toLocaleString()}</td>
                            <td>
                                <Badge variant={
                                    item.status === 'verified' ? 'success' : 'error'
                                }>
                                    {item.status.replace('-', ' ').toUpperCase()}
                                </Badge>
                            </td>
                            <td>
                                <Button size="sm" variant="outline" onClick={() => navigate(`/queue/${item.id}`)}>View Details</Button>
                            </td>
                        </tr>
                    ))}
                    {reports.length === 0 && !loading && (
                        <tr>
                            <td colSpan={6} style={{ textAlign: 'center', padding: '2rem' }}>No case history found.</td>
                        </tr>
                    )}
                </DataTable>
            </Panel>
        </div>
    );
};
