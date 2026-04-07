import React, { useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { UserPlus, AlertCircle, CheckCircle } from 'lucide-react';
import { Card, Input, Button } from '@lexvision/ui';
import { auth } from '@lexvision/api-client';
import styles from './Login.module.css'; // Reuse login styles

const getErrorMessage = (error: unknown, fallback: string) => {
    if (error instanceof Error && error.message) {
        return error.message;
    }
    return fallback;
};

export const Register: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isSuccess, setIsSuccess] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (password !== confirmPassword) {
            setError('Passwords do not match');
            return;
        }

        setIsLoading(true);

        try {
            await auth.register(email, password);
            setIsSuccess(true);
            setTimeout(() => navigate('/login', { state: location.state }), 2000);
        } catch (error: unknown) {
            setError(getErrorMessage(error, 'Registration failed.'));
        } finally {
            setIsLoading(false);
        }
    };

    if (isSuccess) {
        return (
            <div className={styles.loginContainer}>
                <Card className={styles.loginCard} padding="lg" style={{ textAlign: 'center' }}>
                    <CheckCircle size={60} color="var(--color-success)" style={{ margin: '0 auto 16px' }} />
                    <h1>Account Created!</h1>
                    <p>Your account has been successfully created. Redirecting to login...</p>
                </Card>
            </div>
        );
    }

    return (
        <div className={styles.loginContainer}>
            <Card className={styles.loginCard} padding="lg">
                <div className={styles.header}>
                    <UserPlus size={40} className={styles.icon} />
                    <h1>Create Account</h1>
                    <p>Join LexVision to start reporting</p>
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
                    <Input
                        label="Confirm Password"
                        type="password"
                        placeholder="••••••••"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
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
                        Register
                    </Button>
                </form>

                <div className={styles.footer}>
                    <p>Already have an account? <Link to="/login" state={location.state}>Login here</Link></p>
                </div>
            </Card>
        </div>
    );
};
