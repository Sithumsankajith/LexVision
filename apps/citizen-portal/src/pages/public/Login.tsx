import React, { useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { LogIn, AlertCircle, CheckCircle2, Smartphone } from 'lucide-react';
import { Card, Input, Button } from '@lexvision/ui';
import { auth } from '@lexvision/api-client';
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
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isOtpModalOpen, setIsOtpModalOpen] = useState(false);
    const [otpVerificationResult, setOtpVerificationResult] = useState<CitizenOtpVerificationResult | null>(null);

    const navigationState = (location.state as AuthRedirectState | null) ?? null;
    const fromPath = navigationState?.from?.pathname || '/portal';
    const fromState = navigationState?.from?.state;
    const isFinalSubmitLogin = navigationState?.intent === 'final-report-submit';

    React.useEffect(() => {
        if (isFinalSubmitLogin) {
            setIsOtpModalOpen(true);
        }
    }, [isFinalSubmitLogin]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setIsLoading(true);

        try {
            await auth.login(email, password);
            navigate(fromPath, { replace: true, state: fromState });
        } catch (error: unknown) {
            setError(getErrorMessage(error, 'Login failed. Please check your credentials.'));
        } finally {
            setIsLoading(false);
        }
    };

    const handleOtpVerified = (result: CitizenOtpVerificationResult) => {
        setOtpVerificationResult(result);
    };

    return (
        <div className={styles.loginContainer}>
            <Card className={styles.loginCard} padding="lg">
                <div className={styles.header}>
                    <LogIn size={40} className={styles.icon} />
                    <h1>Citizen Portal Login</h1>
                    <p>{isFinalSubmitLogin ? 'Log in to submit your saved evidence report.' : 'Access your reports and rewards'}</p>
                </div>

                {otpVerificationResult && (
                    <Card className={styles.tokenCard} padding="md">
                        <div className={styles.successHeader}>
                            <CheckCircle2 size={22} />
                            <h2>Phone Verification Complete</h2>
                        </div>
                        <p className={styles.successText}>
                            Firebase phone authentication succeeded. The ID token below is ready for the later backend exchange step.
                        </p>
                        <div className={styles.verifiedMeta}>
                            <div>
                                <label>Verified Phone Number</label>
                                <span className={styles.verifiedValue}>{otpVerificationResult.phoneNumber}</span>
                            </div>
                            <div>
                                <label>Firebase UID</label>
                                <span className={styles.verifiedValue}>{otpVerificationResult.uid}</span>
                            </div>
                        </div>
                        <div className={styles.tokenField}>
                            <label htmlFor="firebase-id-token">Firebase ID Token</label>
                            <textarea
                                id="firebase-id-token"
                                className={styles.tokenPreview}
                                readOnly
                                value={otpVerificationResult.idToken}
                            />
                            <p className={styles.helperText}>
                                This is intentionally not connected to report submission or backend login yet.
                            </p>
                        </div>
                    </Card>
                )}

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
                    >
                        Verify With Phone OTP
                    </Button>
                    <p className={styles.helperText}>
                        This opens the reusable Firebase phone-auth modal with reCAPTCHA and returns a Firebase ID token after verification.
                    </p>
                </div>

                <div className={styles.divider}>
                    <span>Existing portal login</span>
                </div>

                <form onSubmit={handleSubmit} className={styles.form}>
                    <Input
                        label="Email Address"
                        type="email"
                        placeholder="e.g. citizen@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        required
                        fullWidth
                    />
                    <Input
                        label="Password"
                        type="password"
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        fullWidth
                    />

                    <Button
                        type="submit"
                        variant="primary"
                        isLoading={isLoading}
                        fullWidth
                        className={styles.submitBtn}
                    >
                        Login
                    </Button>
                </form>

                <div className={styles.footer}>
                    <p>Don't have an account? <Link to="/register" state={location.state}>Register here</Link></p>
                </div>
            </Card>

            <CitizenOtpLoginModal
                isOpen={isOtpModalOpen}
                onClose={() => setIsOtpModalOpen(false)}
                onVerified={handleOtpVerified}
                description={
                    isFinalSubmitLogin
                        ? 'Complete Firebase phone verification here. The ID token will be produced, but report submission wiring is intentionally deferred for the next step.'
                        : undefined
                }
            />
        </div>
    );
};
