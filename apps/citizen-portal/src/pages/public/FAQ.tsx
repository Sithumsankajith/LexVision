import React from 'react';
import { Card } from '@lexvision/ui';

const FAQS = [
    {
        q: "Can I report anonymously?",
        a: "Yes, you can submit reports without revealing your identity publicly. Your safety and privacy are our top priority."
    },
    {
        q: "Will my identity be revealed to the offender?",
        a: "No, your identity is strictly protected and only visible to authorized law enforcement officials if absolutely necessary for legal processing."
    },
    {
        q: "Will I get into trouble for reporting?",
        a: "No, reporting dangerous behavior is a responsible civic act. However, we discourage submitting clearly false or malicious evidence."
    },
    {
        q: "What if the report is incorrect?",
        a: "Our authorities review every single report manually. If the evidence is unclear, ambiguous, or incorrect, no action will be taken against anyone."
    },
    {
        q: "Does this platform issue fines automatically?",
        a: "No. LexVision is a reporting tool, not a judge. A trained police officer reviews every submission before any fine or legal action is issued."
    }
];

export const FAQ: React.FC = () => {
    return (
        <div className="container" style={{ paddingBottom: 'var(--space-16)', maxWidth: '800px' }}>
            <header className="page-header">
                <h1>Frequently Asked Questions</h1>
            </header>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
                {FAQS.map((faq, index) => (
                    <Card key={index} padding="lg">
                        <h3 style={{ marginBottom: 'var(--spacing-sm)', color: 'var(--color-primary)' }}>{faq.q}</h3>
                        <p style={{ color: 'var(--color-text-secondary)' }}>{faq.a}</p>
                    </Card>
                ))}
            </div>
        </div>
    );
};
