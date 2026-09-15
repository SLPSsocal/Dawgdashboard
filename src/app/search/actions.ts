"use server";

import { getSession } from "@/lib/session";
import { createClient } from "@/lib/supabase/server";

// Global "find a dog or parent" search behind the header search box
// (Krishan, Sep 15). Two cheap ILIKE queries, merged and capped, so staff
// can jump straight to a profile from any page instead of navigating
// Customers → Animals → scroll.

export type SearchHit =
  | { kind: "animal"; id: string; name: string; sub: string | null; href: string; inactive?: boolean }
  | { kind: "parent"; id: string; name: string; sub: string | null; href: string };

export async function globalSearch(query: string): Promise<SearchHit[]> {
  const session = await getSession();
  if (!session) return [];
  const q = query.trim();
  if (q.length < 2) return [];
  const supabase = createClient();
  const like = `%${q.replace(/[%_]/g, "")}%`;
  const digits = q.replace(/\D/g, "");

  type AnimalRow = {
    id: string;
    name: string;
    breed: string | null;
    active: boolean | null;
    parents: { first_name: string; last_name: string } | null;
  };
  type ParentRow = { id: string; first_name: string; last_name: string; phone: string | null; email: string | null };

  const parentFilter = [`first_name.ilike.${like}`, `last_name.ilike.${like}`, `email.ilike.${like}`];
  if (digits.length >= 3) parentFilter.push(`phone.ilike.%${digits.slice(-4)}%`);
  else parentFilter.push(`phone.ilike.${like}`);

  const [{ data: animals }, { data: parents }] = await Promise.all([
    supabase
      .from("animals")
      .select("id, name, breed, active, parents ( first_name, last_name )")
      .ilike("name", like)
      .order("active", { ascending: false })
      .order("name")
      .limit(6),
    supabase.from("parents").select("id, first_name, last_name, phone, email").or(parentFilter.join(",")).order("last_name").limit(6),
  ]);

  const hits: SearchHit[] = [];
  for (const a of ((animals as unknown as AnimalRow[]) ?? [])) {
    const owner = a.parents ? `${a.parents.first_name} ${a.parents.last_name}`.trim() : null;
    hits.push({
      kind: "animal",
      id: a.id,
      name: a.name,
      sub: [a.breed, owner].filter(Boolean).join(" · ") || null,
      href: `/animals/${a.id}`,
      inactive: a.active === false,
    });
  }
  for (const p of ((parents as unknown as ParentRow[]) ?? [])) {
    hits.push({
      kind: "parent",
      id: p.id,
      name: `${p.first_name} ${p.last_name}`.trim(),
      sub: p.phone ?? p.email ?? null,
      href: `/parents/${p.id}`,
    });
  }

  // Full-word / prefix matches first, then everything else.
  const ql = q.toLowerCase();
  hits.sort((a, b) => {
    const score = (h: SearchHit) => (h.name.toLowerCase() === ql ? 0 : h.name.toLowerCase().startsWith(ql) ? 1 : 2);
    return score(a) - score(b);
  });
  return hits.slice(0, 10);
}
