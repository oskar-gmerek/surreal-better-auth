# Surreal Adapter for Better Auth

This adapter allows you to use
[SurrealDB](https://surrealist.app/referral?code=4pn5aba943lpbn8l) as a database
for your [Better Auth](https://better-auth.com) implementation.

## Feedback

⭐ Found this project helpful? Show some love with a star and consider to be a
[SPONSOR](https://github.com/sponsors/oskar-gmerek)! Your support keeps the code
evolving. 🚀

## Free Database

✨✨✨ Grab
[FREE SurrealDB Cloud instance + something extra](https://surrealist.app/referral?code=4pn5aba943lpbn8l)
✨✨✨

## » Installation

```bash
bun add surreal-better-auth
```

## » Configuration

```ts
import { surrealAdapter } from 'surreal-better-auth'
import { databaseInstance } from './your-surreal-singleton'

...
export const auth = betterAuth({
...
database: surrealAdapter(databaseInstance)
...
})
```

or

```ts
import { surrealAdapter } from 'surreal-better-auth'
import { getSurrealDB } from './surreal'
export const auth = betterAuth({
...
	database: async (options: BetterAuthOptions) => {
		const surrealDB = await getSurrealDB();
		if (!surrealDB) {
			throw new Error("SurrealDB is not configured");
		}
		return surrealAdapter(surrealDB)(options);
	},
...
})
```

## ✨ Contributions

Contributions are welcome! Please open an issue or a pull request if you have
any suggestions or improvements.
