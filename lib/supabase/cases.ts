/**
 * Server-side helper — get the current user's assigned matter slugs from Supabase.
 *
 * Uses the server client (with user session) for auth, but queries with
 * service role to bypass RLS (since server components may not pass auth context
 * to Supabase queries reliably).
 */

import { createClient } from "@/lib/supabase/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";

/**
 * Returns the Neo4j matter slugs for all cases the current user owns or is a member of.
 * Returns null if the user is not authenticated.
 */
export async function getUserMatterSlugs(): Promise<string[] | null> {
  // Get user from session
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  // Use service role client for data queries (bypasses RLS)
  const sb = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!
  );

  // Get cases the user owns
  const { data: ownedCases } = await sb
    .from("cases")
    .select("neo4j_matter_id")
    .eq("owner_id", user.id);

  // Get cases the user is a member of
  const { data: memberships } = await sb
    .from("case_members")
    .select("case_id")
    .eq("user_id", user.id);

  const memberCaseIds = (memberships ?? []).map((m) => m.case_id);

  let memberCases: { neo4j_matter_id: string }[] = [];
  if (memberCaseIds.length > 0) {
    const { data } = await sb
      .from("cases")
      .select("neo4j_matter_id")
      .in("id", memberCaseIds);
    memberCases = data ?? [];
  }

  // Merge and deduplicate
  const slugs = new Set<string>();
  for (const c of ownedCases ?? []) {
    if (c.neo4j_matter_id) slugs.add(c.neo4j_matter_id);
  }
  for (const c of memberCases) {
    if (c.neo4j_matter_id) slugs.add(c.neo4j_matter_id);
  }

  return Array.from(slugs);
}
