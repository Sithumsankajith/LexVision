import React from 'react';
import { Link } from 'react-router-dom';
import { Card, Button, Input } from '@lexvision/ui';

export const Login: React.FC = () => {
    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100vh',
            backgroundColor: 'var(--color-bg)'
        }}>
            <Card padding="lg" style={{ width: '400px' }}>
                <h1 style={{ textAlign: 'center', marginBottom: 'var(--space-4)' }}>Admin Login</h1>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                    <Input label="Email" placeholder="admin@lexvision.lk" type="email" fullWidth />
                    <Input label="Password" type="password" fullWidth />
                    <Link to="/dashboard">
                        <Button variant="primary" fullWidth>Sign In</Button>
                    </Link>
                </div>
            </Card>
        </div>
    );
};
