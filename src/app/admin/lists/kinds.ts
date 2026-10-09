// The three admin-managed lists. Cost codes have a code as well as a name;
// hazards and PPE are just names.

export const KINDS = {
  "cost-codes": {
    table: "cost_codes",
    title: "Cost codes",
    one: "cost code",
    hasCode: true,
    hint: "Crews pick these on time cards, site photos and FLHAs.",
  },
  hazards: {
    table: "hazards",
    title: "Hazards",
    one: "hazard",
    hasCode: false,
    hint: "The checklist on safety meetings and FLHAs.",
  },
  ppe: {
    table: "ppe_items",
    title: "PPE",
    one: "PPE item",
    hasCode: false,
    hint: "The PPE checklist on FLHAs.",
  },
} as const;

export type Kind = keyof typeof KINDS;

export function isKind(value: string): value is Kind {
  return Object.hasOwn(KINDS, value);
}

export type ListItem = {
  id: string;
  code: string | null;
  name: string;
  sort_order: number;
  is_active: boolean;
};
