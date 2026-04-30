# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) (or [oxc](https://oxc.rs) when used in [rolldown-vite](https://vite.dev/guide/rolldown)) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend updating the configuration to enable type-aware lint rules:

```js
export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...

      // Remove tseslint.configs.recommended and replace with this
      tseslint.configs.recommendedTypeChecked,
      // Alternatively, use this for stricter rules
      tseslint.configs.strictTypeChecked,
      // Optionally, add this for stylistic rules
      tseslint.configs.stylisticTypeChecked,

      // Other configs...
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

You can also install [eslint-plugin-react-x](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-x) and [eslint-plugin-react-dom](https://github.com/Rel1cx/eslint-react/tree/main/packages/plugins/eslint-plugin-react-dom) for React-specific lint rules:

```js
// eslint.config.js
import reactX from 'eslint-plugin-react-x'
import reactDom from 'eslint-plugin-react-dom'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      // Other configs...
      // Enable lint rules for React
      reactX.configs['recommended-typescript'],
      // Enable lint rules for React DOM
      reactDom.configs.recommended,
    ],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.node.json', './tsconfig.app.json'],
        tsconfigRootDir: import.meta.dirname,
      },
      // other options...
    },
  },
])
```

## Citizen OTP Checklist

For temporary local/demo login without SMS delivery, set `VITE_DEMO_OTP_ENABLED=true` in `apps/citizen-portal/.env.local`. To let those demo logins create real backend citizen sessions and make submitted reports visible in the police dashboard, also set `DEMO_OTP_ENABLED=true` in `services/ml/.env`. This simulated OTP path only works in non-production builds, always uses the fixed code `123456`, and must not be enabled for production deployments.

For Firebase phone OTP to work in the citizen portal without configuration errors, all of the following must be true:

- `apps/citizen-portal/.env.local` must contain all `VITE_FIREBASE_*` values for the correct Firebase web app.
- `services/ml/.env` must contain `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, and `FIREBASE_PRIVATE_KEY`.
- Firebase Authentication must have the `Phone` provider enabled.
- The Firebase project must be on the `Blaze` plan because verification SMS is not available on `Spark`.
- Google Cloud branding / consent configuration must be verified and published for phone verification.
- Firebase Authentication SMS region policy must allow `Sri Lanka (LK)`.
- The current web domain, such as `localhost`, must be listed in Firebase `Authorized domains`.
- Real-number testing can be throttled. For demo/development, add Firebase `Phone numbers for testing` and use the configured test code instead of waiting for a real SMS.
