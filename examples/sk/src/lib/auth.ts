import { betterAuth } from "better-auth";
import { openAPI, organization, username } from "better-auth/plugins";
import { surrealdbAdapter } from "surreal-better-auth";
import Surreal from "surrealdb";

const db = new Surreal();
await db.connect("http://127.0.0.1:8000/rpc");
await db.signin({ username: "root", password: "root" });
await db.use({ namespace: "test", database: "example-sveltekit" });

export const auth = betterAuth({

	plugins: [
		username(),
		openAPI({
			path: '/openapi'
		}),
		organization({
			async sendInvitationEmail(data) {

				if (process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development') {
					try {
						await fetch('http://localhost:3000/api/test/invitation-url', {
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify(data)
						});
					} catch (error) {

					}
				}
			},
			invitation: {
				fields: {
					email: 'email_address'
				}
			},
			teams: {
				enabled: true,
				maximumTeams: 10,
				allowRemovingAllTeams: false
			},
			schema: {
				organization: {
					modelName: 'business',
					fields: {
						logo: 'logotype'
					},
					additionalFields: {
						myCustomField: {
							type: "string",
							input: true,
							required: false
						}
					},
				},
				team: {
					additionalFields: {
						description: {
							type: "string",
							input: true,
							required: false
						}
					}
				}
			}
		}),
	],
	secret: 'surreal-better-auth-test',
	database: surrealdbAdapter(db, {
		idGenerator: 'surreal.ULID',
		allowPassingId: true
	}),
	user: {
		changeEmail: {
			enabled: true,
			sendChangeEmailVerification: async ({ newEmail, url }) => {
				console.timeLog(newEmail, url)
			},
		}
	},
	session: {
		expiresIn: 60 * 60 * 24 * 7, // 7 days
		updateAge: 60 * 60 * 24, // 1 day
		disableSessionRefresh: false,
	},
	verification: {
		disableCleanup: true,
		fields: {
			value: 'data'
		}
	},

	emailAndPassword: {
		enabled: true,
		async sendResetPassword(url) {
			console.log(url)
		},
	},
	emailVerification: {
		sendOnSignUp: true,
		sendVerificationEmail: async ({ url }) => {

			if (process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development') {
				try {
					await fetch('http://localhost:3000/api/test/verification-url', {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify({ url })
					});
				} catch (error) {

				}
			}
		},
	},
});