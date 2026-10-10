import type { Database } from "@/lib/supabase/database.types";

// A trucking slip's values as typed into a form, and as the database takes them.

export type SlipFormValues = {
  trucking_company: string;
  truck_number: string;
  ticket_number: string;
  material: string;
  loads: string;
  tonnage: string;
  // "2026-10-09", or "" for none
  slip_date: string;
};

type SlipRow = {
  trucking_company: string | null;
  truck_number: string | null;
  ticket_number: string | null;
  material: string | null;
  loads: number | null;
  tonnage: number | null;
  slip_date: string | null;
};

export function formValues(row: SlipRow): SlipFormValues {
  return {
    trucking_company: row.trucking_company ?? "",
    truck_number: row.truck_number ?? "",
    ticket_number: row.ticket_number ?? "",
    material: row.material ?? "",
    loads: row.loads == null ? "" : String(Number(row.loads)),
    tonnage: row.tonnage == null ? "" : String(Number(row.tonnage)),
    slip_date: row.slip_date ?? "",
  };
}

function amount(text: string): number | null {
  const t = text.trim().replace(/,/g, "");
  return t === "" ? null : /^\d+(\.\d+)?$/.test(t) ? Number(t) : NaN;
}

// The arguments for check_trucking_slip and update_trucking_slip, or an
// error code when a number or date can't be understood.
export function rpcArgs(
  id: string,
  v: SlipFormValues,
): { error: string } | { args: Database["public"]["Functions"]["check_trucking_slip"]["Args"] } {
  const loads = amount(v.loads);
  const tonnage = amount(v.tonnage);
  if (Number.isNaN(loads) || Number.isNaN(tonnage)) return { error: "bad_amount" } as const;
  if (v.slip_date && !/^\d{4}-\d{2}-\d{2}$/.test(v.slip_date)) return { error: "bad_slip_date" };
  return {
    args: {
      p_id: id,
      p_trucking_company: v.trucking_company,
      p_truck_number: v.truck_number,
      p_ticket_number: v.ticket_number,
      p_material: v.material,
      // The generated types say number, but the database takes null for blank.
      p_loads: loads as number,
      p_tonnage: tonnage as number,
      p_slip_date: (v.slip_date || null) as string,
    },
  };
}
