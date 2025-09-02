import { json } from "@sveltejs/kit";

let lastVerificationUrl: string | null = null;

export function GET() {
  return json({ url: lastVerificationUrl });
}

export function POST({ request }) {
  return request.json().then(({ url }) => {
    lastVerificationUrl = url;
    return json({ success: true });
  });
}

export function DELETE() {
  lastVerificationUrl = null;
  return json({ success: true });
}
