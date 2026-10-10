import Anthropic from "@anthropic-ai/sdk";

// Reads a trucking slip photo with Claude's smallest model, which keeps the
// cost to a fraction of a cent per slip. The worker always checks what comes
// back, so a missed or wrong value is fixed on the phone, not trusted blindly.
//
// Needs ANTHROPIC_API_KEY in the server's settings (Vercel). Without it, or
// when reading fails, this returns null and the worker types the values in.

const MODEL = "claude-haiku-5-5";

export type SlipValues = {
  trucking_company: string | null;
  truck_number: string | null;
  ticket_number: string | null;
  material: string | null;
  loads: number | null;
  tonnage: number | null;
  // "2026-10-09"
  slip_date: string | null;
};

const text = { type: ["string", "null"] };
const number = { type: ["number", "null"] };
const SCHEMA = {
  type: "object",
  properties: {
    trucking_company: text,
    truck_number: text,
    ticket_number: text,
    material: text,
    loads: number,
    tonnage: number,
    slip_date: { type: ["string", "null"], description: "YYYY-MM-DD" },
  },
  required: ["trucking_company", "truck_number", "ticket_number", "material", "loads", "tonnage", "slip_date"],
  additionalProperties: false,
};

const PROMPT = `This is a photo of a trucking slip (a haul ticket or scale ticket) from a construction site. Read these values from it:

- trucking_company: the trucking or hauling company named on the slip.
- truck_number: the truck or unit number.
- ticket_number: the slip's ticket number.
- material: what was hauled, like gravel, road base or fill.
- loads: the number of loads, if the slip shows one.
- tonnage: the net weight in tonnes, if the slip shows one. If it only shows gross and tare weights, give gross minus tare.
- slip_date: the date on the slip, as YYYY-MM-DD.

Use null for anything that isn't on the slip or that you can't read clearly. Never guess a value. If the photo isn't a trucking slip, use null for everything.`;

export async function readSlip(photo: Blob): Promise<SlipValues | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const client = new Anthropic({ timeout: 30_000, maxRetries: 1 });
  try {
    const data = Buffer.from(await photo.arrayBuffer()).toString("base64");
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 1024,
      thinking: { type: "disabled" },
      output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/jpeg", data } },
            { type: "text", text: PROMPT },
          ],
        },
      ],
    });
    if (response.stop_reason !== "end_turn") return null;
    const block = response.content.find((b) => b.type === "text");
    return block?.type === "text" ? (JSON.parse(block.text) as SlipValues) : null;
  } catch (error) {
    console.error("Couldn't read a trucking slip:", error instanceof Error ? error.message : error);
    return null;
  }
}
