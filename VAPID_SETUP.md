# VAPID Setup for Web Push Notifications

## Quick Start (2 minutes)

### 1. Generate VAPID Keys

**Option A: Online Generator (Recommended)**
```
1. Visit: https://web-push-codelab.glitch.me/
2. Click "Generate VAPID Keys"
3. Copy both keys
```

**Option B: CLI (if you have Node.js)**
```bash
npx web-push generate-vapid-keys
```

You'll get output like:
```
Public Key:
BJPd0pJ64hRquKJh+tB1XcWKF6pRE9MDCW/H5S0zs7h/WW5O/ZXhNxAzOHjKmWhF

Private Key:
GJxGqPd0pJ64hRquKJh+tB1XcWKF6pRE9MDCW/H5S0zs
```

### 2. Add to Environment Variables

**Local Development (.env):**
```env
VITE_VAPID_PUBLIC_KEY=BJPd0pJ64hRquKJh+tB1XcWKF6pRE9MDCW/H5S0zs7h/WW5O/ZXhNxAzOHjKmWhF
VAPID_PRIVATE_KEY=GJxGqPd0pJ64hRquKJh+tB1XcWKF6pRE9MDCW/H5S0zs
VAPID_SUBJECT=mailto:admin@mtusmms.me
```

**Vercel Production:**
```bash
vercel env add VITE_VAPID_PUBLIC_KEY
vercel env add VAPID_PRIVATE_KEY
vercel env add VAPID_SUBJECT
```

Or use the Vercel Dashboard:
- Settings → Environment Variables
- Add the three variables above
- Set `VITE_VAPID_PUBLIC_KEY` to "Production" and "Preview"
- Set `VAPID_PRIVATE_KEY` to "Production" only (keep it secret!)

### 3. Update Service Worker

In `public/sw.js` or create `public/sw-push.js`:

```javascript
// Add at the top of your service worker
const VAPID_PUBLIC_KEY = 'YOUR_PUBLIC_KEY_HERE';

self.addEventListener('push', (event) => {
  const data = event.data.json();
  
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/apple-touch-icon.png',
      badge: '/favicon.ico',
      tag: data.tag,
      requireInteraction: true,
      actions: [
        { action: 'view', title: 'View Ticket' },
        { action: 'dismiss', title: 'Dismiss' }
      ],
      data: data.data
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  if (event.action === 'view' && event.notification.data?.ticketId) {
    event.waitUntil(
      clients.openWindow(`/ticket/${event.notification.data.ticketId}`)
    );
  }
});
```

### 4. Add to Frontend

The hook is already in `src/hooks/usePushNotifications.js`. Just make sure your `.env` has:

```env
VITE_VAPID_PUBLIC_KEY=your_public_key_here
```

### 5. Enable in Supabase Edge Function

In `supabase/functions/notification-dispatcher/index.ts`, add VAPID support:

```typescript
const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@mtusmms.me'

// For each push subscription:
const pushSubscription = notification.metadata?.subscription

if (pushSubscription) {
  await webPush.sendNotification(
    pushSubscription,
    JSON.stringify({
      title: 'SMMS Escalation Alert',
      body: notification.message,
      icon: '/apple-touch-icon.png',
      tag: `escalation-${notification.ticket_id}`,
      data: { ticketId: notification.ticket_id }
    }),
    {
      vapidDetails: {
        subject: VAPID_SUBJECT,
        publicKey: VAPID_PUBLIC_KEY!,
        privateKey: VAPID_PRIVATE_KEY!
      }
    }
  )
}
```

### 6. Test It

1. Deploy your app
2. Visit the site in Chrome/Edge
3. Click "Enable Push Notifications" (you'll see this in the UI)
4. Accept browser permission
5. Trigger an escalation by creating a ticket and waiting 2+ hours (or manually set `verified_at` in database)
6. You should receive a push notification!

## Browser Support

| Browser | Push Support | Notes |
|---------|-------------|-------|
| Chrome | ✅ Yes | Desktop & Android |
| Edge | ✅ Yes | Desktop & Android |
| Firefox | ✅ Yes | Desktop & Android |
| Safari | ⚠️ Limited | macOS Ventura+ only |
| iOS Safari | ❌ No | Use local notifications instead |

## Troubleshooting

**"Permission denied" error:**
- Check that `VAPID_PUBLIC_KEY` is set in `.env`
- Make sure the key is in the correct format (base64url, no spaces)

**"Subscription failed":**
- Check browser console for detailed errors
- Ensure service worker is registered
- Verify VAPID keys are valid (regenerate if needed)

**Notifications not showing:**
- Check notification permission in browser settings
- Check that `notification-dispatcher` edge function is running
- Look at Supabase logs for errors

**"VAPID keys invalid":**
- Keys must be generated as a pair - you can't mix public from one set with private from another
- Regenerate both keys if unsure

## Security Note

**Never commit the private key to git!**

```bash
# Add to .gitignore
.env
.env.local
.env.production
```

The private key should only be in:
1. Vercel environment variables (production)
2. Your local `.env` file (development)
3. Supabase Edge Function secrets

## Testing with cURL

Once set up, test the push service:

```bash
curl -X POST https://your-project.supabase.co/functions/v1/notification-dispatcher \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'
```

## Migration Notes

After setting up VAPID, run the migration to add push support:

```bash
supabase db push
```

This will add the `push_subscriptions` table to store user subscriptions.
