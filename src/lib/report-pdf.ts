import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { formatDate, formatDateTime, formatTime } from "@/lib/dates";
import { clock, hours, type ReportContent } from "@/lib/daily-report";

// Letter size, in points.
const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 48;
const WIDTH = PAGE_W - MARGIN * 2;
const GREY = rgb(0.38, 0.38, 0.42);
const AMBER = rgb(0.6, 0.33, 0);
const BLACK = rgb(0, 0, 0);

// The built-in PDF fonts only cover Western European letters; anything else
// (emoji, other alphabets) shows as "?" rather than breaking the PDF.
const EXTRA = "‘’“”–—•…€";
function clean(text: string): string {
  return Array.from(text.replace(/\t/g, " "))
    .map((ch) => {
      const c = ch.codePointAt(0)!;
      return (c >= 0x20 && c <= 0x7e) || (c >= 0xa0 && c <= 0xff) || EXTRA.includes(ch) || ch === "\n" ? ch : "?";
    })
    .join("");
}

class Writer {
  doc: PDFDocument;
  font: PDFFont;
  bold: PDFFont;
  page!: PDFPage;
  y = 0;

  constructor(doc: PDFDocument, font: PDFFont, bold: PDFFont) {
    this.doc = doc;
    this.font = font;
    this.bold = bold;
    this.newPage();
  }

  newPage() {
    this.page = this.doc.addPage([PAGE_W, PAGE_H]);
    this.y = PAGE_H - MARGIN;
  }

  // Starts a new page unless there's room for `height` more points.
  room(height: number) {
    if (this.y - height < MARGIN + 20) this.newPage();
  }

  // Splits text into lines that fit the width.
  wrap(text: string, font: PDFFont, size: number, width: number): string[] {
    const lines: string[] = [];
    for (const paragraph of clean(text).split("\n")) {
      let line = "";
      for (const word of paragraph.split(" ")) {
        const next = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(next, size) <= width) {
          line = next;
          continue;
        }
        if (line) lines.push(line);
        // A single word too long for the line is cut into pieces.
        let rest = word;
        while (font.widthOfTextAtSize(rest, size) > width) {
          let n = rest.length - 1;
          while (n > 1 && font.widthOfTextAtSize(rest.slice(0, n), size) > width) n--;
          lines.push(rest.slice(0, n));
          rest = rest.slice(n);
        }
        line = rest;
      }
      lines.push(line);
    }
    return lines;
  }

  text(
    text: string,
    { size = 10, bold = false, color = BLACK, indent = 0, gap = 2 }: { size?: number; bold?: boolean; color?: typeof BLACK; indent?: number; gap?: number } = {},
  ) {
    const font = bold ? this.bold : this.font;
    for (const line of this.wrap(text, font, size, WIDTH - indent)) {
      this.room(size + gap);
      this.y -= size;
      this.page.drawText(line, { x: MARGIN + indent, y: this.y, size, font, color });
      this.y -= gap;
    }
  }

  heading(text: string) {
    this.room(60);
    this.y -= 14;
    this.text(text, { size: 14, bold: true, gap: 4 });
    this.page.drawLine({
      start: { x: MARGIN, y: this.y },
      end: { x: PAGE_W - MARGIN, y: this.y },
      thickness: 0.75,
      color: GREY,
    });
    this.y -= 8;
  }

  space(points: number) {
    this.y -= points;
  }

  // Photos two to a row, each with a caption under it.
  photos(items: { image: PDFImage | null; caption: string }[]) {
    const gap = 12;
    const w = (WIDTH - gap) / 2;
    const maxH = 230;
    for (let i = 0; i < items.length; i += 2) {
      const row = items.slice(i, i + 2).map((p) => {
        const scale = p.image ? Math.min(w / p.image.width, maxH / p.image.height) : 1;
        const lines = this.wrap(p.caption, this.font, 9, w);
        return { ...p, scale, h: p.image ? p.image.height * scale : 20, lines };
      });
      const rowH = Math.max(...row.map((r) => r.h + r.lines.length * 11)) + 10;
      this.room(rowH);
      row.forEach((r, n) => {
        const x = MARGIN + n * (w + gap);
        if (r.image) {
          this.page.drawImage(r.image, { x, y: this.y - r.h, width: r.image.width * r.scale, height: r.h });
        } else {
          this.page.drawText("Photo couldn't be loaded", { x, y: this.y - 14, size: 9, font: this.font, color: GREY });
        }
        let y = this.y - r.h - 2;
        for (const line of r.lines) {
          y -= 9;
          this.page.drawText(line, { x, y, size: 9, font: this.font, color: GREY });
          y -= 2;
        }
      });
      this.y -= rowH;
    }
  }
}

// Builds the report's PDF. `photo` returns a photo's JPEG bytes by its
// storage path (site-photos or slip-photos bucket), or null if it can't.
export async function reportPdf(
  report: ReportContent,
  finalized: { at: string; by: string },
  photo: (bucket: "site-photos" | "slip-photos", path: string) => Promise<Uint8Array | null>,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Daily report – ${report.job.name} – ${formatDate(report.date)}`);
  doc.setCreator("Construction App");
  const w = new Writer(doc, await doc.embedFont(StandardFonts.Helvetica), await doc.embedFont(StandardFonts.HelveticaBold));

  const load = async (bucket: "site-photos" | "slip-photos", path: string) => {
    const bytes = await photo(bucket, path);
    if (!bytes) return null;
    try {
      return await doc.embedJpg(bytes);
    } catch {
      return null;
    }
  };

  // Header.
  w.text("Daily report", { size: 22, bold: true, gap: 6 });
  w.text(`${report.job.name}${report.job.job_number ? `  ·  #${report.job.job_number}` : ""}`, { size: 14, bold: true, gap: 4 });
  w.text(formatDate(report.date), { size: 12, gap: 4 });
  if (report.job.address) w.text(report.job.address, { color: GREY });
  if (report.job.client) w.text(`Client: ${report.job.client}`, { color: GREY });
  w.text(`Finalized ${formatDateTime(finalized.at)} by ${finalized.by}`, { color: GREY });

  if (report.missing.length > 0) {
    w.heading("Missing when finalized");
    for (const m of report.missing) w.text(`•  ${m}`, { color: AMBER });
  }

  // Manpower.
  w.heading("Manpower");
  if (report.manpower.length === 0) w.text("No time cards.", { color: GREY });
  for (const m of report.manpower) {
    w.text(`${m.name}${m.trade ? ` (${m.trade})` : ""}  —  ${hours(m.minutes)}`, { bold: true });
    w.text(
      `${clock(m.start)} to ${clock(m.end)}${m.break_minutes ? `, ${m.break_minutes} min break` : ", no break"}${m.approved ? "" : "  ·  not approved"}`,
      { color: GREY, indent: 12, gap: 5 },
    );
  }
  if (report.manpower.length > 0) w.text(`Total: ${hours(report.total_minutes)}`, { bold: true });

  // Hours by cost code.
  w.heading("Hours by cost code");
  if (report.cost_codes.length === 0) w.text("No hours.", { color: GREY });
  for (const c of report.cost_codes) {
    w.space(2);
    w.text(`${c.code} ${c.name}  —  ${hours(c.minutes)}`, { bold: true });
    for (const l of c.lines) w.text(`${l.name} (${hours(l.minutes)}): ${l.description}`, { indent: 12 });
  }

  // Equipment.
  w.heading("Equipment");
  if (report.equipment.length === 0) w.text("No equipment hours.", { color: GREY });
  for (const e of report.equipment) {
    w.text(`${e.name}${e.unit_number ? ` (${e.unit_number})` : ""}  —  ${hours(e.minutes)}`, { bold: true });
    w.text(e.by.map((b) => `${b.name} ${hours(b.minutes)}`).join(", "), { color: GREY, indent: 12, gap: 5 });
  }

  // Safety.
  w.heading("Safety meeting");
  const meeting = report.safety_meeting;
  if (!meeting) {
    w.text("No safety meeting.", { color: AMBER });
  } else {
    w.text(`Run by ${meeting.led_by} at ${formatTime(meeting.filled_at)}`, { bold: true });
    w.text(`Topic: ${meeting.topic}`);
    if (meeting.hazards.length > 0) w.text(`Hazards: ${meeting.hazards.join(", ")}`);
    w.text(
      `Crew: ${meeting.attendees.map((a) => `${a.name} (${a.signed ? "signed" : "name tapped"})`).join(", ") || "none"}`,
    );
  }

  w.heading("FLHAs");
  if (report.flhas.length === 0) w.text("No crew on this job.", { color: GREY });
  for (const f of report.flhas) {
    if (!f.done) {
      w.text(`${f.name}  —  not done`, { bold: true, color: AMBER, gap: 5 });
      continue;
    }
    w.text(`${f.name}  —  done at ${formatTime(f.filled_at!)}`, { bold: true });
    if (f.tasks.length > 0) w.text(`Tasks: ${f.tasks.join(", ")}`, { indent: 12 });
    for (const h of f.hazards) w.text(`${h.name}: ${h.control}`, { indent: 12 });
    if (f.ppe.length > 0) w.text(`PPE: ${f.ppe.join(", ")}`, { indent: 12 });
    w.space(3);
  }

  // Trucking.
  w.heading("Trucking");
  if (report.trucking.length === 0) w.text("No trucking slips.", { color: GREY });
  for (const s of report.trucking) {
    const amounts = [
      s.loads != null && `${s.loads} ${s.loads === 1 ? "load" : "loads"}`,
      s.tonnage != null && `${s.tonnage} t`,
    ].filter(Boolean);
    w.text(
      `${s.trucking_company ?? "Trucking company not filled in"}${s.ticket_number ? `  ·  Ticket ${s.ticket_number}` : ""}`,
      { bold: true },
    );
    w.text(
      [s.truck_number && `Truck ${s.truck_number}`, s.material, ...amounts, s.slip_date && `Slip date ${formatDate(s.slip_date)}`]
        .filter(Boolean)
        .join("  ·  ") || "No values",
      { indent: 12 },
    );
    w.text(`Sent by ${s.sent_by} at ${formatTime(s.filled_at)}${s.checked ? "" : "  ·  not checked"}`, {
      color: GREY,
      indent: 12,
      gap: 5,
    });
  }
  if (report.trucking.length > 0) {
    const totals = [
      report.total_loads != null && `${report.total_loads} loads`,
      report.total_tonnage != null && `${report.total_tonnage} t`,
    ].filter(Boolean);
    if (totals.length > 0) w.text(`Total: ${totals.join(", ")}`, { bold: true });
  }

  // Site photos & notes.
  w.heading("Site photos & notes");
  if (report.site_entries.length === 0) w.text("No site photos or notes.", { color: GREY });
  for (const e of report.site_entries) {
    w.space(2);
    w.text(`${e.sent_by} at ${formatTime(e.filled_at)}`, { bold: true });
    if (e.notes) w.text(e.notes, { gap: 4 });
    const images = await Promise.all(
      e.photos.map(async (p) => ({
        image: await load("site-photos", p.path),
        caption: [p.code && `${p.code} ${p.code_name ?? ""}`.trim(), p.caption].filter(Boolean).join(" · "),
      })),
    );
    if (images.length > 0) {
      w.space(4);
      w.photos(images);
    }
  }

  // The original slip photos.
  if (report.trucking.length > 0) {
    w.heading("Trucking slip photos");
    w.photos(
      await Promise.all(
        report.trucking.map(async (s) => ({
          image: await load("slip-photos", s.photo_path),
          caption: s.ticket_number ? `Ticket ${s.ticket_number}` : `Sent by ${s.sent_by}`,
        })),
      ),
    );
  }

  // Footer on every page.
  const pages = doc.getPages();
  pages.forEach((page, i) => {
    const footer = clean(`${report.job.name} · ${formatDate(report.date)} · Page ${i + 1} of ${pages.length}`);
    page.drawText(footer, { x: MARGIN, y: MARGIN - 20, size: 8, font: w.font, color: GREY });
  });

  return doc.save();
}
