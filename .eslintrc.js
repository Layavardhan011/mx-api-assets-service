module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: 'tsconfig.json',
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint/eslint-plugin', 'boundaries'],
  extends: [
    'plugin:@typescript-eslint/recommended',
    // 'plugin:prettier/recommended',
    'plugin:boundaries/strict',
  ],
  root: true,
  env: {
    node: true,
    jest: true,
  },
  settings: {
    "import/resolver": {
      typescript: {
        alwaysTryTypes: true,
        project: 'tsconfig.json'
      },
    },
    'boundaries/elements': [
      {
        type: 'apps/api',
        pattern: 'apps/api',
      },
      {
        type: 'apps/cache-warmer',
        pattern: 'apps/cache-warmer',
      },
      {
        type: 'apps/queue-worker',
        pattern: 'apps/queue-worker',
      },
      {
        type: 'apps/transactions-processor',
        pattern: 'apps/transactions-processor',
      },
      {
        type: 'libs/common',
        pattern: 'libs/common'
      },
      {
        type: 'libs/database',
        pattern: 'libs/database'
      },
      {
        type: 'libs/entities',
        pattern: 'libs/entities'
      },
      {
        type: 'libs/services',
        pattern: 'libs/services'
      },
      {
        type: 'test',
        pattern: 'test'
      },
    ]
  },
  rules: {
    "@typescript-eslint/no-explicit-any": ["off"],
    "@typescript-eslint/no-unused-vars": ["off"],
    "@typescript-eslint/ban-ts-comment": ["off"],
    "@typescript-eslint/no-empty-function": ["off"],
    "@typescript-eslint/ban-types": ["off"],
    "@typescript-eslint/no-var-requires": ["off"],
    "@typescript-eslint/no-inferrable-types": ["off"],
    "require-await": ["error"],
    "@typescript-eslint/no-floating-promises": ["error"],
    "max-len": ["off"],
    "semi": ["error"],
    "comma-dangle": ["error", "always-multiline"],
    "eol-last": ["error"],
    'no-restricted-imports': ['error', {
      patterns: ['libs/*', 'apps/*', '**/apps', '**/libs'],
    }],
    "boundaries/dependencies": ["error", {
      default: 'disallow',
      rules: [
        {
          from: { type: 'apps/api' },
          allow: [
            { to: { type: 'libs/common' } },
            { to: { type: 'libs/entities' } },
            { to: { type: 'libs/services' } }
          ]
        },
        {
          from: { type: 'apps/cache-warmer' },
          allow: [
            { to: { type: 'libs/common' } },
            { to: { type: 'libs/entities' } },
            { to: { type: 'libs/services' } }
          ]
        },
        {
          from: { type: 'apps/queue-worker' },
          allow: [
            { to: { type: 'libs/common' } },
            { to: { type: 'libs/entities' } },
            { to: { type: 'libs/services' } }
          ]
        },
        {
          from: { type: 'apps/transactions-processor' },
          allow: [
            { to: { type: 'libs/common' } },
            { to: { type: 'libs/entities' } },
            { to: { type: 'libs/services' } }
          ]
        },
        {
          from: { type: 'libs/database' },
          allow: [
            { to: { type: 'libs/common' } },
            { to: { type: 'libs/entities' } }
          ]
        },
        {
          from: { type: 'libs/services' },
          allow: [
            { to: { type: 'libs/common' } },
            { to: { type: 'libs/entities' } },
            { to: { type: 'libs/database' } }
          ]
        },
        {
          from: { type: 'libs/common' },
          allow: [
            { to: { type: 'libs/entities' } }
          ]
        },
        {
          from: { type: 'test' },
          allow: [
            { to: { type: 'apps/api' } },
            { to: { type: 'apps/cache-warmer' } },
            { to: { type: 'apps/queue-worker' } },
            { to: { type: 'apps/transactions-processor' } },
            { to: { type: 'libs/common' } },
            { to: { type: 'libs/entities' } },
            { to: { type: 'libs/services' } },
            { to: { type: 'libs/database' } }
          ]
        }
      ]
    }],
    'boundaries/no-unknown': [2],
    'boundaries/no-unknown-files': [2]
  },
  ignorePatterns: ['.eslintrc.js'],
  "overrides": [
    {
      "files": ["test/**/*.ts"],
      "rules": {
        "no-restricted-imports": ["off"]
      }
    },
    {
      "files": ["libs/common/**/*.ts"],
      "rules": {
        "no-restricted-imports": ["error", {
          "patterns": ["@libs/common*"]
        }]
      }
    },
    {
      "files": ["libs/database/**/*.ts"],
      "rules": {
        "no-restricted-imports": ["error", {
          "patterns": ["@libs/database*"]
        }]
      }
    },
    {
      "files": ["libs/entities/**/*.ts"],
      "rules": {
        "no-restricted-imports": ["error", {
          "patterns": ["@libs/entities*"]
        }]
      }
    },
    {
      "files": ["libs/services/**/*.ts"],
      "rules": {
        "no-restricted-imports": ["error", {
          "patterns": ["@libs/services*"]
        }]
      }
    }
  ]
};
