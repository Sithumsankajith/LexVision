import React from 'react';
import { Camera, CheckCircle, Database, Eye } from 'lucide-react';
import { Card } from '@lexvision/ui';
import styles from './HowItWorks.module.css';

export const HowItWorks: React.FC = () => {
    return (
        <div className="container" style={{ paddingBottom: 'var(--space-16)' }}>
            <header className="page-header">
                <h1>How LexVision Works</h1>
                <p>A simple, transparent process to ensure road safety.</p>
            </header>

            <div className="card-grid">
                <div className={styles.step}>
                    <div className={styles.stepNumber}>1</div>
                    <Card className={styles.stepCard} padding="lg">
                        <div className={styles.iconWrapper}><Camera size={32} /></div>
                        <h3>Detect</h3>
                        <p>Citizens or automated cameras capture evidence of a traffic violation (image or video).</p>
                    </Card>
                </div>

                <div className={styles.step}>
                    <div className={styles.stepNumber}>2</div>
                    <Card className={styles.stepCard} padding="lg">
                        <div className={styles.iconWrapper}><CheckCircle size={32} /></div>
                        <h3>Report</h3>
                        <p>Evidence is uploaded via the portal with location and timestamp details.</p>
                    </Card>
                </div>

                <div className={styles.step}>
                    <div className={styles.stepNumber}>3</div>
                    <Card className={styles.stepCard} padding="lg">
                        <div className={styles.iconWrapper}><Database size={32} /></div>
                    </Card>
                </div>
            </div>

            <div className={styles.architecture}>
                <h2>System Architecture</h2>
                <div className={styles.diagram}>
                    <div className={styles.diagramBlock}>
                        <Eye size={24} />
                        <span>Input Sources</span>
                    </div>
                    <div className={styles.diagramArrow}>→</div>
                    <div className={styles.diagramBlock}>
                        <span>Processing (AI + Human)</span>
                    </div>
                    <div className={styles.diagramArrow}>→</div>
                    <div className={styles.diagramBlock}>
                        <span>Violation Database</span>
                    </div>
                    <div className={styles.diagramArrow}>→</div>
                    <div className={styles.diagramBlock}>
                        <span>Citizen Portal</span>
                    </div>
                </div>
            </div>
        </div>
    );
};
