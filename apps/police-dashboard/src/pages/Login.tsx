import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Button, Input } from '@lexvision/ui';
import { auth } from '@lexvision/api-client';

export const Login: React.FC = () => {
    const [badge, setBadge] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (!badge || !password) {
            setError('Please enter both badge number and password.');
            return;
        }

        setLoading(true);
        try {
            await auth.login(badge, true);
            navigate('/dashboard');
        } catch (err: any) {
            setError(err.message || 'Login failed.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100vh',
            backgroundColor: 'var(--color-bg)'
        }}>
            <Card padding="lg" style={{ width: '400px' }}>
                <h1 style={{ textAlign: 'center', marginBottom: 'var(--space-6)' }}>Police Portal Access</h1>

                <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                    <Input
                        label="Badge Number"
                        placeholder="P-12345"
                        fullWidth
                        value={badge}
                        onChange={(e) => setBadge(e.target.value)}
                        disabled={loading}
                    />
                    <Input
                        label="Password"
                        type="password"
                        fullWidth
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        disabled={loading}
                    />

                    {error && (
                        <div style={{
                            color: 'var(--color-error)',
                            fontSize: '0.875rem',
                            backgroundColor: 'rgba(239, 68, 68, 0.1)',
                            padding: 'var(--space-2)',
                            borderRadius: '4px',
                            textAlign: 'center'
                        }}>
                            {error}
                        </div>
                    )}

                    <Button variant="primary" fullWidth type="submit" disabled={loading}>
                        {loading ? 'Authenticating...' : 'Access System'}
                    </Button>
                </form>
            </Card>
        </div>
    );
};
