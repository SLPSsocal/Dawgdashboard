// "Type" options per service category (Krishan, Sep 2). Grooming's type is
// its service (grooming_service_name — Full Groom, Bath and Brush, A La
// Carte …), so it has no extra subtype here. Evaluations have none.
export function subtypeOptions(category: string | null | undefined): string[] {
  switch (category) {
    case "boarding":
      // "In Daycare" participation carries an additional charge at checkout.
      return ["Private Play", "In Daycare (+ charge)"];
    case "daycare":
      return ["Standard", "Private Play (suite only)"];
    default:
      return [];
  }
}
