import { useContext } from 'react';
import { AuthContext } from './AuthContext';

export const useAuth = () => {
    const context = useContext(AuthContext);
    
    // If context is not available, return default values to prevent crashes
    if (!context) {
        if (import.meta.env.DEV) {
          console.warn('useAuth was called outside of AuthProvider. Returning default values.');
        }
        return {
            user: null,
            profile: null,
            loading: true,
            isAdmin: false,
            isTechnician: false,
            isStaff: false,
            isStudent: false
        };
    }
    
    return context;
};
