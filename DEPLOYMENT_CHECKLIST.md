# Deployment Checklist - SMMS

## Pre-Deployment Security Checklist

### 🔐 Environment Variables

- [ ] Copy `.env.example` to `.env`
- [ ] Generate new secure random strings for access codes:
  ```bash
  openssl rand -hex 32
  ```
- [ ] Set Supabase URL and Anon Key
- [ ] Set EmailJS credentials
- [ ] Set Gemini API Key
- [ ] **NEVER commit `.env` to Git**

### 🗄️ Database Setup

- [ ] Run the updated `supabase_schema.sql` in Supabase SQL Editor
- [ ] Set database secrets in Supabase Dashboard:
  ```sql
  SELECT set_config('app.settings.staff_secret', '<your_32_char_secret>', false);
  SELECT set_config('app.settings.tech_secret', '<your_32_char_secret>', false);
  ```
- [ ] Verify RLS policies are enabled:
  ```sql
  SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public';
  ```
- [ ] Create Supabase Storage bucket `ticket-images` with public access

### 📧 Email Configuration

- [ ] Create EmailJS account
- [ ] Create email template for ticket notifications
- [ ] Configure template variables: `{{to_email}}`, `{{subject}}`, `{{message}}`
- [ ] Test email delivery

### 🤖 AI Configuration

- [ ] Get Gemini API key from Google AI Studio
- [ ] Set usage limits in Google Cloud Console
- [ ] Test AI suggestion endpoint

### 🔒 Security Verification

- [ ] Update CORS allowed origins in Edge Functions
- [ ] Test rate limiting (try 5 failed logins)
- [ ] Verify RLS policies (try to access other user's data)
- [ ] Test file upload validation (try uploading non-image)
- [ ] Run `npm audit` and fix vulnerabilities

---

## Deployment Steps

### 1. Build Application

```bash
npm install
npm run build
```

### 2. Deploy to Hosting Platform

#### Option A: Vercel

```bash
npm install -g vercel
vercel login
vercel --prod
```

#### Option B: Netlify

```bash
npm install -g netlify-cli
netlify login
netlify deploy --prod
```

#### Option C: Manual (cPanel, etc.)

1. Upload `dist/` folder contents to web server
2. Configure server to redirect all routes to `index.html`

### 3. Configure Environment Variables on Hosting

Add these to your hosting platform:

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY=your_anon_key
```

### 4. Update Edge Functions CORS

Update `ALLOWED_ORIGINS` in:
- `supabase/functions/send-email/index.ts`
- `supabase/functions/suggest-fix/index.ts`

Add your production domain:
```typescript
const ALLOWED_ORIGINS = [
    'http://localhost:5173',
    'https://your-production-domain.com',
]
```

### 5. Deploy Edge Functions

```bash
# Install Supabase CLI
npm install -g supabase

# Login
supabase login

# Link to your project
supabase link --project-ref your-project-ref

# Deploy functions
supabase functions deploy send-email
supabase functions deploy suggest-fix
```

---

## Post-Deployment Verification

### Functional Tests

- [ ] User can sign up
- [ ] Email verification works
- [ ] User can login
- [ ] User can create ticket
- [ ] Image upload works
- [ ] Auto-assignment works
- [ ] Technician receives notification
- [ ] Email notifications sent
- [ ] AI suggestions work
- [ ] Admin dashboard accessible
- [ ] RLS prevents unauthorized access

### Security Tests

- [ ] Login rate limiting works (5 failed attempts)
- [ ] Signup rate limiting works (3 attempts)
- [ ] Cannot view other users' tickets
- [ ] Student cannot access admin routes
- [ ] File upload rejects >5MB files
- [ ] File upload rejects non-images
- [ ] CORS only allows configured domains

### Performance Tests

- [ ] Page loads in <3 seconds
- [ ] Images load properly
- [ ] Real-time updates work
- [ ] No console errors

---

## Monitoring Setup

### Recommended Tools

1. **Error Tracking**: Sentry, LogRocket
2. **Analytics**: Google Analytics, Plausible
3. **Uptime Monitoring**: UptimeRobot, Pingdom
4. **Logs**: Supabase Logs, Axiom

### Supabase Monitoring

Enable in Supabase Dashboard:
- [ ] Database logs
- [ ] Auth logs
- [ ] Function logs
- [ ] Storage logs

Set up alerts for:
- [ ] High error rate
- [ ] Function failures
- [ ] Storage quota warnings

---

## Maintenance Tasks

### Daily
- [ ] Check error logs
- [ ] Monitor uptime

### Weekly
- [ ] Review new user signups
- [ ] Check storage usage
- [ ] Review failed login attempts

### Monthly
- [ ] Update dependencies: `npm update`
- [ ] Run security audit: `npm audit`
- [ ] Review and rotate secrets (quarterly)
- [ ] Backup database
- [ ] Clean old notifications:
  ```sql
  SELECT cleanup_old_notifications(90);
  ```

### Quarterly
- [ ] Rotate all API keys
- [ ] Review user roles and permissions
- [ ] Update security documentation
- [ ] Penetration testing

---

## Rollback Procedure

If deployment fails:

### 1. Revert Code

```bash
git revert HEAD
git push
```

### 2. Redeploy Previous Version

**Vercel:**
```bash
vercel rollback
```

**Netlify:**
- Go to Deploys in dashboard
- Click on previous successful deploy
- Click "Publish deploy"

### 3. Restore Database (if needed)

Supabase automatically backs up daily. To restore:
1. Go to Supabase Dashboard > Settings
2. Select backup point
3. Click Restore

---

## Troubleshooting

### Common Issues

**Issue**: Login fails with "Invalid credentials"
- **Fix**: Check Supabase URL and Anon Key

**Issue**: Email not sending
- **Fix**: Verify EmailJS credentials and template ID

**Issue**: AI suggestions not working
- **Fix**: Check Gemini API key and quota

**Issue**: File upload fails
- **Fix**: Create `ticket-images` bucket in Supabase Storage

**Issue**: CORS errors
- **Fix**: Update ALLOWED_ORIGINS in Edge Functions

**Issue**: Rate limit triggered too early
- **Fix**: Clear localStorage or wait for lockout period

---

## Support Contacts

- **Technical Issues**: Check logs in Supabase Dashboard
- **Security Issues**: See SECURITY.md
- **General Help**: Review documentation

---

*Last Updated: March 2026*
