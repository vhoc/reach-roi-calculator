/**
 * PM2 process definition for the lead endpoint.
 *
 * .cjs, not .js: package.json sets "type": "module" and PM2 loads this file
 * with require().
 */
module.exports = {
  apps: [
    {
      name: "reach-calculator",
      script: "server/index.js",
      cwd: "/srv/reach-calculator",

      // Node reads the secrets itself; PM2 never holds them.
      node_args: "--env-file=/srv/reach-calculator/.env",

      // One process. The work is a single outbound POST per lead — there is
      // nothing here that needs clustering, and cluster mode would only
      // multiply the log streams.
      exec_mode: "fork",
      instances: 1,

      env: { NODE_ENV: "production" },

      autorestart: true,
      max_restarts: 10,
      min_uptime: "20s",
      max_memory_restart: "200M",

      // The Pardot handler has no field for the assessment, so these logs are
      // the only record of what each prospect calculated. Keep them readable
      // and rotate them (see pm2-logrotate in README.md).
      time: true,
      merge_logs: true,
      out_file: "/var/log/reach-calculator/out.log",
      error_file: "/var/log/reach-calculator/error.log",
    },
  ],
};
