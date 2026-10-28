// PM2 process for the API. Keep a single instance: the daily reminder scheduler runs inside it.
const path = require('path');

module.exports = {
  apps: [
    {
      name: 'atigi-api',
      cwd: path.join(__dirname, '..', 'apps', 'api'),
      script: 'dist/index.js',
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '300M',
      time: true,
    },
  ],
};
