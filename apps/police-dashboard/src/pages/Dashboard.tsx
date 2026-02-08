import React from 'react';
import { Card } from '@lexvision/ui';

export const Dashboard: React.FC = () => {
    return (
        <div className="container">
            <h1 style={{ marginBottom: 'var(--space-6)' }}>Police Dashboard</h1>
            <div className="card-grid">
                <Card padding="lg">
                    <h3>Assigned Cases</h3>
                    <p style={{ fontSize: '2rem', fontWeight: 'bold' }}>12</p>
                </Card>
                <Card padding="lg">
                    <h3>High Priority</h3>
                    <p style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--color-error)' }}>3</p>
                </Card>
                <Card padding="lg">
                    <h3>Resolved Today</h3>
                    <p style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--color-success)' }}>5</p>
                </Card>
            </div>
        </div>
    );
};
