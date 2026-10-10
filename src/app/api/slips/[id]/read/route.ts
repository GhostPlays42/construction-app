import { needsAppCode } from "@/lib/auth";
import { readSlip } from "@/lib/slip-reader";
import { createClient } from "@/lib/supabase/server";

// Reads a slip's photo the first time someone opens it to check it, and
// saves what was read. Returns the slip's values either way. Only the person
// who sent the slip or an admin can see it, so only they can have it read.
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || (await needsAppCode(supabase, user.id))) {
    return Response.json({ code: "signed_out" }, { status: 401 });
  }

  const columns =
    "id, read_status, photo_path, trucking_company, truck_number, ticket_number, material, loads, tonnage, slip_date";
  const { data: slip } = await supabase.from("trucking_slips").select(columns).eq("id", id).maybeSingle();
  if (!slip) return Response.json({ code: "not_found" }, { status: 404 });
  if (slip.read_status !== "pending") return Response.json(slip);

  const { data: photo } = await supabase.storage.from("slip-photos").download(slip.photo_path);
  const values = photo ? await readSlip(photo) : null;
  const { error } = await supabase.rpc("save_trucking_slip_reading", { p_id: id, p_values: values });
  if (error) return Response.json({ code: "server_error" }, { status: 500 });

  const { data: read } = await supabase.from("trucking_slips").select(columns).eq("id", id).maybeSingle();
  return Response.json(read);
}
