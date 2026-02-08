import React from 'react';
import { Card } from '../../components/ui/Card';

const FAQS = [
    {
        q: "What can I report via LexVision?",
        a: "You can report violations such as riding without a helmet, red light violations, and white line crossings. More types will be added soon."
    },
    {
        q: "What evidence is accepted?",
        a: "Clear photos or videos showing the violation and the vehicle's license plate. Timestamped footage is preferred."
    },
    {
        q: "How long does the review process take?",
        a: "Our goal is to verify all reports within 24 hours. You can track the status using your Report Tracking ID."
    },
    {
        q: "Can I submit anonymously?",
        a: "Yes, you can submit reports without providing personal details. However, providing contact info helps if we need more evidence."
    },
    {
        q: "How is my data used?",
        a: "Your data is used solely for traffic violation verification and is securely stored. See our Privacy Policy for more details."
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
