import React from 'react';
import { Mail, Phone, MapPin } from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Input } from '../../components/ui/Input';
import { Button } from '../../components/ui/Button';

export const Contact: React.FC = () => {
    return (
        <div className="container" style={{ padding: 'var(--spacing-xl) 0' }}>
            <h1 style={{ textAlign: 'center', marginBottom: 'var(--spacing-xl)' }}>Contact Us</h1>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 'var(--spacing-xl)' }}>
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
                        <Input label="Name" placeholder="Your Name" fullWidth />
                        <Input label="Email" placeholder="Your Email" type="email" fullWidth />
                        <div style={{ marginBottom: 'var(--spacing-md)' }}>
                            <label style={{ fontWeight: 500, marginBottom: '4px', display: 'block', fontSize: '0.875rem' }}>Message</label>
                            <textarea
                                style={{
                                    width: '100%',
                                    padding: '8px',
                                    borderRadius: '4px',
                                    border: '1px solid var(--color-border)',
                                    minHeight: '120px',
                                    fontFamily: 'inherit'
                                }}
                                placeholder="How can we help?"
                            ></textarea>
                        </div>
                        <Button variant="primary" fullWidth>Send Message</Button>
                    </form>
                </Card>
            </div>
        </div>
    );
};
