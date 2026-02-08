import React from 'react';
import { Shield, Eye, AlertTriangle, FileText, Lock } from 'lucide-react';
import { Card } from '@lexvision/ui';
import styles from './Features.module.css';

export const Features: React.FC = () => {
    return (
        <div className={styles.pageWrapper}>
            <div className="container">
                <header className="page-header">
                    <h1>System Features</h1>
                    <p>Comprehensive violation monitoring for safer roads.</p>
                </header>

                <section className={styles.section}>
                    <h2>Detected Violations</h2>
                    <div className="card-grid">
                        <Card className={styles.featureCard} padding="lg">
                            <div className={styles.iconWrapper}><AlertTriangle size={32} /></div>
                            <h3>No Helmet Detection</h3>
                            <p>Identifies motorcycle riders and passengers without protective headgear using advanced computer vision.</p>
                            <div className={styles.detailList}>
                                <span>• Rider & Pillion detection</span>
                                <span>• High-accuracy classification</span>
                                <span>• Works in various lighting conditions</span>
                            </div>
                        </Card>

                        <Card className={styles.featureCard} padding="lg">
                            <div className={styles.iconWrapper}><Eye size={32} /></div>
                            <h3>Red Light Violation</h3>
                            <p>Detects vehicles crossing the stop line when the traffic signal is red.</p>
                            <div className={styles.detailList}>
                                <span>• Integration with traffic signal timing</span>
                                <span>• Captures vehicle trajectory</span>
                                <span>• Distinguishes between stop & go</span>
                            </div>
                        </Card>

                        <Card className={styles.featureCard} padding="lg">
                            <div className={styles.iconWrapper}><FileText size={32} /></div>
                            <h3>White Line Crossing</h3>
                            <p>Monitors lane discipline and illegal overtaking across solid white lines.</p>
                            <div className={styles.detailList}>
                                <span>• Lane marking detection</span>
                                <span>• Overtaking manoeuvre analysis</span>
                                <span>• Continuous monitoring</span>
                            </div>
                        </Card>
                    </div>
                </section>

                <section className={styles.section}>
                    <h2>Evidence & Privacy</h2>
                    <div className={styles.privacyContent}>
                        <div className={styles.privacyText}>
                            <h3><Lock size={20} style={{ verticalAlign: 'bottom' }} /> Secure Data Handling</h3>
                            <p>LexVision is designed with privacy at its core. All captured evidence is encrypted and accessible only to authorized law enforcement personnel.</p>
                            <ul>
                                <li><strong>Data Encryption:</strong> All images and videos are encrypted at rest and in transit.</li>
                                <li><strong>Access Control:</strong> Strict role-based access control (RBAC) ensures data security.</li>
                                <li><strong>Retention Policy:</strong> Evidence is automatically deleted after the statutory period unless required for legal proceedings.</li>
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
