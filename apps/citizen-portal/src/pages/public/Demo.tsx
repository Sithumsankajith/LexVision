import React from 'react';
import { PlayCircle, Image } from 'lucide-react';
import { Card } from '../../components/ui/Card';

export const Demo: React.FC = () => {
    return (
        <div className="container" style={{ paddingBottom: 'var(--space-16)' }}>
            <header className="page-header">
                <h1>Platform Demo</h1>
                <p>Explore the capabilities of the LexVision system.</p>
            </header>

            <section style={{ marginBottom: 'var(--spacing-xxl)' }}>
                <h2 style={{ textAlign: 'center' }}>Live Monitoring Walkthrough</h2>
                <div style={{
                    maxWidth: '800px',
                    height: '450px',
                    margin: '0 auto',
                    backgroundColor: '#000',
                    borderRadius: 'var(--radius-lg)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: 'white',
                    flexDirection: 'column',
                    gap: '16px',
                    position: 'relative'
                }}>
                    <PlayCircle size={64} style={{ opacity: 0.8, cursor: 'pointer' }} />
                    <p>Video Placeholder (Full System Demo)</p>
                </div>
            </section>

            <section>
                <h2 style={{ textAlign: 'center' }}>Sample Detections</h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 'var(--spacing-lg)' }}>
                    {[1, 2, 3].map((i) => (
                        <Card key={i} padding="none">
                            <div style={{
                                height: '200px',
                                backgroundColor: 'var(--color-border)',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: 'var(--color-text-secondary)'
                            }}>
                                <Image size={32} />
                            </div>
                            <div style={{ padding: 'var(--spacing-md)' }}>
                                <h3>Sample Violation #{i}</h3>
                                <p>Automated detection example showing identifying features and context.</p>
                            </div>
                        </Card>
                    ))}
                </div>
            </section>
        </div>
    );
};
