# SurrealDB + Better Auth Example

This example is a reference for building integration tests for the `surreal-better-auth` adapter. It is not production code, nor best practices example.

> [!CAUTION]
> This code logs sensitive data, which is a security risk. In a real world app, you must remove or replace this logging with a secure solution.

## Tech Stack

- **Framework**: SvelteKit with Svelte 5
- **Database**: SurrealDB
- **Authentication**: Better Auth with `surreal-better-auth` adapter
- **Testing**: Playwright for E2E tests

## Quick Start

### Prerequisites

1. **SurrealDB**: Install and start SurrealDB

   ```bash
   # Install SurrealDB
   curl -sSf https://install.surrealdb.com | sh

   # Start SurrealDB
   surreal start --log info --user root --pass root memory
   ```

2. **Dependencies**: Install dependencies from the monorepo root
   ```bash
   # From monorepo root
   bun install
   bun run build  # Build the adapter package
   ```

### Development

Start the development server:

```bash
# From examples/sk directory
bun run dev
# or
bun run dev:adapter  # Rebuilds adapter and starts dev server
```

The app will be available at `http://localhost:3000`

### Schema Management

The database schema is automatically managed:

```bash
# Generate schema manually (creates schema.surql)
bun run create:schema

# Schema is automatically loaded/generated during tests
# No manual schema setup required for testing
```

### Building

To create a production build:

```bash
bun run build
```

Preview the production build:

```bash
bun run preview
```

## Testing

This example includes comprehensive integration tests using Playwright.

### Running Tests

```bash
# Run integration tests
bun run test:integration

# Run all tests
bun run test:all

# Run adapter tests
bun run test:adapter

```

### Test Setup

1. Install Playwright browsers:

   ```bash
   bunx playwright install
   ```

2. Make sure SurrealDB is running (see prerequisites above)

3. **Schema Management**: The test setup automatically handles database schema:
   - If `schema.surql` exists, it loads the schema from file
   - If not found, it automatically generates schema using `bunx @better-auth/cli generate --yes`
   - You can manually generate schema anytime: `bun run create:schema`

4. Run tests:
   ```bash
   bun run test:all
   ```
