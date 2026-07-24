module.exports = {
  apps: [
    {
      name: "crm-app",
      // The CRM project lives here (cloned from GitHub).
      cwd: "/home/z/my-project/download/CRM",
      // Run the Next.js dev server (Turbopack). No production build required,
      // which keeps startup fast and reliable. PM2 keeps the process alive
      // and auto-restarts it if it ever crashes.
      script: "node_modules/next/dist/bin/next",
      args: "dev -p 3000",
      interpreter: "node",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "development",
        NEXT_TELEMETRY_DISABLED: "1",
        PORT: "3000",
        // Supabase — primary data store
        NEXT_PUBLIC_SUPABASE_URL: "https://itatgyopxsiiurdjmtmy.supabase.co",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml0YXRneW9weHNpaXVyZGptdG15Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI0ODQxMjgsImV4cCI6MjA5ODA2MDEyOH0.k5VV1L3j6Y2ZVdXdmpYOEZ39kIHRaHneCqLNWMrPQoM",
        SUPABASE_SERVICE_ROLE_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml0YXRneW9weHNpaXVyZGptdG15Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MjQ4NDEyOCwiZXhwIjoyMDk4MDYwMTI4fQ.cVZCdj1NVQs7s6HvseWY8vdyZGOQAT1nT5SLJZhDRsA",
        // Cloudflare R2 — image/file storage
        R2_ACCOUNT_ID: "c1d3b24c7fbd0e873a0dd3b3e85b80db",
        R2_ACCESS_KEY_ID: "348b6c98e9ebdbf44996bebee72a275b",
        R2_SECRET_ACCESS_KEY: "f4f2b3d211a0a3d06e944822b468590953830bd6d233bc014c3fed0fe7876fe3",
        R2_BUCKET_NAME: "manup-crm",
        R2_PUBLIC_URL: "https://pub-ec79af41a5e447858ff5ee3d6363641a.r2.dev",
        R2_S3_ENDPOINT: "https://c1d3b24c7fbd0e873a0dd3b3e85b80db.r2.cloudflarestorage.com",
        // SQLite — local fallback
        DATABASE_URL: "file:/home/z/my-project/download/CRM/db/custom.db",
      },
      error_file: "/home/z/my-project/download/CRM/.pm2-logs/crm-error.log",
      out_file: "/home/z/my-project/download/CRM/.pm2-logs/crm-out.log",
      merge_logs: true,
      time: true,
    },
  ],
};
