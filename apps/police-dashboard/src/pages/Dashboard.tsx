import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Video,
    FileText,
    ArrowRight,
    Clock,
    AlertTriangle,
    CheckCircle
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
    { label: 'Assigned Cases', value: '12', sub: '4 New today', color: 'primary', icon: <FileText size={20} color="#3b82f6" /> },
    { label: 'High Priority', value: '3', sub: 'Action required', color: 'error', icon: <AlertTriangle size={20} color="#ef4444" /> },
    { label: 'Pending Review', value: '8', sub: 'Avg wait: 2h', color: 'warning', icon: <Clock size={20} color="#f59e0b" /> },
    { label: 'Resolved Today', value: '24', sub: 'Personal best', color: 'success', icon: <CheckCircle size={20} color="#10b981" /> },
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

    const navigate = useNavigate();

    const TabButton = ({ active, onClick, icon: Icon, label, count }: any) => (
        <div
            onClick={onClick}
            style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '8px 12px',
                cursor: 'pointer',
                borderBottom: active ? `2px solid var(--color-primary)` : '2px solid transparent',
                color: active ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                fontWeight: 600,
                fontSize: '0.9rem',
                transition: 'all 0.2s'
            }}
        >
            <Icon size={18} />
            {label}
            <span style={{
                backgroundColor: active ? 'var(--color-primary)' : 'var(--color-bg-tertiary)',
                color: active ? '#fff' : 'var(--color-text)',
                padding: '2px 8px',
                borderRadius: '12px',
                fontSize: '0.75rem'
            }}>{count}</span>
        </div>
    );

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>

            {/* Row 1: KPI Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 'var(--space-6)' }}>
                {KPIS.map((kpi, index) => (
                    <KpiCard
                        key={index}
                        label={kpi.label}
                        value={kpi.value}
                        trend={kpi.sub}
                        trendDirection="neutral"
                        color={kpi.color as any}
                        icon={kpi.icon}
                    />
                ))}
            </div>

            {/* Row 2: Queue Panel with Tabs */}
            <Panel
                noPadding
                title={
                    <div style={{ display: 'flex', gap: '8px' }}>
                        <TabButton
                            active={activeTab === 'ai'}
                            onClick={() => setActiveTab('ai')}
                            icon={Video}
                            label="AI Detections"
                            count="5"
                        />
                        <TabButton
                            active={activeTab === 'citizen'}
                            onClick={() => setActiveTab('citizen')}
                            icon={FileText}
                            label="Citizen Reports"
                            count="3"
                        />
                    </div>
                }
                action={
                    <Button variant="ghost" size="sm" onClick={() => navigate('/queue')}>
                        View Full Queue <ArrowRight size={16} style={{ marginLeft: '4px' }} />
                    </Button>
                }
            >
                <DataTable headers={[
                    'Case ID',
                    'Type',
                    'Location',
                    'Time',
                    'Priority',
                    activeTab === 'ai' ? 'Confidence' : 'Evidence',
                    'Action'
                ]}>
                    {currentQueue.map((item) => (
                        <tr key={item.id}>
                            <td style={{ fontFamily: 'monospace', fontWeight: '500' }}>{item.id}</td>
                            <td>{item.type}</td>
                            <td>{item.location}</td>
                            <td style={{ color: 'var(--color-text-secondary)', whiteSpace: 'nowrap' }}>
                                <Clock size={14} style={{ verticalAlign: 'text-bottom', marginRight: '4px' }} />
                                {item.time}
                            </td>
                            <td>
                                <Badge variant={
                                    item.priority === 'High' ? 'error' :
                                        item.priority === 'Medium' ? 'warning' :
                                            'info'
                                }>
                                    {item.priority.toUpperCase()}
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
                                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        {item.evidence === 'Video' ? <Video size={14} /> : <FileText size={14} />}
                                        {item.evidence}
                                    </span>
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
