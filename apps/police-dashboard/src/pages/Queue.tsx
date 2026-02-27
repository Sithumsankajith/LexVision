import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Filter,
    Calendar,
    FileText,
    BrainCircuit
} from 'lucide-react';
import { Button, Input, Select } from '@lexvision/ui';
import { Panel, DataTable, Badge } from '@lexvision/ui';
import { mockDb } from '@lexvision/api-client';
import type { Report } from '@lexvision/types';

export const Queue: React.FC = () => {
    const [reports, setReports] = useState<Report[]>([]);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    useEffect(() => {
        const fetchReports = async () => {
            const data = await mockDb.getAllReports();
            // Sort by newest first
            setReports(data.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
            setLoading(false);
        };
        fetchReports();

        // Poll for real-time updates
        const interval = setInterval(fetchReports, 3000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 'bold' }}>Violation Queue</h1>
                <Button>Export List</Button>
            </div>

            {/* Filter Bar */}
            <Panel className="filter-bar" noPadding style={{ padding: 'var(--space-4)', display: 'flex', gap: 'var(--space-4)', alignItems: 'center', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: '200px' }}>
                    <Input placeholder="Search by Case ID or Location..." fullWidth />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                    <span style={{ fontSize: '0.875rem', fontWeight: '500', color: 'var(--color-text-secondary)' }}><Filter size={16} /> Filters:</span>
                    <Select
                        value="all"
                        onChange={() => { }}
                        options={[
                            { value: 'all', label: 'All Status' },
                            { value: 'submitted', label: 'New' },
                            { value: 'under-review', label: 'Under Review' },
                            { value: 'verified', label: 'Verified' },
                            { value: 'rejected', label: 'Rejected' }
                        ]}
                        style={{ width: '140px' }}
                    />
                </div>

                <Button variant="outline" leftIcon={<Calendar size={16} />}>Date Range</Button>
            </Panel>

            {/* Queue Table */}
            <Panel
                title={`All Cases (${reports.length})`}
                action={<div style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>{loading ? 'Loading...' : `Showing 1-${reports.length} of ${reports.length}`}</div>}
                noPadding
            >
                <DataTable headers={['Case ID', 'Source', 'Violation Type', 'Location', 'Timestamp', 'Status', 'Action']}>
                    {reports.map((item) => (
                        <tr key={item.id}>
                            <td style={{ fontFamily: 'monospace', fontWeight: '600' }}>{item.trackingId}</td>
                            <td>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    {item.aiAnalysis?.detectedViolationType ? (
                                        <Badge variant="warning"><BrainCircuit size={12} style={{ marginRight: 4 }} /> AI Analyzed</Badge>
                                    ) : (
                                        <><FileText size={16} color="var(--color-info)" /> Citizen</>
                                    )}
                                </div>
                            </td>
                            <td>
                                {item.violationType.replace('-', ' ')}
                                {item.aiAnalysis?.detectedViolationType && (
                                    <div style={{ fontSize: '0.7rem', color: 'var(--color-primary)' }}>AI: {item.aiAnalysis.detectedViolationType.replace('-', ' ')}</div>
                                )}
                            </td>
                            <td>{item.location.address || item.location.city}</td>
                            <td>{new Date(item.datetime).toLocaleString()}</td>
                            <td>
                                <Badge variant={
                                    item.status === 'submitted' ? 'info' :
                                        item.status === 'under-review' ? 'warning' :
                                            item.status === 'rejected' ? 'error' :
                                                'success'
                                }>
                                    {item.status.replace('-', ' ')}
                                </Badge>
                            </td>
                            <td>
                                <Button size="sm" variant="secondary" onClick={() => navigate(`/queue/${item.id}`)}>Review</Button>
                            </td>
                        </tr>
                    ))}
                    {reports.length === 0 && !loading && (
                        <tr>
                            <td colSpan={7} style={{ textAlign: 'center', padding: '2rem' }}>No cases found.</td>
                        </tr>
                    )}
                </DataTable>
            </Panel>
        </div>
    );
};
