module.exports = {
  env: {
    browser: true,
    es2021: true,
    node: true,
    jest: true
  },
  extends: [
    'eslint:recommended',
    '@eslint/js/recommended'
  ],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module'
  },
  globals: {
    require: 'writable',
    module: 'writable',
    global: 'writable',
    jest: 'writable'
  },
  rules: {
    'no-unused-vars': ['error', { 
      varsIgnorePattern: '^[A-Z_]',
      argsIgnorePattern: '^_'
    }],
    'no-undef': 'off'
  },
  overrides: [
    {
      files: ['**/*.test.js', '**/*.test.jsx'],
      env: {
        jest: true
      },
      globals: {
        global: 'writable',
        jest: 'writable',
        require: 'writable'
      },
      rules: {
        'no-undef': 'off'
      }
    },
    {
      files: ['scripts/**/*.js'],
      env: {
        node: true
      },
      globals: {
        require: 'writable',
        module: 'writable'
      },
      rules: {
        'no-undef': 'off'
      }
    }
  ]
};
