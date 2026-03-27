import { supabase } from "../lib/supabase";

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
        // Securely invoking the Supabase Edge Function
        const { error } = await supabase.functions.invoke('send-email', {
            body: { to, subject, html }
        });

        if (error) {
          if (import.meta.env.DEV) {
            console.error('Email Edge Function Error:', error);
          }
            return false;
        }

        return true;
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Failed to send email notification:', error);
      }
        // Returns false to indicate failure without throwing, allowing the UI to degrade gracefully.
        return false;
    }
};
