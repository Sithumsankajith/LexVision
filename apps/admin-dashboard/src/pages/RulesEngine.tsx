import React, { useEffect, useState } from 'react';
import { Panel, Button, Input, Badge } from '@lexvision/ui';
import { mockDb } from '@lexvision/api-client';
import type { FineRule } from '@lexvision/types';
import { Plus, Edit2, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';

export const RulesEngine: React.FC = () => {
    const [rules, setRules] = useState<FineRule[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    
    // Form state
    const [isEditing, setIsEditing] = useState(false);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [formData, setFormData] = useState({
        violationType: '',
        penalCode: '',
        fineAmount: '',
        currency: 'LKR',
        description: '',
        active: true
    });
    const [submitting, setSubmitting] = useState(false);

    const loadRules = async () => {
        setLoading(true);
        try {
            const data = await mockDb.getFineRules();
            setRules(data);
            setError('');
        } catch (err: any) {
            setError(err.message || 'Failed to load fine rules');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadRules();
    }, []);

    const handleEdit = (rule: FineRule) => {
        setFormData({
            violationType: rule.violationType,
            penalCode: rule.penalCode,
            fineAmount: rule.fineAmount.toString(),
            currency: rule.currency || 'LKR',
            description: rule.description || '',
            active: rule.active
        });
        setEditingId(rule.id);
        setIsEditing(true);
    };

    const handleCreate = () => {
        setFormData({
            violationType: '',
            penalCode: '',
            fineAmount: '',
            currency: 'LKR',
            description: '',
            active: true
        });
        setEditingId(null);
        setIsEditing(true);
    };

    const handleCancel = () => {
        setIsEditing(false);
        setEditingId(null);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            if (editingId) {
                await mockDb.updateFineRule(editingId, {
                    penalCode: formData.penalCode,
                    fineAmount: parseFloat(formData.fineAmount),
                    currency: formData.currency,
                    description: formData.description,
                    active: formData.active
                });
            } else {
                await mockDb.createFineRule({
                    violationType: formData.violationType,
                    penalCode: formData.penalCode,
                    fineAmount: parseFloat(formData.fineAmount),
                    currency: formData.currency,
                    description: formData.description,
                    active: formData.active
                });
            }

            await loadRules();
            setIsEditing(false);
        } catch (err: any) {
            alert(err.message || 'Error saving rule');
        } finally {
            setSubmitting(false);
        }
    };

    if (loading && rules.length === 0) {
        return (
            <div style={{ padding: 'var(--space-6)', display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%' }}>
                <Loader2 className="spin" size={32} color="var(--color-primary)" />
            </div>
        );
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-6)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                    <h1 style={{ fontSize: '1.5rem', fontWeight: 600, margin: 0, color: 'var(--color-text)' }}>Fine Rules Engine</h1>
                    <p style={{ color: 'var(--color-text-secondary)', margin: 'var(--space-2) 0 0 0' }}>Manage default penalties and rules for different violation types.</p>
                </div>
                {!isEditing && (
                    <Button variant="primary" leftIcon={<Plus size={18} />} onClick={handleCreate}>
                        Add New Rule
                    </Button>
                )}
            </div>

            {error && (
                <div style={{ padding: 'var(--space-4)', backgroundColor: 'var(--color-error-light)', color: 'var(--color-error)', borderRadius: 'var(--radius-md)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                    <AlertCircle size={20} />
                    {error}
                </div>
            )}

            {isEditing ? (
                <Panel title={editingId ? "Edit Fine Rule" : "Create New Fine Rule"}>
                    <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
                            <Input
                                label="Violation Type"
                                value={formData.violationType}
                                onChange={(e) => setFormData({ ...formData, violationType: e.target.value })}
                                required
                                disabled={!!editingId} // Cannot change violation type of an existing rule, should create new
                            />
                            <Input
                                label="Penal Code"
                                value={formData.penalCode}
                                onChange={(e) => setFormData({ ...formData, penalCode: e.target.value })}
                                required
                            />
                            <Input
                                label="Fine Amount"
                                type="number"
                                value={formData.fineAmount}
                                onChange={(e) => setFormData({ ...formData, fineAmount: e.target.value })}
                                required
                            />
                            <Input
                                label="Currency"
                                value={formData.currency}
                                onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                                required
                            />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-1)' }}>
                            <label style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--color-text)' }}>Description</label>
                            <textarea
                                value={formData.description}
                                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                style={{
                                    width: '100%',
                                    padding: 'var(--space-3)',
                                    borderRadius: 'var(--radius-md)',
                                    border: '1px solid var(--color-border)',
                                    backgroundColor: 'var(--color-bg)',
                                    color: 'var(--color-text)',
                                    minHeight: '80px',
                                    resize: 'vertical',
                                    fontFamily: 'inherit'
                                }}
                            />
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                            <input
                                type="checkbox"
                                id="activeCheckbox"
                                checked={formData.active}
                                onChange={(e) => setFormData({ ...formData, active: e.target.checked })}
                                style={{ width: '16px', height: '16px' }}
                            />
                            <label htmlFor="activeCheckbox" style={{ fontSize: '0.875rem', cursor: 'pointer', color: 'var(--color-text)' }}>Active Rule</label>
                        </div>
                        <div style={{ display: 'flex', gap: 'var(--space-3)', justifyContent: 'flex-end', marginTop: 'var(--space-4)' }}>
                            <Button type="button" variant="ghost" onClick={handleCancel}>Cancel</Button>
                            <Button type="submit" variant="primary" disabled={submitting}>
                                {submitting ? 'Saving...' : 'Save Rule'}
                            </Button>
                        </div>
                    </form>
                </Panel>
            ) : (
                <Panel noPadding>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}>
                                    <th style={{ padding: 'var(--space-4)', fontWeight: 600 }}>Violation Type</th>
                                    <th style={{ padding: 'var(--space-4)', fontWeight: 600 }}>Penal Code</th>
                                    <th style={{ padding: 'var(--space-4)', fontWeight: 600 }}>Fine Amount</th>
                                    <th style={{ padding: 'var(--space-4)', fontWeight: 600 }}>Version</th>
                                    <th style={{ padding: 'var(--space-4)', fontWeight: 600 }}>Status</th>
                                    <th style={{ padding: 'var(--space-4)', fontWeight: 600, textAlign: 'right' }}>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {rules.length === 0 ? (
                                    <tr>
                                        <td colSpan={6} style={{ padding: 'var(--space-6)', textAlign: 'center', color: 'var(--color-text-secondary)' }}>
                                            No fine rules found.
                                        </td>
                                    </tr>
                                ) : (
                                    rules.map(rule => (
                                        <tr key={rule.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                            <td style={{ padding: 'var(--space-4)' }}>
                                                <span style={{ fontWeight: 500 }}>{rule.violationType}</span>
                                                {rule.description && (
                                                    <div style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginTop: '4px', maxWidth: '250px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                        {rule.description}
                                                    </div>
                                                )}
                                            </td>
                                            <td style={{ padding: 'var(--space-4)' }}>
                                                <Badge variant="neutral">{rule.penalCode}</Badge>
                                            </td>
                                            <td style={{ padding: 'var(--space-4)' }}>{rule.currency} {rule.fineAmount.toLocaleString()}</td>
                                            <td style={{ padding: 'var(--space-4)' }}>v{rule.version}</td>
                                            <td style={{ padding: 'var(--space-4)' }}>
                                                {rule.active ? (
                                                    <Badge variant="success"><CheckCircle size={12} style={{ marginRight: '4px' }}/> Active</Badge>
                                                ) : (
                                                    <Badge variant="error">Inactive</Badge>
                                                )}
                                            </td>
                                            <td style={{ padding: 'var(--space-4)', textAlign: 'right' }}>
                                                <Button variant="ghost" size="sm" onClick={() => handleEdit(rule)}>
                                                    <Edit2 size={16} /> Edit
                                                </Button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </Panel>
            )}
        </div>
    );
};
