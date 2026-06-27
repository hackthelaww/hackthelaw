/**
 * DELETE /api/auth/delete-all-users — Delete ALL users from Supabase Auth.
 *
 * WARNING: Destructive operation. Intended for development/hackathon use only.
 * Cascades to remove all case_members rows via FK constraints.
 */

import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

export async function DELETE() {
  const serviceClient = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!
  );

  // List all users
  const { data, error: listError } = await serviceClient.auth.admin.listUsers();

  if (listError) {
    return NextResponse.json(
      { error: `Failed to list users: ${listError.message}` },
      { status: 500 }
    );
  }

  const users = data?.users ?? [];
  const results: { id: string; email: string | undefined; deleted: boolean; error?: string }[] = [];

  for (const user of users) {
    const { error } = await serviceClient.auth.admin.deleteUser(user.id);
    results.push({
      id: user.id,
      email: user.email,
      deleted: !error,
      error: error?.message,
    });
  }

  return NextResponse.json({
    total: users.length,
    deleted: results.filter((r) => r.deleted).length,
    failed: results.filter((r) => !r.deleted).length,
    results,
  });
}
