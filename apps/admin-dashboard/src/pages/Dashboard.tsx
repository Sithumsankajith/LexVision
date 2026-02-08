import React from 'react';
import { Card } from '@lexvision/ui';

export const Dashboard: React.FC = () => {
    return (
        <div className="container">
            <h1 style={{ marginBottom: 'var(--space-6)' }}>Admin Dashboard</h1>
            <div className="card-grid">
                <Card padding="lg">
                    <h3>Total Reports</h3>
                    <p style={{ fontSize: '2rem', fontWeight: 'bold' }}>1,234</p>
                </Card>
                <Card padding="lg">
                    <h3>Pending Review</h3>
                    <p style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--color-primary)' }}>56</p>
                </Card>
                <Card padding="lg">
                    <h3>Verified Interactions</h3>
                    <p style={{ fontSize: '2rem', fontWeight: 'bold', color: 'var(--color-success)' }}>892</p>
                </Card>
            </div>
        </div>
    );
};
