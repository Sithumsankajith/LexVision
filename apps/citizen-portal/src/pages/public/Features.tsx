import React from 'react';
import { Shield, AlertTriangle, Lock, Heart, CheckCircle } from 'lucide-react';
import { Card } from '@lexvision/ui';
import styles from './Features.module.css';

export const Features: React.FC = () => {
    return (
        <div className={styles.pageWrapper}>
            <div className="container">
                <header className="page-header">
                    <h1>What LexVision Does for You</h1>
                    <p>We help build a safer community through education and transparent reporting.</p>
                </header>

                <section className={styles.section}>
                    <h2>Benefits for Citizens</h2>
                    <div className="card-grid">
                        <Card className={styles.featureCard} padding="lg">
                            <div className={styles.iconWrapper}><Heart size={32} /></div>
                            <h3>Simple Education</h3>
                            <p>We explain complex traffic laws in plain language so everyone can understand their responsibilities on the road.</p>
                        </Card>

                        <Card className={styles.featureCard} padding="lg">
                            <div className={styles.iconWrapper}><AlertTriangle size={32} /></div>
                            <h3>Safe Reporting</h3>
                            <p>Our platform allows you to report dangerous driving behavior safely and securely, without confrontation.</p>
                        </Card>

                        <Card className={styles.featureCard} padding="lg">
                            <div className={styles.iconWrapper}><CheckCircle size={32} /></div>
                            <h3>Fair Review</h3>
                            <p>Every report is manually reviewed by authorized personnel to ensure fairness. No automated fines are issued.</p>
                        </Card>
                    </div>
                </section>

                <section className={styles.section}>
                    <h2>Your Privacy & Trust</h2>
                    <div className={styles.privacyContent}>
                        <div className={styles.privacyText}>
                            <h3><Lock size={20} style={{ verticalAlign: 'bottom' }} /> Protecting Your Identity</h3>
                            <p>Your safety and privacy are our priority. LexVision is designed to protect you.</p>
                            <ul>
                                <li><strong>Anonymous Reporting:</strong> You can choose to submit reports without revealing your name publicly.</li>
                                <li><strong>Secure Data:</strong> Your information is kept private and is never shared with the public or the offender.</li>
                                <li><strong>Ethical Use:</strong> This platform is a tool for community safety, not for surveillance.</li>
                            </ul>
                        </div>
                        <div className={styles.privacyVisual}>
                            <Shield size={100} strokeWidth={1} color="var(--color-primary)" opacity={0.5} />
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
};
