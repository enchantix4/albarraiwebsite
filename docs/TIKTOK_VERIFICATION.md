# TikTok Developers – Domain verification

**Domain:** `albaxrarix.co.uk`  
**Production site:** https://albaxrarix.co.uk/

## DNS TXT record (TikTok site verification)

Add this **TXT** record in the DNS for **albaxrarix.co.uk** (at your registrar or Vercel DNS):

| Type | Name/Host | Value |
|------|-----------|--------|
| TXT  | `@` (or leave blank for root) | `tiktok-developers-site-verification=z4zP73VFpnuJfDnYPjKLk5l0YcLww8Qb` |

- **Name:** Use `@` for the root domain `albaxrarix.co.uk`, or whatever your DNS provider uses for “root” (sometimes blank).
- **Value:** Copy exactly as above (no extra spaces).

After saving, wait for DNS to propagate (minutes to a few hours), then in TikTok Developers click **Verify**.
