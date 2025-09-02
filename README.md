  <picture align="center">
    <source srcset="./hero.webp" media="(prefers-color-scheme: dark)">
    <source srcset="./hero-white.webp" media="(prefers-color-scheme: light)">
    <img src="./banner.png" alt="Better Auth Logo">
  </picture>


<h1 style="margin-top:40px;"> 🔐 SurrealDB Adapter for Better Auth </h1>

![GitHub Created At](https://img.shields.io/github/created-at/oskar-gmerek/surreal-better-auth?style=for-the-badge&color=%233ca916)
![NPM Last Update](https://img.shields.io/npm/last-update/surreal-better-auth?style=for-the-badge&color=%233ca916)
![NPM Version](https://img.shields.io/npm/v/surreal-better-auth?style=for-the-badge&color=%233ca916)
![NPM Unpacked Size](https://img.shields.io/npm/unpacked-size/surreal-better-auth?style=for-the-badge&color=%233ca916)
![NPM Downloads](https://img.shields.io/npm/dy/surreal-better-auth?style=for-the-badge&color=%233ca916)
![NPM License](https://img.shields.io/npm/l/surreal-better-auth?style=for-the-badge&color=%233ca916)
[![Sponsor](https://img.shields.io/badge/sponsor-💖-ff69b4?style=for-the-badge&color=%23ffbdbd)](https://github.com/sponsors/oskar-gmerek)

**The unofficial [SurrealDB](https://app.surrealdb.com/referral?code=4pn5aba943lpbn8l) adapter for [better-auth](https://better-auth.com)** - bringing the power of the multi-model database to your authentication system.

This adapter seamlessly integrates SurrealDB's advanced querying capabilities with better-auth's comprehensive authentication features, giving you a robust, scalable, and developer-friendly auth solution.

> [!NOTE]  
>  🎁 **New to SurrealDB?** [Sign up with our referral link](https://app.surrealdb.com/referral?code=4pn5aba943lpbn8l) and get **free cloud hosting** plus a **special welcome discount** to kickstart your project!

---

## ✨ Features

- 🚀 **Full better-auth compatibility** - Works with all better-auth features and plugins
- 🔄 **Optimized for SurrealDB** - Uses direct record operations for maximum performance
- 🎯 **Smart record links** - Uses record links instead of raw string wherever possible
- 📋 **Schema generation support** - Works with Better Auth CLI, include support for official and unofficial plugins
- 🔍 **Generating Indexes** - Creates necessary database indexes out of the box
- 🆔 **Flexible ID formats** - Supports multiple ID generation strategies, full flexibility
- 🌐 **Multi-format support** - ESM and CommonJS builds included
- ⚡ **Lightweight** - Optimized bundle size
- 📦 **No extra bloat** - This is a pure adapter. It has no direct dependencies and uses the `better-auth` and `surrealdb` you've already installed, giving you full control.

---

## ⭐ Show Your Support

If this adapter helps your project, please consider:

- ⭐ **Starring the project** - It helps others discover this adapter
  [![GitHub stars](https://img.shields.io/github/stars/oskar-gmerek/surreal-better-auth?style=social)](https://github.com/oskar-gmerek/surreal-better-auth)
- 💖 **[Sponsoring the development](https://github.com/sponsors/oskar-gmerek)** - Even small contributions help maintain and improve the project
  [![Sponsor](https://img.shields.io/badge/sponsor-💖-ff69b4)](https://github.com/sponsors/oskar-gmerek)

Your support helps us maintain and improve this adapter for the entire community.

---

## 📋 Requirements

- **Node.js**: >= 20.0.0 or **Bun**: >= 1.2.0
- **better-auth**: ^1.3.7
- **surrealdb**: ^1.3.2

---

## 🚀 Installation

```bash
bun add surreal-better-auth
```

```bash
# Using other package managers
npm install surreal-better-auth
yarn add surreal-better-auth
pnpm add surreal-better-auth
```

---

## ⚙️ Configuration

### Adapter Options

| Option           | Type                                                                                                                                                   | Default     | Description                                         |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------- | --------------------------------------------------- |
| `debugLogs`      | `boolean`                                                                                                                                              | `false`     | Enable detailed logging for debugging               |
| `idGenerator`    | `sdk.UUIDv4` \| `sdk.UUIDv7` \| `surreal` \| `surreal.ULID` \| `surreal.UUID` \| `surreal.UUIDv4` \| `surreal.UUIDv7` \| `surreal.guid` \| `undefined` | `undefined` | ID generation strategy (see ID Configuration below) |
| `usePlural`      | `boolean`                                                                                                                                              | `false`     | Use plural table names (e.g., `users` vs `user`)    |
| `allowPassingId` | `boolean`                                                                                                                                              | `false`     | Allow passing custom IDs when creating records      |

### ID Configuration Options

You can configure ID generation in two ways:

#### 1. Via Adapter Configuration

| `idGenerator` Value | Generated By | Description                                                                  |
| ------------------- | ------------ | ---------------------------------------------------------------------------- |
| `"sdk.UUIDv4"`      | Better Auth  | Better Auth generates UUID via SurrealDB JS SDK function `Uuid.v4()`         |
| `"sdk.UUIDv7"`      | Better Auth  | Better Auth generates UUID via SurrealDB JS SDK function `Uuid.v7()`         |
| `"surreal"`         | Database     | SurrealDB generates `default` SurrealDB ID                                   |
| `"surreal.guid"`    | Database     | SurrealDB generates 20 digit alphanumeric `GUID`                             |
| `"surreal.ULID"`    | Database     | SurrealDB generates `ULID`                                                   |
| `"surreal.UUID"`    | Database     | SurrealDB generates default version `UUID` (currently v7)                |
| `"surreal.UUIDv4"`  | Database     | SurrealDB generates `UUID v4` (random-based, most common)                    |
| `"surreal.UUIDv7"`  | Database     | SurrealDB generates `UUID v7` (time-based, sortable)                         |
| `undefined`         | Better Auth  | Better Auth generates ID (`default`, or generated via `generateId` function) |

#### 2. Via Better-Auth Advanced Configuration

```typescript
// lib/auth.ts
export const auth = betterAuth({
  database: surrealAdapter(db, {
    idGenerator: "surreal.UUIDv4", // This will be ignored, when generateId is provided!
  }),
  advanced: {
    database: {
      generateId() {
        return "custom_" + Math.random().toString(36).substr(2, 9);
      },
    },
  },
});
```

### ID Generation Precedence

The ID generation follows this priority order:

1. **`advanced.database.generateId()`** - Highest priority, overrides everything
2. **`idGenerator`** - Used only if `generateId()` is not defined
3. **Custom ID from data** - Used if `allowPassingId` is `true` and ID is provided in the data
4. **Better Auth default** - Used if `allowPassingId` is `true` and ID is NOT provided in the data
5. **Database default ID** - Used as fallback when all above conditions are not met, database generates default ID (same as setting `idGenerator: 'surreal'`)

---

## 🏃‍♂️ Quick Start

### 1. Set up your SurrealDB connection

```typescript
// lib/db.ts
import Surreal from "surrealdb";

const db = new Surreal();
await db.connect("ws://localhost:8000");
await db.use({ namespace: "production", database: "myapp" });

export { db };
```

### 2. Configure better-auth with the SurrealDB adapter

```typescript
// lib/auth.ts
import { betterAuth } from "better-auth";
import { surrealAdapter } from "surreal-better-auth";
import { db } from "./db";

export const auth = betterAuth({
  database: surrealAdapter(db),
  emailAndPassword: {
    enabled: true,
  },
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    },
  },
});
```

### 3. Use in your application

Example for [SvelteKit](https://svelte.dev/)

```typescript
// src/hooks.server.ts
import { auth } from "$lib/auth";
import { svelteKitHandler } from "better-auth/svelte-kit";
import { building } from "$app/environment";

export const handle: Handle = async ({ event, resolve }) => {
  return svelteKitHandler({ event, resolve, auth, building });
};
```

```typescript
// src/lib/auth-client.ts
import { createAuthClient } from "better-auth/client";

export const authClient = createAuthClient({
  baseURL: "http://localhost:5173", // Your app URL
});
```

```typescript
// src/routes/+page.svelte
<script lang="ts">
  import { authClient } from "$lib/client";
  const session = authClient.useSession();
</script>

    <div>
      {#if $session.data}
        <div>
          <p>
            {$session?.data?.user.name}
          </p>
          <button
            onclick={async () => {
              await authClient.signOut();
            }}
          >
            Sign Out
          </button>
        </div>
      {:else}
        <button
          onclick={async () => {
            await authClient.signIn.social({
              provider: "github",
            });
          }}
        >
          Continue with GitHub
        </button>
      {/if}
    </div>
```

---

## 🔧 Advanced Configuration

```typescript
// lib/auth.ts
import { betterAuth } from "better-auth";
import { surrealdbAdapter } from "surreal-better-auth";
import { db } from "./db";

export const auth = betterAuth({
  database: surrealdbAdapter(db, {
    // Enable debug logging
    debugLogs: true,
    // Let SurrealDB generate ULID
    idGenerator: "surreal.ULID",
    // Use singular table names
    usePlural: false,
    // Allow passing custom IDs
    allowPassingId: true,
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
  },
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
    },
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  },
  plugins: [
    // Add any better-auth plugins here and configure them as usual.
  ],
});
```
---

## 🧪 Development & Testing

This monorepo includes comprehensive testing to ensure the adapter works reliably:

### Quick Commands
```bash
# Install dependencies
bun install

# Build the adapter
bun run build

# Run adapter unit tests
bun run test:adapter

# Run integration tests (requires SurrealDB)
bun run test:integration

# Run all tests
bun run test:all

# Start example app
bun run dev
```

## 📄 Adapter License

`surreal-better-auth` package - MIT License - see [LICENSE](./packages/surreal-better-auth/LICENSE) for details.

---

## 🔗 Links

- 📖 [better-auth Documentation](https://www.better-auth.com/docs/installation)
- 🗄️ [SurrealDB Documentation](https://surrealdb.com/docs/surrealdb)
- 🌟 [Try SurrealDB Cloud](https://app.surrealdb.com/referral?code=4pn5aba943lpbn8l) (Free tier + welcome bonus!)
- 🐙 [GitHub Repository](https://github.com/oskar-gmerek/surreal-better-auth)
- 📦 [NPM Package](https://www.npmjs.com/package/surreal-better-auth)

---

<div align="center">

**Made with ❤️ for the SurrealDB and Better Auth communities**

[⭐ Star this project](https://github.com/oskar-gmerek/surreal-better-auth) • [🐛 Report Issues](https://github.com/oskar-gmerek/surreal-better-auth/issues) • [💡 Request Features](https://github.com/oskar-gmerek/surreal-better-auth/issues/new)

</div>