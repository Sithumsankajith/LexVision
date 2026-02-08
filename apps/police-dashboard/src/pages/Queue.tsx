import React from 'react';
import {
    Filter,
    Calendar,
    Video,
    FileText
} from 'lucide-react';
import { Button, Input, Select } from '@lexvision/ui';
import styles from './Queue.module.css';

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
        <div className={styles.queueContainer}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h1 style={{ margin: 0, fontSize: '1.5rem' }}>Violation Queue</h1>
                <Button>Export List</Button>
            </div>

            {/* Filter Bar */}
            <div className={styles.filterBar}>
                <div style={{ flex: 1, minWidth: '200px' }}>
                    <Input placeholder="Search by Case ID or Location..." fullWidth />
                </div>

                <div className={styles.filterGroup}>
                    <span className={styles.filterLabel}><Filter size={16} /> Filters:</span>
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
            </div>

            {/* Queue Table */}
            <div className={styles.tableContainer}>
                <div className={styles.tableHeader}>
                    <div className={styles.tableTitle}>All Cases (104)</div>
                    <div style={{ color: 'var(--color-text-secondary)', fontSize: '0.875rem' }}>Showing 1-10 of 104</div>
                </div>

                <div style={{ overflowX: 'auto' }}>
                    <table className={styles.fullTable}>
                        <thead>
                            <tr>
                                <th>Case ID</th>
                                <th>Source</th>
                                <th>Violation Type</th>
                                <th>Location</th>
                                <th>Timestamp</th>
                                <th>Status</th>
                                <th>Priority</th>
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody>
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
                                        <span className={`${styles.statusBadge} ${item.status === 'new' ? styles.statusNew :
                                            item.status === 'review' ? styles.statusReview :
                                                styles.statusResolved
                                            }`}>
                                            {item.status}
                                        </span>
                                    </td>
                                    <td>
                                        <span className={`${styles.priorityBadge} ${item.priority === 'High' ? styles.priorityHigh :
                                            item.priority === 'Medium' ? styles.priorityMedium :
                                                styles.priorityLow
                                            }`}>
                                            {item.priority}
                                        </span>
                                    </td>
                                    <td>
                                        <Button size="sm" variant="secondary">Review</Button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};
