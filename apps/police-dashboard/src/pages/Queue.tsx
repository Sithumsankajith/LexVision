import React from 'react';
import {
    Filter,
    Calendar,
    Video,
    FileText
} from 'lucide-react';
import { Button, Input, Select } from '@lexvision/ui';
import { Panel, DataTable, Badge } from '@lexvision/ui';

// Mock Data for Full Queue
const FULL_QUEUE = Array.from({ length: 10 }).map((_, i) => ({
    id: `CASE-2026-${1000 + i}`,
    type: i % 3 === 0 ? 'Red Light' : i % 3 === 1 ? 'No Helmet' : 'Illegal Parking',
    source: i % 2 === 0 ? 'AI' : 'Citizen',
    location: i % 2 === 0 ? 'Galle Rd, Col 03' : 'Union Place, Col 02',
    timestamp: '2026-02-08 10:30 AM',
    status: i < 3 ? 'new' : i < 6 ? 'review' : 'resolved',
    priority: i % 4 === 0 ? 'High' : i % 4 === 1 ? 'Medium' : 'Low',
}));

export const Queue: React.FC = () => {
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
                            { value: 'new', label: 'New' },
                            { value: 'review', label: 'Under Review' },
                            { value: 'resolved', label: 'Resolved' }
                        ]}
                        style={{ width: '140px' }}
                    />
                    <Select
                        value="all"
                        onChange={() => { }}
                        options={[
                            { value: 'all', label: 'All Types' },
                            { value: 'ai', label: 'AI Detection' },
                            { value: 'citizen', label: 'Citizen Report' }
                        ]}
                        style={{ width: '140px' }}
                    />
                </div>

                <Button variant="outline" leftIcon={<Calendar size={16} />}>Date Range</Button>
            </Panel>

            {/* Queue Table */}
            <Panel
                title="All Cases (104)"
                action={<div style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>Showing 1-10 of 104</div>}
                noPadding
            >
                <DataTable headers={['Case ID', 'Source', 'Violation Type', 'Location', 'Timestamp', 'Status', 'Priority', 'Action']}>
                    {FULL_QUEUE.map((item) => (
                        <tr key={item.id}>
                            <td style={{ fontFamily: 'monospace', fontWeight: '600' }}>{item.id}</td>
                            <td>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                    {item.source === 'AI' ? <Video size={16} color="var(--color-primary)" /> : <FileText size={16} color="var(--color-info)" />}
                                    {item.source}
                                </div>
                            </td>
                            <td>{item.type}</td>
                            <td>{item.location}</td>
                            <td>{item.timestamp}</td>
                            <td>
                                <Badge variant={
                                    item.status === 'new' ? 'info' :
                                        item.status === 'review' ? 'warning' :
                                            'success'
                                }>
                                    {item.status}
                                </Badge>
                            </td>
                            <td>
                                <Badge variant={
                                    item.priority === 'High' ? 'error' :
                                        item.priority === 'Medium' ? 'warning' :
                                            'info'
                                }>
                                    {item.priority}
                                </Badge>
                            </td>
                            <td>
                                <Button size="sm" variant="secondary">Review</Button>
                            </td>
                        </tr>
                    ))}
                </DataTable>
            </Panel>
        </div>
    );
};
