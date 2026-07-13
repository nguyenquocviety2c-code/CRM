---
Task ID: 1
Agent: Main (Z.ai Code)
Task: Download CRM repository from GitHub and run it with PM2 to maintain the app interface

Work Log:
- Cloned repository https://github.com/nguyenquocviety2c-code/CRM.git using provided API token (ghp_...) into /home/z/my-project/download/
- Explored the cloned CRM app: Next.js 16 + TypeScript + Prisma (SQLite) + Supabase + Tailwind/shadcn UI. It is a Vietnamese salon CRM ("EasySalon CRM") with modules: cashier, booking, products/services, cash cards, reports, worker manager, customer care, settings.
- Stopped the existing template dev server (next dev on port 3000).
- Moved CRM source into the main project directory: copied src/, prisma/, public/, db/ (custom.db with data), crm-data/, upload/, supabase-migrations/, skills/, agent-ctx/ from download/ to /home/z/my-project/.
- Copied config files: package.json, tsconfig.json, next.config.ts, tailwind.config.ts, postcss.config.mjs, components.json, eslint.config.mjs, prisma.config.ts, vercel.json.
- Rewrote .env with correct DATABASE_URL pointing to /home/z/my-project/db/custom.db (plus Supabase + R2 credentials from the repo).
- Rewrote ecosystem.config.cjs to point cwd, DATABASE_URL, and log paths at /home/z/my-project (was /home/z/CRM).
- Installed dependencies: `bun install` (821 packages).
- Generated Prisma client: `bunx prisma generate` -> src/generated/prisma.
- Installed PM2 globally (was missing): `npm install -g pm2` (v7.0.3).
- Created .pm2-logs directory and started the app with PM2: `pm2 start ecosystem.config.cjs`. App name: crm-app, port 3000, exec_mode fork, autorestart true.
- Saved PM2 process list: `pm2 save` (persisted to /home/z/.pm2/dump.pm2).
- Verified with agent-browser:
  * GET / -> 307 redirect to /dat-lich (booking kiosk page), title "EasySalon CRM"
  * /dat-lich renders the booking form (customer info, service/staff selectors, "Đặt lịch" button, "Đăng nhập" link)
  * /login renders the login form (username/email + password + "Đăng nhập" button)
  * Navigation between pages works
  * API endpoints all return 200: /api/supabase/services, /api/supabase/branches, /api/supabase/staff, /api/supabase/service-categories, /api/auth/me — Supabase backend is live and returning data
  * No console errors, no runtime errors
- Screenshots saved: .pm2-verify.png, .dat-lich-success.png

Stage Summary:
- CRM app is live at http://localhost:3000 (exposed via Preview Panel through the Caddy gateway on port 3000).
- PM2 process `crm-app` (id 0) is online with autorestart enabled and process list saved; PM2 will keep the UI running and auto-restart on crash.
- Root route `/` redirects to `/dat-lich` (customer booking kiosk). Staff login is via the "Đăng nhập" button -> /login.
- Data is sourced from Supabase (live backend configured in .env) and a local SQLite file (db/custom.db) for Prisma/legacy routes.
- All key files in place at /home/z/my-project: ecosystem.config.cjs, .env, prisma/schema.prisma, src/generated/prisma (generated client).
