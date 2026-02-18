# Auth Guard Quick Checks

1. Start app:
```bash
npm run dev
```

2. In a logged-out/incognito session, deep-link protected pages and verify redirect to `/`:
```bash
curl -I http://localhost:3001/dashboard
curl -I http://localhost:3001/signals
curl -I http://localhost:3001/forecaster
curl -I http://localhost:3001/trading-zone
```
Expected: `Location: /?redirect=...`

3. In logged-out session, call protected APIs and verify deny:
```bash
curl -i http://localhost:3001/api/signals
curl -i http://localhost:3001/api/eia/storage
curl -i http://localhost:3001/api/profile
```
Expected: `401` with `{"error":"Unauthorized"}`.

4. Log in, then verify protected pages load and APIs return data:
```bash
curl -i http://localhost:3001/api/signals
curl -i http://localhost:3001/api/profile
```
Expected: non-401 responses with JSON payload.

5. Log out and retry step 2 and step 3.
Expected: redirects and `401` return immediately again.
