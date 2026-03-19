import React from 'react';
import { PlayCircle, ShieldCheck, Zap, BarChart3, Clock, MapPin } from 'lucide-react';
import { Card, Button } from '@lexvision/ui';
import styles from './Demo.module.css';

const SAMPLE_DETECTIONS = [
    {
        id: 1,
        title: "Helmet Violation",
        desc: "AI identifies a rider without a helmet at a busy intersection.",
        img: "/images/detections/helmet.png",
        location: "Colombo 03",
        time: "10:42 AM"
    },
    {
        id: 2,
        title: "Lane Violation",
        desc: "Vehicle detected crossing a double white line on a mountain pass.",
        img: "/images/detections/lane.png",
        location: "Ella Gap",
        time: "02:32 PM"
    },
    {
        id: 3,
        title: "Speeding Violation",
        desc: "High-speed pursuit capture with motion-compensated OCR.",
        img: "/images/detections/speeding.png",
        location: "Southern Exp.",
        time: "05:12 PM"
    }
];

export const Demo: React.FC = () => {
    return (
        <div className="container" style={{ paddingBottom: 'var(--space-16)' }}>
            <header className="page-header">
                <h1>Platform Demo</h1>
                <p>Experience the power of AI-driven traffic enforcement.</p>
            </header>

            <section className={styles.heroSection}>
                <div className={styles.videoMockup}>
                    <div className={styles.mockupHeader}>
                        <div className={styles.dot}></div>
                        <span>LIVE FEED: CAM-LKA-042</span>
                        <div className={styles.rec}>REC</div>
                    </div>
                    <div className={styles.videoOverlay}>
                        <PlayCircle size={80} className={styles.playIcon} />
                        <p>Watch Full System Walkthrough</p>
                        <Button variant="primary">Launch Interactive Demo</Button>
                    </div>
                </div>
            </section>

            <section className={styles.featuresSection}>
                <h2 className="section-title">Core AI Capabilities</h2>
                <div className={styles.featuresGrid}>
                    <div className={styles.featureItem}>
                        <Zap size={24} />
                        <div>
                            <h4>Real-time Inference</h4>
                            <p>Detect violations in under 200ms with our Edge-AI models.</p>
                        </div>
                    </div>
                    <div className={styles.featureItem}>
                        <BarChart3 size={24} />
                        <div>
                            <h4>Smart Analytics</h4>
                            <p>Identify accident hotspots using historical violation patterns.</p>
                        </div>
                    </div>
                    <div className={styles.featureItem}>
                        <ShieldCheck size={24} />
                        <div>
                            <h4>Chain of Custody</h4>
                            <p>Immutable evidence logging for every incident captured.</p>
                        </div>
                    </div>
                </div>
            </section>

            <section>
                <h2 className="section-title">Sample Detections</h2>
                <div className={styles.detectionsGrid}>
                    {SAMPLE_DETECTIONS.map((item) => (
                        <Card key={item.id} padding="none" className={styles.detectionCard}>
                            <div className={styles.imageWrapper}>
                                <img src={item.img} alt={item.title} />
                                <div className={styles.imageOverlay}>
                                    <span>{item.title}</span>
                                </div>
                            </div>
                            <div className={styles.cardInfo}>
                                <h3>{item.title}</h3>
                                <p>{item.desc}</p>
                                <div className={styles.meta}>
                                    <span><MapPin size={14} /> {item.location}</span>
                                    <span><Clock size={14} /> {item.time}</span>
                                </div>
                            </div>
                        </Card>
                    ))}
                </div>
            </section>
        </div>
    );
};
