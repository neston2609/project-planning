/**
 * PM2 process file. Run from the project root:
 *   pm2 start deploy/ecosystem.config.cjs --env production
 *   pm2 save                # remember on reboot
 *   pm2 startup             # follow the printed instructions
 */
module.exports = {
    apps: [
        {
            name: 'rpa-planning-backend',
            cwd:  './backend',
            script: 'src/server.js',
            instances: 1,
            exec_mode: 'fork',
            watch: false,
            max_memory_restart: '512M',
            // Forward stdout/stderr to PM2's log files (~/.pm2/logs/...).
            out_file:   './logs/backend.out.log',
            error_file: './logs/backend.err.log',
            merge_logs: true,
            // dotenv inside server.js still loads backend/.env.
            env_production: {
                NODE_ENV: 'production'
            }
        }
    ]
};
