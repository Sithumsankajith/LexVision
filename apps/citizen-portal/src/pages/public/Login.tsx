import React, { useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { LogIn, AlertCircle } from 'lucide-react';
import { Card, Input, Button } from '@lexvision/ui';
import { auth } from '@lexvision/api-client';
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

    const navigationState = (location.state as AuthRedirectState | null) ?? null;
    const fromPath = navigationState?.from?.pathname || '/portal';
    const fromState = navigationState?.from?.state;
    const isFinalSubmitLogin = navigationState?.intent === 'final-report-submit';

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

    return (
        <div className={styles.loginContainer}>
            <Card className={styles.loginCard} padding="lg">
                <div className={styles.header}>
                    <LogIn size={40} className={styles.icon} />
                    <h1>Citizen Portal Login</h1>
                    <p>{isFinalSubmitLogin ? 'Log in to submit your saved evidence report.' : 'Access your reports and rewards'}</p>
                </div>

                {error && (
                    <div className={styles.errorBox}>
                        <AlertCircle size={18} />
                        <span>{error}</span>
                    </div>
                )}

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
        </div>
    );
};
