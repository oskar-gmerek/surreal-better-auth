# SurrealDB Adapter for Better Auth

[![npm version](https://badge.fury.io/js/surrealdb-better-auth.svg)](https://badge.fury.io/js/surrealdb-better-auth)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A seamless integration between [SurrealDB](https://surrealdb.com) and
[Better Auth](https://better-auth.com), providing a robust authentication
solution with the power of SurrealDB's flexible database capabilities.

## ✨ Features

- 🔐 Secure authentication with SurrealDB
- 🔄 Real-time data synchronization
- 🚀 High performance and scalability
- 🔧 Easy configuration and setup
- 📦 TypeScript support
- 🧩 Flexible integration options

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ or Bun
- SurrealDB instance (local or cloud)
- Better Auth setup

### Installation

```bash
# Using pnpm (recommended)
pnpm add surrealdb-better-auth

# Using npm
npm install surrealdb-better-auth

# Using yarn
yarn add surrealdb-better-auth
```

## 🛠️ Configuration

### Basic Setup

```typescript
import { surrealAdapter } from "surrealdb-better-auth";
import { databaseInstance } from "./your-surreal-singleton";

export const auth = betterAuth({
	// ... other Better Auth options
	database: surrealAdapter(databaseInstance),
});
```

### Dynamic Database Connection

```typescript
import { surrealAdapter } from "surrealdb-better-auth";
import { getSurrealDB } from "./surreal";

export const auth = betterAuth({
	// ... other Better Auth options
	database: async (options: BetterAuthOptions) => {
		const surrealDB = await getSurrealDB();
		if (!surrealDB) {
			throw new Error("SurrealDB is not configured");
		}
		return surrealAdapter(surrealDB)(options);
	},
});
```

## 🆓 Free SurrealDB Cloud Instance

Get started with a free SurrealDB Cloud instance:
[Sign up here](https://surrealist.app/referral?code=xeoimhrajt3xk3be) (I get a
bonus if you sign up via this link)

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file
for details.

## 🙏 Support

⭐ Found this project helpful? Show some love with a star and consider becoming
a [SPONSOR](https://github.com/sponsors/oskar-gmerek)! Your support keeps the
code evolving. 🚀
