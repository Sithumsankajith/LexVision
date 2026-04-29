import React, { useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { LogIn, AlertCircle, Smartphone, ShieldCheck, TriangleAlert } from 'lucide-react';
import { Card, Button } from '@lexvision/ui';
import { auth, type CitizenOtpReadiness } from '@lexvision/api-client';
import { CitizenOtpLoginModal, type CitizenOtpVerificationResult } from '@/components/CitizenOtpLoginModal';
import styles from './Login.module.css';

interface AuthRedirectState {
    from?: {
        pathname?: string;
        state?: unknown;
    };
    intent?: 'final-report-submit';
}

const getErrorMessage = (error: unknown, fallback: string) => {
    if (error instanceof Error && error.message) {
        return error.message;
    }
    return fallback;
};

export const Login: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isOtpModalOpen, setIsOtpModalOpen] = useState(false);
    const [otpReadiness, setOtpReadiness] = useState<CitizenOtpReadiness | null>(null);
    const [readinessError, setReadinessError] = useState<string | null>(null);

    const navigationState = (location.state as AuthRedirectState | null) ?? null;
    const fromPath = navigationState?.from?.pathname || '/portal';
    const fromState = navigationState?.from?.state;
    const isFinalSubmitLogin = navigationState?.intent === 'final-report-submit';

    React.useEffect(() => {
        if (auth.isCitizenAuthenticated()) {
            navigate(fromPath, { replace: true, state: fromState });
            return;
        }

        if (isFinalSubmitLogin) {
            setIsOtpModalOpen(true);
        }
    }, [fromPath, fromState, isFinalSubmitLogin, navigate]);

    React.useEffect(() => {
        let isMounted = true;

        auth.getCitizenOtpReadiness()
            .then((readiness) => {
                if (isMounted) {
                    setOtpReadiness(readiness);
                }
            })
            .catch((loadError: unknown) => {
                if (isMounted) {
                    setReadinessError(getErrorMessage(loadError, 'Unable to load OTP readiness details.'));
                }
            });

        return () => {
            isMounted = false;
        };
    }, []);

    const handleOtpVerified = async (result: CitizenOtpVerificationResult) => {
        setError(null);
        setIsLoading(true);

        try {
            await auth.loginCitizenWithFirebaseToken(result.idToken, { persistSession: true });
            navigate(fromPath, { replace: true, state: fromState });
        } catch (verificationError: unknown) {
            const message = getErrorMessage(verificationError, 'Phone verification succeeded, but we could not create your citizen session.');
            setError(message);
            throw new Error(message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className={styles.loginContainer}>
            <Card className={styles.loginCard} padding="lg">
                <div className={styles.header}>
                    <LogIn size={40} className={styles.icon} />
                    <h1>Citizen Portal Login</h1>
                    <p>{isFinalSubmitLogin ? 'Verify your phone to continue with the saved report submission.' : 'Verify your phone number to view only the reports linked to your citizen account.'}</p>
                </div>

                {error && (
                    <div className={styles.errorBox}>
                        <AlertCircle size={18} />
                        <span>{error}</span>
                    </div>
                )}

                <div className={styles.otpSection}>
                    <Button
                        type="button"
                        variant="primary"
                        fullWidth
                        className={styles.otpTrigger}
                        leftIcon={<Smartphone size={18} />}
                        onClick={() => setIsOtpModalOpen(true)}
                        isLoading={isLoading}
                    >
                        Verify With Phone OTP
                    </Button>
                    <p className={styles.helperText}>
                        Use the same verified mobile number you used during report submission. After OTP verification, LexVision will create your citizen session and open your reports area.
                    </p>
                </div>

                <div className={styles.readinessCard}>
                    <div className={styles.readinessHeader}>
                        {otpReadiness?.backend_configured ? (
                            <ShieldCheck size={18} className={styles.readinessSuccessIcon} />
                        ) : (
                            <TriangleAlert size={18} className={styles.readinessWarningIcon} />
                        )}
                        <h2>OTP Requirements</h2>
                    </div>

                    {readinessError ? (
                        <p className={styles.readinessError}>{readinessError}</p>
                    ) : otpReadiness ? (
                        <>
                            <p className={styles.readinessSummary}>
                                Backend Firebase Admin: <strong>{otpReadiness.backend_configured ? 'Configured' : 'Not configured'}</strong>
                                {otpReadiness.firebase_project_id ? ` for ${otpReadiness.firebase_project_id}` : ''}
                            </p>

                            {!otpReadiness.backend_configured && otpReadiness.missing_backend_env.length > 0 && (
                                <p className={styles.readinessError}>
                                    Missing backend env: {otpReadiness.missing_backend_env.join(', ')}
                                </p>
                            )}

                            <ul className={styles.requirementsList}>
                                {otpReadiness.requirements.map((requirement) => (
                                    <li key={requirement}>{requirement}</li>
                                ))}
                            </ul>
                        </>
                    ) : (
                        <p className={styles.readinessSummary}>Loading OTP readiness details...</p>
                    )}
                </div>

                <div className={styles.footer}>
                    <p>Need to check a report without signing in? <Link to="/portal/track">Track by reference number</Link></p>
                </div>
            </Card>

            <CitizenOtpLoginModal
                isOpen={isOtpModalOpen}
                onClose={() => setIsOtpModalOpen(false)}
                onVerified={handleOtpVerified}
                description={
                    isFinalSubmitLogin
                        ? 'Complete Firebase phone verification here to continue with your saved evidence submission.'
                        : 'Verify your phone number to open your citizen reports linked to this mobile account.'
                }
            />
        </div>
    );
};
