# Validation Matrix

Platform-specific validation commands for different tech stacks.

---

## Web Frameworks

### Next.js (App Router / Pages Router)

| Check | Command | Notes |
|-------|---------|-------|
| Lint | `pnpm lint` | ESLint with Next.js config |
| TypeCheck | `pnpm typecheck` or `tsc --noEmit` | Strict mode recommended |
| Test | `pnpm test` | Jest or Vitest |
| Build | `pnpm build` | Production build |
| E2E | `pnpm e2e` or `npx playwright test` | Playwright recommended |
| Visual | Browser MCP | Use browser tools for verification |

**Dev Server**: `pnpm dev` (default: http://localhost:3000)

### React (Vite)

| Check | Command | Notes |
|-------|---------|-------|
| Lint | `pnpm lint` | ESLint + Prettier |
| TypeCheck | `tsc --noEmit` | Or `tsc -b` for project refs |
| Test | `pnpm test` | Vitest |
| Build | `pnpm build` | Vite production build |
| E2E | `pnpm e2e` | Playwright |
| Visual | Browser MCP | Navigate to dev server |

**Dev Server**: `pnpm dev` (default: http://localhost:5173)

### Vue / Nuxt

| Check | Command | Notes |
|-------|---------|-------|
| Lint | `pnpm lint` | ESLint with Vue plugin |
| TypeCheck | `vue-tsc --noEmit` | Vue-specific TS check |
| Test | `pnpm test` | Vitest |
| Build | `pnpm build` | Nuxt/Vite build |
| E2E | `pnpm e2e` | Playwright or Cypress |

---

## Mobile Frameworks

### React Native (Expo)

| Check | Command | Notes |
|-------|---------|-------|
| Lint | `npx eslint .` | ESLint |
| TypeCheck | `npx tsc --noEmit` | TypeScript check |
| Test | `npm test` | Jest with React Native preset |
| Build | `npx expo build` or `eas build` | EAS Build recommended |
| Visual | iOS Simulator MCP | Use simulator tools |

**Dev Server**: `npx expo start`

### React Native (Bare)

| Check | Command | Notes |
|-------|---------|-------|
| Lint | `npx eslint .` | ESLint |
| TypeCheck | `npx tsc --noEmit` | TypeScript check |
| Test | `npm test` | Jest |
| iOS Build | `npx react-native run-ios` | Xcode required |
| Android Build | `npx react-native run-android` | Android Studio required |
| Visual | iOS Simulator MCP | Use simulator tools |

---

## Desktop Frameworks

### Electron

| Check | Command | Notes |
|-------|---------|-------|
| Lint | `npm run lint` | ESLint |
| TypeCheck | `tsc --noEmit` | TypeScript check |
| Test | `npm test` | Jest or Mocha |
| Build | `npm run build` | Webpack/Vite bundle |
| Package | `npm run package` | electron-builder |
| Visual | Electron MCP | Use Electron tools |

**Dev**: `npm run start` or `electron .`

### Tauri

| Check | Command | Notes |
|-------|---------|-------|
| Lint (FE) | `pnpm lint` | ESLint for frontend |
| Lint (BE) | `cargo clippy` | Rust linter |
| TypeCheck | `tsc --noEmit` | Frontend TypeScript |
| Test (FE) | `pnpm test` | Vitest/Jest |
| Test (BE) | `cargo test` | Rust tests |
| Build | `pnpm tauri build` | Full build |

---

## Backend Frameworks

### Express / Fastify / Hono

| Check | Command | Notes |
|-------|---------|-------|
| Lint | `npm run lint` | ESLint |
| TypeCheck | `tsc --noEmit` | TypeScript check |
| Test | `npm test` | Jest or Vitest |
| Build | `npm run build` | TypeScript compile |

### NestJS

| Check | Command | Notes |
|-------|---------|-------|
| Lint | `npm run lint` | ESLint with Nest config |
| TypeCheck | `tsc --noEmit` | Strict mode |
| Test (Unit) | `npm run test` | Jest |
| Test (E2E) | `npm run test:e2e` | Integration tests |
| Build | `npm run build` | Nest build |

### Python (FastAPI / Django)

| Check | Command | Notes |
|-------|---------|-------|
| Lint | `ruff check .` or `flake8` | Python linter |
| Format | `ruff format .` or `black .` | Formatter |
| TypeCheck | `mypy .` or `pyright` | Type checking |
| Test | `pytest` | Python tests |

---

## Visual Verification MCP Tools

### Browser Extension (Web)

```
# Navigate
browser_navigate(url="http://localhost:3000")

# Take screenshot
browser_take_screenshot

# Check for console errors
browser_console
```

### iOS Simulator (Mobile)

```
# Get booted simulator
ios_simulator_list

# Open simulator
ios_simulator_open

# Take screenshot
ios_simulator_screenshot

# Interact
ios_simulator_tap(x=100, y=200)
ios_simulator_type(text="Hello")
```

### Electron (Desktop)

```
# List windows
electron_list_windows

# Take screenshot
electron_take_screenshot

# Get window info
electron_get_window_info

# Read logs
electron_read_logs
```

---

## Validation Order

### Recommended Sequence

```
1. Parallel (independent):
   ├── Lint
   └── TypeCheck

2. Sequential (dependent):
   └── Test
       └── Build (if tests pass)
           └── E2E (if build succeeds)
               └── Visual (if E2E passes)
```

### Quick Validation (Development)

```bash
# Just the essentials
pnpm lint && pnpm typecheck && pnpm test
```

### Full Validation (Pre-commit)

```bash
# Complete pipeline
pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm e2e
```

---

## Common Issues

### Lint Failures

| Error | Likely Cause | Fix |
|-------|--------------|-----|
| `no-unused-vars` | Declared but not used | Remove or use |
| `@typescript-eslint/no-explicit-any` | Using `any` type | Add proper types |
| `import/order` | Wrong import order | Auto-fix: `eslint --fix` |

### TypeCheck Failures

| Error | Likely Cause | Fix |
|-------|--------------|-----|
| `TS2345` | Type mismatch | Check types match |
| `TS2322` | Wrong assignment | Check return type |
| `TS7006` | Missing type | Add type annotation |

### Test Failures

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| Timeout | Async not awaited | Add `await` |
| Undefined | Missing mock | Set up mock data |
| Snapshot fail | UI changed | Update snapshot |
