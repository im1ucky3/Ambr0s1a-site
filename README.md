<p align="center">
  <img src="public/ambr0s1a-logo.jpg" alt="Ambr0s1a! logo" width="420">
</p>

<h1 align="center">Ambr0s1a! Team Hub</h1>

A workspace and public information portal for the Ambr0s1a! CTF team. It provides isolated competition workspaces, task tracking, team roles, notifications, archived statistics, CTFtime data, and CTFd integration.

## Features

- Team accounts powered by Supabase Auth with captain-managed invitations
- Multiple simultaneous CTF workspaces with freeze and archive controls
- Customizable personal dashboards and widgets
- Active, solved, unsolved, and retryable task tracking
- CTFd challenge, category, score, and solve synchronization
- Category filters and one-click challenge claiming
- CTFtime upcoming events, past events, and leaderboards
- Notifications and date/time display in `Europe/Kyiv`
- Archived CTF statistics and report generation

## Configuration

Requires Node.js `>=22.13.0`, Cloudflare D1/R2, and a Supabase project. Copy `.env.example` to a local `.env` file and configure:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_PUBLISHABLE_KEY=your-publishable-key
SUPABASE_SECRET_KEY=your-server-only-secret-key
CTFD_TOKEN_SECRET=optional-separate-secret-for-encrypting-ctfd-tokens
```

`SUPABASE_SECRET_KEY` and `CTFD_TOKEN_SECRET` are server-side secrets. Never commit a local `.env` file. If `CTFD_TOKEN_SECRET` is not set, the Supabase server key is used to encrypt stored CTFd tokens.

## CTFd integration

1. The captain opens the required CTF workspace.
2. In the CTFd panel, they enter the instance HTTPS URL and an API token.
3. The site imports all available challenges, categories, points, solve counts, and team status.
4. **Synchronize** refreshes the data, while **Disconnect** removes the integration and encrypted token.

CTFd API tokens are encrypted on the server and are never returned to the browser.

## Development

```bash
npm run install:ci
npm run dev
npm run lint
npm test
npm run db:generate
```

The D1 schema is located in `db/schema.ts`, and database migrations are stored in `drizzle/`.
