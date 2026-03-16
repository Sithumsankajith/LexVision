import React, { useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { LogIn, AlertCircle } from 'lucide-react';
import { Card, Input, Button } from '@lexvision/ui';
import { auth } from '@lexvision/api-client';
import styles from './Login.module.css';

export const Login: React.FC = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const from = (location.state as any)?.from?.pathname || '/portal';

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);
        setIsLoading(true);

        try {
            await auth.login(email, password);
            navigate(from, { replace: true });
        } catch (err: any) {
            setError(err.message || 'Login failed. Please check your credentials.');
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
                    <p>Access your reports and rewards</p>
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
                    <p>Don't have an account? <Link to="/register">Register here</Link></p>
                </div>
            </Card>
        </div>
    );
};
