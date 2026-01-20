module.exports = {
  apps: [
    {
      name: 'gpteach-backend',
      cwd: './server',
      script: 'server.js',
      env: {
        NODE_OPTIONS: '--openssl-legacy-provider'
      }
    },
    {
      name: 'gpteach-frontend',
      script: 'serve',
      args: '-s build -l 3000',
      env: {
        NODE_OPTIONS: '--openssl-legacy-provider'
      }
    }
  ]
};