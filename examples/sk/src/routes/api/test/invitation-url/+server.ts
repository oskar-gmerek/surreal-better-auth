import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

let latestInvitationData: any = null;

export const POST: RequestHandler = async ({ request }) => {
  try {
    const data = await request.json();

    latestInvitationData = data;

    return json({ success: true });
  } catch (error) {
    console.error("❌ Error processing invitation email:", error);
    return json(
      { error: "Failed to process invitation email" },
      { status: 500 },
    );
  }
};

export const GET: RequestHandler = async () => {
  if (!latestInvitationData) {
    return json({ error: "No invitation data available" }, { status: 404 });
  }

  const data = latestInvitationData;
  latestInvitationData = null;

  return json(data);
};
