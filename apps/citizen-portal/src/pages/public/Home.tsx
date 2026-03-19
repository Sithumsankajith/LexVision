import React from 'react';
import { Link } from 'react-router-dom';
import { Eye, ChevronRight, AlertTriangle, FileText } from 'lucide-react';
import { Button, Card } from '@lexvision/ui';
import styles from '@/pages/public/Home.module.css';

export const Home: React.FC = () => {
    return (
        <div className={styles.home}>
            {/* Hero Section */}
            {/* Hero Section */}
            <section className={styles.hero}>
                <div className={`container ${styles.heroContainer}`}>
                    <div className={styles.heroContent}>
                        <header className="page-header">
                            <h1 className={styles.heroTitle}>Making Sri Lankan Roads Safer for Everyone</h1>
                            <p className={styles.heroSubtitle}>
                                Know the traffic rules that keep us safe. Report dangerous violations easily and help build a responsible community.
                            </p>
                            <div className={styles.heroActions}>
                                <Link to="/portal">
                                    <Button size="lg" variant="primary" rightIcon={<ChevronRight />}>
                                        Report a Road Violation
                                    </Button>
                                </Link>
                                <Link to="/how-it-works">
                                    <Button size="lg" variant="secondary">
                                        Learn Traffic Rules
                                    </Button>
                                </Link>
                            </div>
                        </header>
                    </div>
                </div>
            </section>

            {/* Why Road Safety Matters */}
            <section className={styles.stats}>
                <div className="container">
                    <div className={styles.statsGrid}>
                        <div className={styles.statItem}>
                            <div className={styles.statValue}>Safety</div>
                            <div className={styles.statLabel}>Protecting Families</div>
                        </div>
                        <div className={styles.statItem}>
                            <div className={styles.statValue}>Trust</div>
                            <div className={styles.statLabel}>Fair & Transparent</div>
                        </div>
                        <div className={styles.statItem}>
                            <div className={styles.statValue}>Community</div>
                            <div className={styles.statLabel}>Safer Together</div>
                        </div>
                    </div>
                </div>
            </section>

            {/* Problem Section -> Why It Matters */}
            <section className={styles.problem}>
                <div className="container">
                    <header className={styles.sectionHeader}>
                        <h2>Why Road Safety Matters</h2>
                        <p>Every traffic rule exists to protect a life.</p>
                    </header>
                    <div className="card-grid">
                        <Card className={styles.problemCard} padding="lg">
                            <div className={styles.problemIcon}><AlertTriangle size={48} /></div>
                            <h3>Protecting Loved Ones</h3>
                            <p>When we follow the law, we ensure our children and families return home safely.</p>
                        </Card>
                        <Card className={styles.problemCard} padding="lg">
                            <div className={styles.problemIcon}><Eye size={48} /></div>
                            <h3>Community Responsibility</h3>
                            <p>Road safety is a shared responsibility. Your actions helps prevent accidents.</p>
                        </Card>
                        <Card className={styles.problemCard} padding="lg">
                            <div className={styles.problemIcon}><FileText size={48} /></div>
                            <h3>Fairness Law</h3>
                            <p>We believe in a system where rules are respectful, clear, and fair for everyone.</p>
                        </Card>
                    </div>
                </div>
            </section>

            {/* Features Section -> Common Violations */}
            <section className={styles.features}>
                <div className="container">
                    <header className={styles.sectionHeader}>
                        <h2>Common Road Violations</h2>
                        <p>Understanding the rules is the first step to safety.</p>
                    </header>
                    <div className="card-grid">
                        <Link to="/demo" className={styles.featureLink}>
                            <Card className={styles.featureCard} padding="none">
                                <div className={styles.featureImage}>
                                    <img src="/images/detections/helmet.png" alt="No Helmet" />
                                </div>
                                <div className={styles.featureInfo}>
                                    <h3>Riding Without a Helmet</h3>
                                    <p>Helmets are your only defense against severe head injuries. Always ride responsibly.</p>
                                </div>
                            </Card>
                        </Link>
                        <Link to="/demo" className={styles.featureLink}>
                            <Card className={styles.featureCard} padding="none">
                                <div className={styles.featureImage}>
                                    <img src="/images/detections/speeding.png" alt="Speeding" />
                                </div>
                                <div className={styles.featureInfo}>
                                    <h3>Overspeeding</h3>
                                    <p>Excessive speed reduces reaction time. Slow down and protect fellow commuters.</p>
                                </div>
                            </Card>
                        </Link>
                        <Link to="/demo" className={styles.featureLink}>
                            <Card className={styles.featureCard} padding="none">
                                <div className={styles.featureImage}>
                                    <img src="/images/detections/lane.png" alt="Lane Crossing" />
                                </div>
                                <div className={styles.featureInfo}>
                                    <h3>White Line Crossing</h3>
                                    <p>Lane discipline helps prevent dangerous head-on collisions at blind turns.</p>
                                </div>
                            </Card>
                        </Link>
                    </div>
                </div>
            </section>

            {/* CTA */}
            <section className={styles.cta}>
                <div className="container">
                    <div className={styles.ctaContent}>
                        <h2>Be a Part of the Solution</h2>
                        <p style={{ marginBottom: '2rem', maxWidth: '600px', marginInline: 'auto' }}>
                            Road safety starts with you. Whether you drive, ride, or walk, your actions matter.
                        </p>
                        <div className={styles.ctaButtons}>
                            <Link to="/portal/report">
                                <Button variant="primary" size="lg">Submit a Report</Button>
                            </Link>
                            <Link to="/portal/track">
                                <Button variant="outline" size="lg">Track Report</Button>
                            </Link>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
};
