module.exports = {
  apps: [
    {
      name:                'visitor-management-api',
      script:              'src/index.js',
      instances:           1,
      autorestart:         true,
      watch:               false,
      max_memory_restart:  '500M',
      env_production: {
        NODE_ENV:               'production',
        BYPASS_VISITING_HOURS:  'false',
      },
    },
  ],
};
