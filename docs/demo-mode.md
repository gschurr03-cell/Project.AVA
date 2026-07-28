# Local demo workflow

Demo mode is local-only and never bypasses production authentication.

1. Start local Supabase and copy its values into `.env.local`.
2. Run `npm run dev:seed` for the fixed local demo user and athlete.
3. Start the web app with `npm run dev`.
4. Sign in through the normal login page.
5. Upload or open a seeded session.
6. Start `npm run worker:analysis`.
7. Review the working result, Timing Workspace, saved version, and reset workflow.

Production builds have no demo-auth flag. Service-role and worker credentials remain
server-only.
