# FSL Operations Concierge

Node 20+ server with no build step. `server.mjs` is the source of truth. It serves `index.html` (worker workspace), `admin.html` (admin console) and `assessment.html` (workflow assessment).

```bash
npm start   # node server.mjs
```

## History

Until v3.1.0 the app was assembled at boot. `launcher-v3.mjs` stitched `ui/*.html` and `*-routes.txt` fragments into `server-v3.mjs`, and five `*-patch.mjs` scripts rewrote those fragments by string replacement. v3.1.0 bakes that output into these files once. The baked server matches the previous runtime build except for the two HTML file names it loads. The UI and admin HTML are byte-identical.

Edit these files directly. Do not reintroduce runtime patches.

## Environment

Required: `SUPABASE_URL`, `SUPABASE_KEY`, `APP_USERNAME`, `APP_PASSWORD`, `WORKSPACE_TOKEN`

AI and decisions: `OPENAI_API_KEY`, `OPENAI_MODEL`, `JEV_API_KEY`, `JEV_MODEL`

Mail sources: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `OAUTH_TOKEN_SECRET`, `COMPOSIO_API_KEY`, `SOURCE_SYNC_INTERVAL_MS`

Invites: `RESEND_API_KEY`, `INVITE_FROM_EMAIL`, `PUBLIC_APP_URL`

Other: `ASSESSMENT_WEBHOOK_SECRET`, `PORT`
