import React from 'react';
import { Mail, Phone, MapPin } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';

export const Contact: React.FC = () => {
    return (
        <div className="container" style={{ paddingBottom: 'var(--space-16)' }}>
            <header className="page-header">
                <h1>Contact Us</h1>
            </header>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 'var(--space-12)' }}>
                <div>
                    <h2 style={{ marginBottom: 'var(--spacing-lg)' }}>Get in Touch</h2>
                    <p style={{ marginBottom: 'var(--spacing-lg)', color: 'var(--color-text-secondary)' }}>
                        Have questions about LexVision? Reach out to our support team.
                    </p>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)' }}>
                            <div style={{ padding: 'var(--spacing-sm)', backgroundColor: 'var(--color-surface)', borderRadius: '50%' }}>
                                <Mail color="var(--color-primary)" />
                            </div>
                            <div>
                                <div style={{ fontWeight: 600 }}>Email</div>
                                <div style={{ color: 'var(--color-text-secondary)' }}>support@lexvision.lk</div>
                            </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)' }}>
                            <div style={{ padding: 'var(--spacing-sm)', backgroundColor: 'var(--color-surface)', borderRadius: '50%' }}>
                                <Phone color="var(--color-primary)" />
                            </div>
                            <div>
                                <div style={{ fontWeight: 600 }}>Phone</div>
                                <div style={{ color: 'var(--color-text-secondary)' }}>+94 11 234 5678</div>
                            </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)' }}>
                            <div style={{ padding: 'var(--spacing-sm)', backgroundColor: 'var(--color-surface)', borderRadius: '50%' }}>
                                <MapPin color="var(--color-primary)" />
                            </div>
                            <div>
                                <div style={{ fontWeight: 600 }}>Address</div>
                                <div style={{ color: 'var(--color-text-secondary)' }}>123 Lotus Road, Colombo 01</div>
                            </div>
                        </div>
                    </div>
                </div>

                <Card padding="lg">
                    <h3 style={{ marginBottom: 'var(--spacing-md)' }}>Send Message</h3>
                    <form onSubmit={(e) => e.preventDefault()}>
                        <div className="form-grid">
                            <Input label="Name" placeholder="Your Name" fullWidth />
                            <Input label="Email" placeholder="Your Email" type="email" fullWidth />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Message</label>
                            <textarea
                                className="form-textarea"
                                placeholder="How can we help?"
                            ></textarea>
                        </div>
                        <div className="form-actions">
                            <Button variant="primary" fullWidth>Send Message</Button>
                        </div>
                    </form>
                </Card>
            </div>
        </div>
    );
};
