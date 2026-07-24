module.exports = {
  apps: [
    {
      name: "crm-app",
      cwd: "/home/z/CRM",
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
        // Explicitly override any shell-level DATABASE_URL so the app always
        // reads the data-rich SQLite file shipped with the repo.
        DATABASE_URL: "file:/home/z/CRM/db/custom.db",
      },
      error_file: "/home/z/CRM/.pm2-logs/crm-error.log",
      out_file: "/home/z/CRM/.pm2-logs/crm-out.log",
      merge_logs: true,
      time: true,
    },
  ],
};
