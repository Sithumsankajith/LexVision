import React, { useState } from 'react';
import {
    FileText,
    Video,
    Clock,
    ArrowRight
} from 'lucide-react';
import { Button } from '@lexvision/ui';
import styles from './Dashboard.module.css';

// Mock Data
const KPIS = [
    { label: 'Assigned Cases', value: '12', sub: '4 New today', type: 'assigned' },
    { label: 'High Priority', value: '3', sub: 'Requires immediate action', type: 'priority' },
    { label: 'Pending Review', value: '8', sub: 'Avg wait: 2h 15m', type: 'pending' },
    { label: 'Resolved Today', value: '24', sub: 'Personal best: 30', type: 'resolved' },
];

const AI_QUEUE = [
    { id: 'AI-2026-992', type: 'Red Light', time: '10 min ago', location: 'Galle Rd / Bambalapitiya', confidence: '98%', priority: 'High' },
    { id: 'AI-2026-991', type: 'No Helmet', time: '25 min ago', location: 'Duplication Rd / Col 03', confidence: '92%', priority: 'Medium' },
    { id: 'AI-2026-988', type: 'Lane Line', time: '42 min ago', location: 'Baseline Rd / Borella', confidence: '85%', priority: 'Low' },
    { id: 'AI-2026-985', type: 'Illegal Turn', time: '1h ago', location: 'Havelock Rd / Col 05', confidence: '96%', priority: 'High' },
    { id: 'AI-2026-982', type: 'No Helmet', time: '1h 20m ago', location: 'High Level Rd / Nugegoda', confidence: '99%', priority: 'Medium' },
];

const CITIZEN_QUEUE = [
    { id: 'REP-2026-455', type: 'Reckless Driving', time: '5 min ago', location: 'Marine Drive', evidence: 'Video', priority: 'High' },
    { id: 'REP-2026-452', type: 'Parking', time: '30 min ago', location: 'Union Place', evidence: 'Image', priority: 'Low' },
    { id: 'REP-2026-449', type: 'Obstructing', time: '2h ago', location: 'Town Hall', evidence: 'Image', priority: 'Medium' },
];

export const Dashboard: React.FC = () => {
    const [activeTab, setActiveTab] = useState<'ai' | 'citizen'>('ai');

    const currentQueue = activeTab === 'ai' ? AI_QUEUE : CITIZEN_QUEUE;

    return (
        <div className={styles.dashboardGrid}>

            {/* KPI Cards */}
            <section className={styles.kpiGrid}>
                {KPIS.map((kpi, index) => (
                    <div key={index} className={`${styles.kpiCard} ${kpi.type === 'assigned' ? styles.kpiAssigned :
                        kpi.type === 'priority' ? styles.kpiPriority :
                            kpi.type === 'pending' ? styles.kpiPending :
                                styles.kpiResolved
                        }`}>
                        <div className={styles.kpiLabel}>{kpi.label}</div>
                        <div className={styles.kpiValue}>{kpi.value}</div>
                        <div className={styles.kpiSubtext}>{kpi.sub}</div>
                    </div>
                ))}
            </section>

            {/* My Queue Section */}
            <section className={styles.queueSection}>
                <div className={styles.tabHeader}>
                    <div
                        className={`${styles.tab} ${activeTab === 'ai' ? styles.activeTab : ''}`}
                        onClick={() => setActiveTab('ai')}
                    >
                        <Video size={18} />
                        AI Detections
                        <span style={{ backgroundColor: 'var(--color-primary)', color: '#fff', padding: '0 6px', borderRadius: '10px', fontSize: '0.75rem', marginLeft: '4px' }}>5</span>
                    </div>
                    <div
                        className={`${styles.tab} ${activeTab === 'citizen' ? styles.activeTab : ''}`}
                        onClick={() => setActiveTab('citizen')}
                    >
                        <FileText size={18} />
                        Citizen Reports
                        <span style={{ backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text)', padding: '0 6px', borderRadius: '10px', fontSize: '0.75rem', marginLeft: '4px' }}>3</span>
                    </div>
                    <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', paddingRight: '16px' }}>
                        <Button variant="ghost" size="sm">View Full Queue <ArrowRight size={16} style={{ marginLeft: '4px' }} /></Button>
                    </div>
                </div>

                <div style={{ overflowX: 'auto' }}>
                    <table className={styles.queueTable}>
                        <thead>
                            <tr>
                                <th>Case ID</th>
                                <th>Violation Type</th>
                                <th>Location</th>
                                <th>Time</th>
                                <th>Priority</th>
                                {activeTab === 'ai' ? <th>Confidence</th> : <th>Evidence</th>}
                                <th>Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {currentQueue.map((item) => (
                                <tr key={item.id}>
                                    <td style={{ fontFamily: 'monospace', fontWeight: '500' }}>{item.id}</td>
                                    <td>{item.type}</td>
                                    <td>{item.location}</td>
                                    <td style={{ color: 'var(--color-text-secondary)' }}><Clock size={14} style={{ verticalAlign: 'text-bottom', marginRight: '4px' }} />{item.time}</td>
                                    <td>
                                        <span className={`${styles.priorityBadge} ${item.priority === 'High' ? styles.priorityHigh :
                                            item.priority === 'Medium' ? styles.priorityMedium :
                                                styles.priorityLow
                                            }`}>
                                            {item.priority}
                                        </span>
                                    </td>
                                    <td>
                                        {'confidence' in item ? (
                                            <span style={{
                                                color: parseInt(item.confidence) > 90 ? 'var(--color-success)' : 'var(--color-warning)',
                                                fontWeight: '600'
                                            }}>
                                                {item.confidence}
                                            </span>
                                        ) : (
                                            <span>{item.evidence}</span>
                                        )}
                                    </td>
                                    <td>
                                        <Button size="sm" variant="secondary">Review</Button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>

        </div>
    );
};
