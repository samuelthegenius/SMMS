/**
 * Vercel Cron Job: Trigger Escalation Monitor
 * Runs every 30 minutes to check for stale tickets and send escalation emails
 * 
 * Schedule: */30 * * * * (every 30 minutes)
 */

export default async function handler(req, res) {
  // Verify cron secret to ensure only Vercel can trigger this
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = req.headers.authorization;

  // Allow if no secret is set (for development) or if secret matches
  let isAuthorized = false;

  if (!cronSecret) {
    // No secret configured - allow for development
    isAuthorized = true;
  } else if (authHeader === `Bearer ${cronSecret}`) {
    // Valid secret provided
    isAuthorized = true;
  } else if (req.headers['x-vercel-signature'] || req.headers['user-agent']?.includes('Vercel')) {
    // Called by Vercel cron system
    isAuthorized = true;
  }

  if (!isAuthorized) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error('Missing Supabase configuration');
    }

    // Call the escalation-monitor edge function
    const functionUrl = `${supabaseUrl}/functions/v1/escalation-monitor`;
    
    const response = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Edge function error: ${response.status} ${errorText}`);
    }

    const result = await response.json();

    res.status(200).json({
      success: true,
      timestamp: new Date().toISOString(),
      result
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
}
