import { render } from '@master/css-server'
import config from '../master.css'
import { auth } from "$lib/auth";
import { svelteKitHandler } from "better-auth/svelte-kit";
import { building } from '$app/environment'
import { sequence } from '@sveltejs/kit/hooks';
import type { Handle } from '@sveltejs/kit';

const masterCSS: Handle = async ({ event, resolve }) => {
    return await resolve(event, {
        transformPageChunk: ({ html }) =>
            render(html, config).html
    })
}

 
const betterAuth: Handle = async ({ event, resolve }) => {
  const session = await auth.api.getSession({
    headers: event.request.headers,
  });
 
    if (session) {
        event.locals.session = session.session;
        event.locals.user = session.user;
    }
    return svelteKitHandler({ event, resolve, auth, building });
}

export const handle = sequence(masterCSS, betterAuth)