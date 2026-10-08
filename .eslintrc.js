module.exports = {
  root: true,
  extends: ['expo', 'prettier'],
  ignorePatterns: ['node_modules/', '.expo/', 'android/', 'dist/'],
  overrides: [
    {
      files: ['tests/**/*.js'],
      env: { node: true },
      rules: {
        'no-unused-vars': 'warn',
      },
    },
  ],
};
