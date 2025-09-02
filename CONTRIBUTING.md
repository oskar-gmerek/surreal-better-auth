# Contributing Guide

## ⚠️ Important Guidelines

**Please read this carefully before contributing to avoid rejected PRs:**

### 🎯 Focused Pull Requests Only
- **One issue = One PR**: Each pull request should address exactly one specific issue or feature
- **No bundled changes**: Don't fix multiple unrelated things in a single PR
- **No refactoring alongside features**: Keep refactoring separate from feature additions
- **Stay on topic**: If you want to fix a bug, only fix that bug - nothing else

### 💬 Issue First, Code Second
- **Create an issue first** for any non-trivial changes
- **Explain your reasoning**: Why is this change needed? What problem does it solve?
- **Wait for discussion**: Get feedback before starting work on significant changes
- **Small fixes**: Typos and obvious bugs can skip the issue step

### 🔒 Adapter Scope Limitations
This adapter has a **very specific scope** - it implements the better-auth adapter interface for SurrealDB, nothing more:

- ✅ **Allowed**: SurrealDB-specific optimizations (e.g., direct record operations instead of WHERE clauses)
- ❌ **Not allowed**: Managing SurrealDB instances (developers handle this themselves)
- ❌ **Not allowed**: Features that can be solved with better-auth config, hooks, or plugins
- ❌ **Not allowed**: Features beyond the official better-auth adapter specification

### 💡 Alternative Solutions
Instead of expanding the adapter, consider:
- **better-auth configuration** for auth-related features
- **better-auth hooks/plugins** for custom behavior
- **Examples folder** to show how to achieve complex setups
- **Your own wrapper** around this adapter for project-specific needs

## 🚀 Getting Started

### Fork & Clone
```bash
# Fork the repo on GitHub, then:
git clone https://github.com/YOUR-USERNAME/surreal-better-auth.git
cd surreal-better-auth
bun run setup

# Create a new branch for your changes
git checkout -b feature/your-feature-name
# or for bug fixes:
git checkout -b fix/issue-description
```

## 🔄 Development Workflow

1. **Make changes** in `packages/surreal-better-auth/src/`
2. **Build**: `bun run build`
3. **Test**: `bun run test:adapter`
4. **Check example**: `bun run dev` (visit http://localhost:3000)

## 🧪 Testing

```bash
# Run all adapter tests
bun run test:adapter

# Run specific test file
bun vitest packages/surreal-better-auth/tests/adapter.test.ts
```

## 📦 Package Structure

```
packages/surreal-better-auth/
├── src/
│   ├── index.ts           # Main exports
│   ├── surreal-adapter.ts # Core adapter logic
│   ├── helpers.ts         # Utility functions
│   └── types.ts           # TypeScript types
├── tests/                 # Test files
├── dist/                  # Built files (auto-generated)
└── package.json
```

## 🔧 Build System

- **tsup** for building (ESM + CJS + types)
- **TypeScript** with strict mode
- **Vitest** for testing
- **Bun** for package management

## 📝 Code Style

- Use TypeScript strict mode
- Add JSDoc comments for public APIs and helper functions
- Write tests for new features
- Follow existing code patterns

## 🐛 Reporting Issues

1. **Check existing issues** first to avoid duplicates
2. **Provide minimal reproduction** case with code
3. **Include versions**: SurrealDB, better-auth, and Node.js/Bun versions
4. **Add error messages** and relevant logs
5. **Describe expected vs actual** behavior

## 💡 Feature Requests

**⚠️ Most feature requests will be rejected** - this adapter has a very narrow scope.

Before requesting features:
1. **Check if it belongs here**: Can this be solved with better-auth config/hooks/plugins?
2. **Open an issue first**: Explain the use case and why it can't be solved elsewhere
3. **Consider examples**: Would an example in the `/examples` folder be better?
4. **Be specific**: Vague requests like "add more features" will be closed

## 🔄 Pull Request Process

1. **Fork** the repository (don't clone directly)
2. **Create issue** first (unless it's a tiny fix)
3. **Create branch** from `main`: `git checkout -b fix/specific-issue`
4. **Make focused changes** addressing only one issue
5. **Test thoroughly**: `bun run test:all`
6. **Update docs** if needed
7. **Submit PR** with clear description linking to the issue

## 📄 License

By contributing, you agree that your contributions will be licensed under the MIT License.