const SESSION_KEY = 'lexvision_user_session';

export interface UserSession {
    id: string;
    role: 'admin' | 'police';
    displayName: string;
    token: string;
}

export const auth = {
    /**
     * Simulates an API login call.
     * In a real app, this would send credentials to the backend.
     */
    login: async (identifier: string, isPolice: boolean): Promise<UserSession> => {
        // Simulate network delay
        await new Promise(resolve => setTimeout(resolve, 600));

        if (!identifier || identifier.trim() === '') {
            throw new Error('Identifier cannot be empty.');
        }

        let session: UserSession;

        if (isPolice) {
            if (!identifier.toUpperCase().startsWith('P-')) {
                throw new Error('Invalid police badge number. Format: P-XXXXX');
            }
            session = {
                id: identifier.toUpperCase(),
                role: 'police',
                displayName: `Officer ${identifier.substring(2)}`,
                token: 'mock-jwt-token-police-xxx'
            };
        } else {
            if (!identifier.includes('@lexvision.lk')) {
                throw new Error('Invalid admin email. Must be @lexvision.lk domain.');
            }
            session = {
                id: 'ADM-01',
                role: 'admin',
                displayName: identifier.split('@')[0],
                token: 'mock-jwt-token-admin-xxx'
            };
        }

        localStorage.setItem(SESSION_KEY, JSON.stringify(session));
        return session;
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
