import React, { useState } from 'react';
import { Save, Check } from 'lucide-react';
import { Button, Input, Select } from '@lexvision/ui';
import { Panel } from '@lexvision/ui';

const PREFS_KEY = 'lexvision_police_prefs';

interface Preferences {
    displayName: string;
    defaultView: string;
    queueSorting: string;
}

const getPrefs = (): Preferences => {
    try {
        const stored = localStorage.getItem(PREFS_KEY);
        if (stored) return JSON.parse(stored);
    } catch { }
    return { displayName: 'Officer Perera', defaultView: 'ai', queueSorting: 'newest' };
};

export const Settings: React.FC = () => {
    const [prefs, setPrefs] = useState<Preferences>(getPrefs());
    const [saved, setSaved] = useState(false);

    const handleSave = () => {
        localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 'bold' }}>Dashboard Settings</h1>
                <Button
                    leftIcon={saved ? <Check size={16} /> : <Save size={16} />}
                    onClick={handleSave}
                    variant={saved ? 'outline' : 'primary'}
                    style={saved ? { color: '#10b981', borderColor: '#10b981' } : undefined}
                >
                    {saved ? 'Saved!' : 'Save Preferences'}
                </Button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 'var(--space-6)' }}>
                <Panel title="Profile & Preferences">
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', maxWidth: '500px' }}>
                        <Input label="Officer Badge ID" defaultValue="OP-9021" disabled />
                        <Input
                            label="Display Name"
                            value={prefs.displayName}
                            onChange={(e) => setPrefs({ ...prefs, displayName: e.target.value })}
                        />
                        <Select
                            label="Default Dashboard View"
                            value={prefs.defaultView}
                            options={[{ value: 'ai', label: 'AI Detections First' }, { value: 'citizen', label: 'Citizen Reports First' }]}
                            onChange={(e) => setPrefs({ ...prefs, defaultView: e.target.value })}
                        />
                        <Select
                            label="Queue Sorting"
                            value={prefs.queueSorting}
                            options={[{ value: 'newest', label: 'Newest First' }, { value: 'priority', label: 'Highest Priority First' }]}
                            onChange={(e) => setPrefs({ ...prefs, queueSorting: e.target.value })}
                        />
                    </div>
                </Panel>
            </div>
        </div>
    );
};
