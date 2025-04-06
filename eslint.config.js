// eslint.config.js
// Install necessary packages:
// npm install --save-dev eslint typescript-eslint @eslint/js globals

import globals from "globals";        // Provides predefined global variable sets
import pluginJs from "@eslint/js";    // ESLint's core recommended rules
import tseslint from "typescript-eslint"; // TypeScript-ESLint parser, plugin, and configs

export default tseslint.config( // Use the typescript-eslint config helper

  // 1. Global ignores
  // Files/directories to completely ignore
  {
    ignores: [
      "dist/",             // Build output
      "node_modules/",     // Dependencies
      "*.cjs",             // CommonJS config files (if any)
      "*.config.js",       // JS config files like vite.config.js, this file itself
      "coverage/",         // Test coverage reports
      "public/",           // Static assets usually not linted
      "**/combined_code.js", // Specific generated files
      "**/combined_code.txt",
    ],
  },

  // 2. ESLint Recommended Rules
  // Apply ESLint's baseline recommended rules globally
  pluginJs.configs.recommended,

  // 3. TypeScript Configuration & Recommended Rules
  {
    // Specify which files this configuration applies to
    files: ["src/**/*.ts", "src/**/*.tsx"], // Adjust if you don't use .tsx

    // Apply TypeScript recommended rules.
    // This automatically sets up the TypeScript parser and plugin.
    // `recommended` is less strict than `recommendedTypeChecked`.
    extends: [
      ...tseslint.configs.recommended,
    ],

    // Define language options specific to these TypeScript files
    languageOptions: {
      // Define available global variables (environments)
      globals: {
        ...globals.browser, // Standard browser globals (window, document, etc.)
        ...globals.es2021,  // Modern ECMAScript syntax globals
      },
      // Configure the TypeScript parser
      // While `recommended` doesn't strictly require `project`, setting it
      // is good practice and prepares for potentially adding type-aware rules later.
      parserOptions: {
        project: true, // Enable project-based linting using tsconfig.json
        tsconfigRootDir: import.meta.dirname, // Helps ESLint find tsconfig relative to this config file
      },
    },

    // Add your custom rule overrides or disable rules here
    rules: {
      // Example: Change 'no-unused-vars' to a warning and ignore args starting with _
      "@typescript-eslint/no-unused-vars": ["warn", { "argsIgnorePattern": "^_" }],
      // Example: Allow explicit 'any' (use with caution, 'warn' might be safer)
      // "@typescript-eslint/no-explicit-any": "off",
      // Example: Allow empty functions (sometimes useful for placeholders)
      // "@typescript-eslint/no-empty-function": "off",
    },
  },

  // 4. Optional: Specific configuration for Test Files
  {
    files: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    // You could add specific rules or environment settings for tests here
    // For example, if you weren't using Vitest globals via tsconfig/vite config:
    // languageOptions: {
    //   globals: {
    //     'vi': 'readonly',
    //     'describe': 'readonly',
    //     'it': 'readonly',
    //     'expect': 'readonly',
    //     'beforeEach': 'readonly',
    //   }
    // },
    rules: {
      // Example: Allow potentially more complex functions in tests
      // "complexity": "off",
    }
  }

  // 5. Optional: Prettier Integration (if you use Prettier for formatting)
  // - Run `npm install --save-dev eslint-config-prettier`
  // - Add the config LAST in the array to disable conflicting ESLint rules.
  // import eslintConfigPrettier from "eslint-config-prettier";
  // eslintConfigPrettier, // Uncomment this line and the import above
);