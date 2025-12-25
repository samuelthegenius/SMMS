export const sendEmail = async ({ to, subject, html }) => {
    try {
        const response = await fetch('/api/send-email', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ to, subject, html }),
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to send email');
        }

        return await response.json();
    } catch (error) {
        console.error('Error sending email:', error);
        throw error;
    }
};
