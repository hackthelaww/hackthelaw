/**
 * DELETE /api/auth/delete-account — Delete the current user's account.
 *
 * Uses the Supabase service role key (server-side) to delete the user from auth.users.
 * This cascades to remove their case_members rows via FK constraints.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

export async function DELETE() {
  // Get the current user from the session
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  // Use service role to delete the user (regular client can't delete users)
  const serviceClient = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!
  );

  const { error } = await serviceClient.auth.admin.deleteUser(user.id);

  if (error) {
    return NextResponse.json(
      { error: `Failed to delete account: ${error.message}` },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}
