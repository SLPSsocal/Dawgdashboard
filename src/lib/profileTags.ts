import { createClient } from "@/lib/supabase/server";

export type TargetType = "animal" | "parent";

export type AssignedTag = {
  assignmentId: string;
  tagId: string;
  icon: string;
  name: string;
  note: string | null;
};

// Bulk-fetches assigned tags for a batch of animal/parent ids in one query —
// used on list/board views (Animals, Parents, Check-in Board) so showing
// icons next to a hyperlinked name doesn't turn into one query per row.
export async function getProfileTagsBulk(
  targetType: TargetType,
  targetIds: string[]
): Promise<Map<string, AssignedTag[]>> {
  const result = new Map<string, AssignedTag[]>();
  const ids = Array.from(new Set(targetIds.filter(Boolean)));
  if (ids.length === 0) return result;

  const supabase = createClient();
  const { data } = await supabase
    .from("profile_tag_assignments")
    .select("id, tag_id, target_id, note, profile_tags ( icon, name )")
    .eq("target_type", targetType)
    .in("target_id", ids);

  type Row = {
    id: string;
    tag_id: string;
    target_id: string;
    note: string | null;
    profile_tags: { icon: string; name: string } | null;
  };
  for (const row of (data as unknown as Row[]) ?? []) {
    if (!row.profile_tags) continue;
    const list = result.get(row.target_id) ?? [];
    list.push({
      assignmentId: row.id,
      tagId: row.tag_id,
      icon: row.profile_tags.icon,
      name: row.profile_tags.name,
      note: row.note,
    });
    result.set(row.target_id, list);
  }
  return result;
}

export async function getProfileTagsFor(targetType: TargetType, targetId: string): Promise<AssignedTag[]> {
  const map = await getProfileTagsBulk(targetType, [targetId]);
  return map.get(targetId) ?? [];
}

export async function getProfileTagCatalog(appliesTo: TargetType) {
  const supabase = createClient();
  const { data } = await supabase
    .from("profile_tags")
    .select("id, icon, name, description")
    .eq("applies_to", appliesTo)
    .eq("active", true)
    .order("name");
  return data ?? [];
}
