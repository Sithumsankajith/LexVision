const SESSION_KEY = 'lexvision_user_session';
const API_BASE_URL = 'http://localhost:8000/api';

export interface UserSession {
    id: string;
    role: 'ADMIN' | 'POLICE' | 'CITIZEN';
    email: string;
    token: string;
}

export const auth = {
    /**
     * Authenticates a user with the backend API.
     */
    login: async (email: string, password: string): Promise<UserSession> => {
        const formData = new URLSearchParams();
        formData.append('username', email);
        formData.append('password', password);

        const response = await fetch(`${API_BASE_URL}/auth/login`, {
            method: 'POST',
            body: formData,
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || 'Invalid email or password.');
        }

        const data = await response.json();

        // Fetch user profile to get role and ID
        const profileRes = await fetch(`${API_BASE_URL}/users/me`, {
            headers: { 'Authorization': `Bearer ${data.access_token}` }
        });

        if (!profileRes.ok) {
            throw new Error('Failed to retrieve user profile after login.');
        }

        const profileData = await profileRes.json();
        const user = profileData.user;

        const session: UserSession = {
            id: user.id,
            role: user.role,
            email: user.email,
            token: data.access_token
        };

        localStorage.setItem(SESSION_KEY, JSON.stringify(session));
        return session;
    },

    /**
     * Registers a new user with the backend API.
     */
    register: async (email: string, password: string): Promise<void> => {
        const response = await fetch(`${API_BASE_URL}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || 'Registration failed. Email might already be in use.');
        }
    },

    /**
     * Retrieves the current active session.
     */
    getSession: (): UserSession | null => {
        try {
            const data = localStorage.getItem(SESSION_KEY);
            return data ? JSON.parse(data) : null;
        } catch {
            return null;
        }
    },

    /**
     * Clears the current session.
     */
    logout: () => {
        localStorage.removeItem(SESSION_KEY);
    },

    /**
     * Generic auth guard check
     */
    isAuthenticated: (): boolean => {
        return auth.getSession() !== null;
    }
};
