import React, { useState } from 'react';
import { Save } from 'lucide-react';
import { Button, Input, Select } from '@lexvision/ui';
import { Panel } from '@lexvision/ui';
import { mockDb } from '@lexvision/api-client';

export const Settings: React.FC = () => {
    const [threshold, setThreshold] = useState('low');
    const [isSaving, setIsSaving] = useState(false);

    const handleSave = async () => {
        setIsSaving(true);
        try {
            // map text to number
            const val = threshold === 'high' ? 0.8 : threshold === 'med' ? 0.5 : 0.25;
            await mockDb.adminUpdateAiThreshold(val);
            alert('Settings saved successfully!');
        } catch (e) {
            alert('Failed to save settings');
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 'bold' }}>System Settings</h1>
                <Button leftIcon={<Save size={16} />} onClick={handleSave} disabled={isSaving}>
                    {isSaving ? 'Saving...' : 'Save Changes'}
                </Button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-6)' }}>
                <Panel title="Platform Configuration">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                        <Input label="System Name" defaultValue="LexVision Platform" />
                        <Input label="Contact Email" defaultValue="support@lexvision.lk" />
                        <Select label="Timezone" value="asia" options={[{ value: 'asia', label: 'Asia/Colombo' }, { value: 'utc', label: 'UTC' }]} onChange={() => { }} />
                    </div>
                </Panel>

                <Panel title="Machine Learning API">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                        <Input label="Python Inference URL" defaultValue="http://localhost:8000" />
                        <Select label="Confidence Threshold" value={threshold} options={[{ value: 'low', label: 'Low (> 25%)' }, { value: 'med', label: 'Medium (> 50%)' }, { value: 'high', label: 'Strict (> 80%)' }]} onChange={(v) => setThreshold(v as string)} />
                        <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)' }}>
                            Adjusting the confidence threshold impacts the number of false positives routed to the Police Dashboard.
                        </p>
                    </div>
                </Panel>
            </div>
        </div>
    );
};
