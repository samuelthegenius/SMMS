# Security Documentation - Smart Maintenance Management System (SMMS)

## Overview

This document outlines the security architecture, policies, and best practices for the SMMS application.

---

## 🔐 Environment Variables Setup

### Client-Side Variables (`.env` file)

These are **safe** to keep in `.env` (used by browser code):

```env
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY=your_anon_key
```

### Server-Side Secrets (Supabase Secrets)

These **MUST** be set in Supabase Dashboard, NOT in `.env`:

| Secret | Purpose | Where to Get |
|--------|---------|--------------|
| `GEMINI_API_KEY` | AI repair suggestions | [Google AI Studio](https://aistudio.google.com/app/apikey) |
| `EMAILJS_SERVICE_ID` | Email service identifier | [EmailJS Dashboard](https://dashboard.emailjs.com/) |
| `EMAILJS_TEMPLATE_ID` | Email template ID | EmailJS > Templates |
| `EMAILJS_USER_ID` | EmailJS public key | EmailJS > Account > API Keys |
| `EMAILJS_PRIVATE_KEY` | EmailJS private key | EmailJS > Account > API Keys |

### How to Set Supabase Secrets

**Option 1: Via Dashboard**
1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project
3. Navigate to **Edge Functions** > **Secrets**
4. Click **"New Secret"** for each variable
5. Enter name and value, click **Save**

**Option 2: Via CLI**
```bash
supabase login
supabase link --project-ref ntayjobqhpbozamoxgad
supabase secrets set GEMINI_API_KEY=your_key_here
supabase secrets set EMAILJS_SERVICE_ID=your_id_here
supabase secrets set EMAILJS_TEMPLATE_ID=your_id_here
supabase secrets set EMAILJS_USER_ID=your_id_here
supabase secrets set EMAILJS_PRIVATE_KEY=your_key_here
```

### ⚠️ Security Rules

1. **NEVER** commit `.env` to Git (it's in `.gitignore`)
2. **NEVER** put server-side secrets in `.env`
3. **ALWAYS** use Supabase Secrets for Edge Function credentials
4. **ROTATE** keys every 90 days
5. **USE** different keys for development and production

---

## 🔐 Security Architecture

### Authentication & Authorization

**Supabase Auth** is used for authentication with the following security features:

- **PKCE Flow**: More secure than implicit flow, prevents authorization code interception
- **Session Management**: Auto-refresh tokens with secure localStorage persistence
- **Email Verification**: Required for new accounts
- **Password Requirements**: 
  - Minimum 8 characters
  - At least one uppercase letter
  - At least one lowercase letter
  - At least one number

### Role-Based Access Control (RBAC)

| Role | Permissions |
|------|-------------|
| `student` | Create tickets, view own tickets, verify fixes |
| `staff` | Create tickets, view own tickets, verify fixes |
| `technician` | View assigned tickets, update status, access AI tools |
| `admin` | Full access to all tickets, user management, analytics |

---

## 🛡️ Database Security

### Row Level Security (RLS)

All tables have RLS enabled with least-privilege policies:

#### Profiles Table
- ✅ Users can view basic info of other users (name, role)
- ✅ Users can insert/update their own profile
- ❌ Users cannot change their own role or email via profile updates
- ✅ Admins can update any profile

#### Tickets Table
- ✅ Users can view tickets they created
- ✅ Technicians can view tickets assigned to them
- ✅ Admins can view all tickets
- ✅ Creators can update their tickets (limited fields)
- ✅ Technicians can update assigned tickets (status only)

#### Notifications Table
- ✅ Users can only view and update their own notifications

### Rate Limiting

Implemented at multiple levels:

1. **Login**: 5 attempts per 5 minutes, then 5-minute lockout
2. **Signup**: 3 attempts per 10 minutes, then 10-minute lockout
3. **Email Lookup (RPC)**: 10 attempts per 5 minutes
4. **Edge Functions**: Request count validation

### Secure RPC Functions

```sql
-- get_email_by_id: Rate-limited email lookup for ID-based login
-- register_secure_user: Validates access codes server-side
-- check_rate_limit: Generic rate limiting function
-- cleanup_old_notifications: Data retention (90 days)
-- cleanup_old_rate_limits: Cleanup old rate limit entries (24 hours)
```

---

## 🔑 Secrets Management

### Environment Variables

**NEVER commit `.env` files to version control.**

Required environment variables (see `.env.example`):

```bash
# Supabase
VITE_SUPABASE_URL=your_url
VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY=your_anon_key

# Server-side only (DO NOT expose to client)
GEMINI_API_KEY=your_key
EMAILJS_SERVICE_ID=your_id
EMAILJS_TEMPLATE_ID=your_id
EMAILJS_USER_ID=your_public_key
EMAILJS_PRIVATE_KEY=your_private_key

# Supabase Dashboard > Settings > Database > Secrets
app.settings.staff_secret=<GENERATE_WITH_OPENSSL>
app.settings.tech_secret=<GENERATE_WITH_OPENSSL>
```

### Generate Secure Secrets

```bash
# Generate 32-character hex string
openssl rand -hex 32
```

Set in Supabase Dashboard:
```sql
SELECT set_config('app.settings.staff_secret', '<your_secret>', false);
SELECT set_config('app.settings.tech_secret', '<your_secret>', false);
```

---

## 🌐 API Security

### CORS Configuration

Edge Functions use strict CORS policies:

```typescript
const ALLOWED_ORIGINS = [
    'http://localhost:5173',
    'http://localhost:3000',
    'https://mtusmms.me', // Production
]
```

### Input Validation

All user inputs are validated and sanitized:

- **Email**: Regex validation before sending
- **Text Inputs**: Length limits, prompt injection filtering
- **File Uploads**: MIME type validation, size limits (5MB)
- **JSON Payloads**: Schema validation

### Edge Function Security

1. **send-email**: 
   - Validates email addresses
   - Checks email type whitelist
   - Rate limiting via headers

2. **suggest-fix**:
   - Input sanitization (prompt injection prevention)
   - Image size validation (max 10MB)
   - API timeout (30s)
   - Response validation

---

## 📁 File Upload Security

### Image Upload Validation

```javascript
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIME_TYPES = [
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif'
];
```

### Storage Policies

- Files stored in Supabase Storage (`ticket-images` bucket)
- Public URLs generated for display
- Filename sanitization (timestamp + random string)

---

## 🚨 Security Best Practices

### For Developers

1. **Never hardcode secrets** - Use environment variables
2. **Validate all inputs** - Client and server-side
3. **Use parameterized queries** - Prevent SQL injection
4. **Implement rate limiting** - Prevent brute force
5. **Log security events** - Failed logins, access denied
6. **Keep dependencies updated** - Run `npm audit` regularly
7. **Use HTTPS only** - Enforce secure connections

### For Administrators

1. **Rotate secrets regularly** - Every 90 days
2. **Monitor rate limit logs** - Detect attack patterns
3. **Review RLS policies** - After schema changes
4. **Audit user roles** - Remove unnecessary admin access
5. **Backup database** - Regular automated backups

### For Users

1. **Strong passwords** - Use password managers
2. **Don't share credentials** - Each user needs own account
3. **Report suspicious activity** - Contact admin
4. **Logout on shared devices** - Session management

---

## 🔍 Common Vulnerabilities & Mitigations

### SQL Injection
✅ **Mitigated**: Supabase uses parameterized queries, RLS policies

### XSS (Cross-Site Scripting)
✅ **Mitigated**: React escapes outputs by default, CSP headers recommended

### CSRF (Cross-Site Request Forgery)
✅ **Mitigated**: Supabase Auth uses PKCE flow with secure tokens

### Brute Force Attacks
✅ **Mitigated**: Rate limiting on login/signup endpoints

### Privilege Escalation
✅ **Mitigated**: RLS policies, server-side role validation

### Data Exposure
✅ **Mitigated**: Minimal data exposure via RLS, no sensitive fields in public queries

---

## 📊 Security Headers (Recommended)

Add to your hosting platform (Vercel, Netlify, etc.):

```
Strict-Transport-Security: max-age=31536000; includeSubDomains
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:;
Referrer-Policy: strict-origin-when-cross-origin
```

---

## 🧪 Security Testing

### Automated Scans

```bash
# NPM audit
npm audit

# NPM audit fix
npm audit fix

# Check for outdated packages
npm outdated
```

### Manual Testing Checklist

- [ ] Login rate limiting works
- [ ] Users can't view other users' tickets
- [ ] Students can't access admin routes
- [ ] File upload rejects invalid types
- [ ] SQL injection attempts fail
- [ ] XSS attempts are escaped

---

## 📝 Incident Response

### If a Security Breach is Detected:

1. **Contain**: Disable affected accounts/endpoints
2. **Assess**: Determine scope and impact
3. **Notify**: Inform affected users
4. **Fix**: Patch vulnerability
5. **Review**: Update security policies
6. **Document**: Record incident details

### Contact

Report security vulnerabilities to: `security@mtusmms.me` (configure as needed)

---

## 📚 Additional Resources

- [Supabase Security Best Practices](https://supabase.com/docs/guides/auth/row-level-security)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [React Security Guidelines](https://react.dev/learn/preserving-and-resetting-state#security)
- [CORS Guide](https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS)

---

## 🔄 Changelog

### v2.0.0 (Current) - Security Hardening
- Added rate limiting to all auth endpoints
- Implemented strict RLS policies
- Added input validation to Edge Functions
- Fixed CORS wildcard issues
- Added file upload validation
- Removed hardcoded secrets

### v1.0.0 (Previous)
- Basic RLS policies
- Client-side validation only
- Wildcard CORS
- Hardcoded access codes

---

*Last Updated: March 2026*
