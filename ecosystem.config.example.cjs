// PM2 ecosystem config — copy to ecosystem.config.cjs and fill in your values.
module.exports = {
  apps: [
    {
      name: "milady",
      script: "milady.mjs",
      args: "start",
      cwd: "/path/to/milady",
      interpreter: "node",
      node_args: "--max-old-space-size=4096",
      env: {
        NODE_ENV: "production",
        NODE_PATH: "/path/to/milady/node_modules",
        MILADY_API_BIND: "0.0.0.0",
        MILADY_API_TOKEN: "",
        MILADY_API_TOKEN_REQUIRED: "0",
        MILADY_ALLOWED_ORIGINS: "https://your-domain.example.com",
        MILADY_EXTERNAL_BASE_URL: "https://your-domain.example.com/proxy/2138",
      },
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      restart_delay: 5000,
      watch: false,
      max_memory_restart: "2G",
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      error_file: "/path/to/milady/logs/milady-error.log",
      out_file: "/path/to/milady/logs/milady-out.log",
      merge_logs: true,
    },
  ],
};
