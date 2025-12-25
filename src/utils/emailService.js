/**
 * @file src/utils/emailService.js
 * @description Frontend Utility for Email Notification System.
 * 
 * Key Features:
 * - API Abstraction: Decouples the frontend from the specific backend API implementation.
 * - Error Containment: Ensures email failures do not crash the main application flow.
 */
export const sendEmailNotification = async ({ to, subject, html }) => {
    try {
        // Securely Proxying the request through the /api endpoint
        const response = await fetch('/api/send-email', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ to, subject, html }),
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('Email API Error:', errorData);
            return false;
        }

        return true;
    } catch (error) {
        console.error('Failed to send email notification:', error);
        // Returns false to indicate failure without throwing, allowing the UI to degrade gracefully.
        return false;
    }
};
