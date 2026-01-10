module.exports = {
  apps: [
    {
      name: "github-most-used-langs",
      script: "./dist/index.js",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
