import React from 'react';
import { Check } from 'lucide-react';
import styles from './Stepper.module.css';

interface Step {
    id: number;
    label: string;
}

interface StepperProps {
    steps: Step[];
    currentStep: number;
}

export const Stepper: React.FC<StepperProps> = ({ steps, currentStep }) => {
    return (
        <div className={styles.stepper}>
            {steps.map((step, index) => {
                const isCompleted = currentStep > step.id;
                const isCurrent = currentStep === step.id;

                return (
                    <div key={step.id} className={`${styles.step} ${isCompleted ? styles.completed : ''} ${isCurrent ? styles.current : ''}`}>
                        <div className={styles.indicator}>
                            {isCompleted ? <Check size={16} /> : <span>{step.id}</span>}
                        </div>
                        <div className={styles.label}>{step.label}</div>
                        {index < steps.length - 1 && (
                            <div className={`${styles.connector} ${isCompleted ? styles.connectorCompleted : ''}`} />
                        )}
                    </div>
                );
            })}
        </div>
    );
};
