import React from 'react';
import { Card } from '@lexvision/ui';
import { HelpCircle, Shield, Info, AlertCircle, Scale } from 'lucide-react';
import styles from './FAQ.module.css';

const FAQS = [
    {
        q: "Can I report anonymously?",
        a: "Yes, you can submit reports without revealing your identity publicly. Your safety and privacy are our top priority.",
        icon: <HelpCircle size={24} />
    },
    {
        q: "Will my identity be revealed?",
        a: "No, your identity is strictly protected and only visible to authorized law enforcement officials if absolutely necessary.",
        icon: <Shield size={24} />
    },
    {
        q: "Will I get into trouble?",
        a: "No, reporting dangerous behavior is a responsible civic act. We only discourage blatantly false or malicious reports.",
        icon: <AlertCircle size={24} />
    },
    {
        q: "What if the report is incorrect?",
        a: "Our authorities review every report manually. If the evidence is unclear or incorrect, no action will be taken.",
        icon: <Info size={24} />
    },
    {
        q: "Does this issue fines automatically?",
        a: "No. LexVision is a tool for police review. A trained officer makes the final decision on any legal action.",
        icon: <Scale size={24} />
    }
];

export const FAQ: React.FC = () => {
    return (
        <div className="container" style={{ paddingBottom: 'var(--space-16)' }}>
            <header className="page-header">
                <h1>Frequently Asked Questions</h1>
                <p>Everything you need to know about our reporting platform.</p>
            </header>

            <div className={styles.faqGrid}>
                {FAQS.map((faq, index) => (
                    <Card key={index} padding="lg" className={styles.faqCard}>
                        <div className={styles.cardHeader}>
                            <div className={styles.iconWrapper}>{faq.icon}</div>
                            <h3>{faq.q}</h3>
                        </div>
                        <p>{faq.a}</p>
                    </Card>
                ))}
            </div>
        </div>
    );
};
