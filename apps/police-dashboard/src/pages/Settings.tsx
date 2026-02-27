import React from 'react';
import { Save } from 'lucide-react';
import { Button, Input, Select } from '@lexvision/ui';
import { Panel } from '@lexvision/ui';

export const Settings: React.FC = () => {
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 'bold' }}>Dashboard Settings</h1>
                <Button leftIcon={<Save size={16} />}>Save Preferences</Button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 'var(--space-6)' }}>
                <Panel title="Profile & Preferences">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', maxWidth: '500px' }}>
                        <Input label="Officer Badge ID" defaultValue="OP-9021" disabled />
                        <Input label="Display Name" defaultValue="Officer Perera" />
                        <Select label="Default Dashboard View" value="ai" options={[{ value: 'ai', label: 'AI Detections First' }, { value: 'citizen', label: 'Citizen Reports First' }]} onChange={() => { }} />
                        <Select label="Queue Sorting" value="newest" options={[{ value: 'newest', label: 'Newest First' }, { value: 'priority', label: 'Highest Priority First' }]} onChange={() => { }} />
                    </div>
                </Panel>
            </div>
        </div>
    );
};
