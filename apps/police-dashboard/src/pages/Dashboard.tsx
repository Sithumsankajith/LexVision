import React, { useState } from 'react';
import {
    Video,
    FileText,
    ArrowRight,
    Clock
} from 'lucide-react';
import { Button } from '@lexvision/ui';
import {
    KpiCard,
    Panel,
    DataTable,
    Badge
} from '@lexvision/ui';

// Mock Data
const KPIS = [
    { label: 'Assigned Cases', value: '12', sub: '4 New today', type: 'assigned', color: 'primary' },
    { label: 'High Priority', value: '3', sub: 'Requires immediate action', type: 'priority', color: 'error' },
    { label: 'Pending Review', value: '8', sub: 'Avg wait: 2h 15m', type: 'pending', color: 'warning' },
    { label: 'Resolved Today', value: '24', sub: 'Personal best: 30', type: 'resolved', color: 'success' },
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>

            {/* KPI Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--space-6)' }}>
                {KPIS.map((kpi, index) => (
                    <KpiCard
                        key={index}
                        label={kpi.label}
                        value={kpi.value}
                        trend={kpi.sub}
                        trendDirection="neutral"
                        color={kpi.color as any}
                    />
                ))}
            </div>

            {/* My Queue Section */}
            <Panel>
                <div style={{ display: 'flex', borderBottom: '1px solid var(--color-border)', marginBottom: 'var(--space-4)' }}>
                    <div
                        style={{
                            padding: 'var(--space-3) var(--space-6)',
                            cursor: 'pointer',
                            borderBottom: activeTab === 'ai' ? '2px solid var(--color-primary)' : 'none',
                            color: activeTab === 'ai' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                            fontWeight: '600',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 'var(--space-2)'
                        }}
                        onClick={() => setActiveTab('ai')}
                    >
                        <Video size={18} />
                        AI Detections
                        <span style={{ backgroundColor: 'var(--color-primary)', color: '#fff', padding: '0 6px', borderRadius: '10px', fontSize: '0.75rem' }}>5</span>
                    </div>
                    <div
                        style={{
                            padding: 'var(--space-3) var(--space-6)',
                            cursor: 'pointer',
                            borderBottom: activeTab === 'citizen' ? '2px solid var(--color-primary)' : 'none',
                            color: activeTab === 'citizen' ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                            fontWeight: '600',
                            display: 'flex',
                            alignItems: 'center',
                            gap: 'var(--space-2)'
                        }}
                        onClick={() => setActiveTab('citizen')}
                    >
                        <FileText size={18} />
                        Citizen Reports
                        <span style={{ backgroundColor: 'var(--color-bg-tertiary)', color: 'var(--color-text)', padding: '0 6px', borderRadius: '10px', fontSize: '0.75rem' }}>3</span>
                    </div>
                    <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center' }}>
                        <Button variant="ghost" size="sm">View Full Queue <ArrowRight size={16} style={{ marginLeft: '4px' }} /></Button>
                    </div>
                </div>

                <DataTable headers={['Case ID', 'Violation Type', 'Location', 'Time', 'Priority', activeTab === 'ai' ? 'Confidence' : 'Evidence', 'Action']}>
                    {currentQueue.map((item) => (
                        <tr key={item.id}>
                            <td style={{ fontFamily: 'monospace', fontWeight: '500' }}>{item.id}</td>
                            <td>{item.type}</td>
                            <td>{item.location}</td>
                            <td style={{ color: 'var(--color-text-secondary)' }}><Clock size={14} style={{ verticalAlign: 'text-bottom', marginRight: '4px' }} />{item.time}</td>
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
                </DataTable>
            </Panel>

        </div>
    );
};
