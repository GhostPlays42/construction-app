import { AnswerValue } from "@/app/admin/forms/answer-value";
import { formatDate, formatTime } from "@/lib/dates";
import { clock, hours, type ReportContent } from "@/lib/daily-report";

const muted = "text-zinc-600 dark:text-zinc-400";
const warn = "text-amber-700 dark:text-amber-400";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="border-b-2 border-zinc-200 pb-1 text-xl font-semibold dark:border-zinc-800">{title}</h2>
      {children}
    </section>
  );
}

function Photo({ url, alt, caption }: { url: string | null; alt: string; caption: string }) {
  return (
    <figure className="flex flex-col gap-1">
      {url ? (
        <a href={url} target="_blank" rel="noopener noreferrer" title="Open full size">
          {/* eslint-disable-next-line @next/next/no-img-element -- a private link that expires */}
          <img src={url} alt={alt} className="aspect-[4/3] w-full rounded-lg object-cover" />
        </a>
      ) : (
        <p className="flex aspect-[4/3] items-center justify-center rounded-lg bg-zinc-100 p-2 text-base dark:bg-zinc-900">
          Couldn&apos;t load
        </p>
      )}
      {caption && <figcaption className={`text-base ${muted}`}>{caption}</figcaption>}
    </figure>
  );
}

// A daily report on screen. `photoUrl` gives a viewable link for a photo's
// storage path.
export function ReportView({ report, photoUrl }: { report: ReportContent; photoUrl: (path: string) => string | null }) {
  const meeting = report.safety_meeting;
  return (
    <div className="flex flex-col gap-6 text-lg">
      <Section title="Manpower">
        {report.manpower.length === 0 ? (
          <p className={muted}>No time cards.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {report.manpower.map((m) => (
              <li key={m.name}>
                <p className="flex justify-between gap-2">
                  <span className="font-medium">
                    {m.name}
                    {m.trade && <span className={`font-normal ${muted}`}> · {m.trade}</span>}
                  </span>
                  <span>{hours(m.minutes)}</span>
                </p>
                <p className={`text-base ${muted}`}>
                  {clock(m.start)} to {clock(m.end)}
                  {m.break_minutes ? `, ${m.break_minutes} min break` : ", no break"}
                  {!m.approved && <span className={warn}> · not approved</span>}
                </p>
              </li>
            ))}
            <li className="flex justify-between gap-2 font-semibold">
              <span>Total</span>
              <span>{hours(report.total_minutes)}</span>
            </li>
          </ul>
        )}
      </Section>

      <Section title="Hours by cost code">
        {report.cost_codes.length === 0 ? (
          <p className={muted}>No hours.</p>
        ) : (
          report.cost_codes.map((c) => (
            <div key={`${c.code}-${c.name}`} className="flex flex-col gap-1">
              <p className="flex justify-between gap-2 font-medium">
                <span>
                  {c.code} {c.name}
                </span>
                <span>{hours(c.minutes)}</span>
              </p>
              <ul className="flex flex-col gap-1 pl-4">
                {c.lines.map((l, i) => (
                  <li key={i} className="text-base">
                    <span className="font-medium">
                      {l.name} ({hours(l.minutes)}):
                    </span>{" "}
                    {l.description}
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </Section>

      <Section title="Equipment">
        {report.equipment.length === 0 ? (
          <p className={muted}>No equipment hours.</p>
        ) : (
          report.equipment.map((e) => (
            <div key={`${e.name}-${e.unit_number}`}>
              <p className="flex justify-between gap-2 font-medium">
                <span>
                  {e.name}
                  {e.unit_number && <span className={`font-normal ${muted}`}> · {e.unit_number}</span>}
                </span>
                <span>{hours(e.minutes)}</span>
              </p>
              <p className={`text-base ${muted}`}>{e.by.map((b) => `${b.name} ${hours(b.minutes)}`).join(", ")}</p>
            </div>
          ))
        )}
      </Section>

      <Section title="Safety meeting">
        {!meeting ? (
          <p className={warn}>No safety meeting.</p>
        ) : (
          <div className="flex flex-col gap-1">
            <p className="font-medium">
              Run by {meeting.led_by} at {formatTime(meeting.filled_at)}
            </p>
            <p>
              <span className={muted}>Topic:</span> {meeting.topic}
            </p>
            {meeting.hazards.length > 0 && (
              <p>
                <span className={muted}>Hazards:</span> {meeting.hazards.join(", ")}
              </p>
            )}
            <p>
              <span className={muted}>Crew:</span>{" "}
              {meeting.attendees.map((a) => `${a.name} (${a.signed ? "signed" : "name tapped"})`).join(", ") || "none"}
            </p>
          </div>
        )}
      </Section>

      <Section title="FLHAs">
        {report.flhas.length === 0 ? (
          <p className={muted}>No crew on this job.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {report.flhas.map((f) => (
              <li key={f.name}>
                {f.done ? (
                  <>
                    <p className="font-medium">
                      {f.name} <span className="font-normal text-green-700 dark:text-green-400">✓ done at {formatTime(f.filled_at!)}</span>
                    </p>
                    {f.tasks.length > 0 && <p className={`text-base ${muted}`}>Tasks: {f.tasks.join(", ")}</p>}
                    {f.hazards.length > 0 && (
                      <p className={`text-base ${muted}`}>
                        Hazards: {f.hazards.map((h) => `${h.name} (${h.control})`).join(", ")}
                      </p>
                    )}
                    {f.ppe.length > 0 && <p className={`text-base ${muted}`}>PPE: {f.ppe.join(", ")}</p>}
                  </>
                ) : (
                  <p className="font-medium">
                    {f.name} <span className={`font-normal ${warn}`}>not done</span>
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Trucking">
        {report.trucking.length === 0 ? (
          <p className={muted}>No trucking slips.</p>
        ) : (
          <>
            {report.trucking.map((s) => {
              const amounts = [
                s.loads != null && `${s.loads} ${s.loads === 1 ? "load" : "loads"}`,
                s.tonnage != null && `${s.tonnage} t`,
              ].filter(Boolean);
              return (
                <div key={s.photo_path} className="grid grid-cols-[5rem_1fr] gap-3">
                  <Photo url={photoUrl(s.photo_path)} alt="Slip photo" caption="" />
                  <div>
                    <p className="font-medium">
                      {s.trucking_company ?? "Trucking company not filled in"}
                      {s.ticket_number && <span className={`font-normal ${muted}`}> · Ticket {s.ticket_number}</span>}
                    </p>
                    <p className="text-base">
                      {[s.truck_number && `Truck ${s.truck_number}`, s.material, ...amounts, s.slip_date && `Slip date ${formatDate(s.slip_date)}`]
                        .filter(Boolean)
                        .join(" · ") || "No values"}
                    </p>
                    <p className={`text-base ${muted}`}>
                      Sent by {s.sent_by} at {formatTime(s.filled_at)}
                      {!s.checked && <span className={warn}> · not checked</span>}
                    </p>
                  </div>
                </div>
              );
            })}
            {(report.total_loads != null || report.total_tonnage != null) && (
              <p className="font-semibold">
                Total:{" "}
                {[report.total_loads != null && `${report.total_loads} loads`, report.total_tonnage != null && `${report.total_tonnage} t`]
                  .filter(Boolean)
                  .join(", ")}
              </p>
            )}
          </>
        )}
      </Section>

      <Section title="Site photos & notes">
        {report.site_entries.length === 0 ? (
          <p className={muted}>No site photos or notes.</p>
        ) : (
          report.site_entries.map((e, i) => (
            <div key={i} className="flex flex-col gap-2">
              <p className="font-medium">
                {e.sent_by} <span className={`font-normal ${muted}`}>at {formatTime(e.filled_at)}</span>
              </p>
              {e.notes && <p className="whitespace-pre-line">{e.notes}</p>}
              {e.photos.length > 0 && (
                <div className="grid grid-cols-2 gap-3">
                  {e.photos.map((p, n) => (
                    <Photo
                      key={p.path}
                      url={photoUrl(p.path)}
                      alt={p.caption ?? `Photo ${n + 1}`}
                      caption={[p.code && `${p.code} ${p.code_name ?? ""}`.trim(), p.caption].filter(Boolean).join(" · ")}
                    />
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </Section>

      {(report.forms ?? []).map((f) => (
        <Section key={f.name} title={f.name}>
          {f.entries.map((e, i) => (
            <div key={i} className="flex flex-col gap-3">
              <p className="font-medium">
                {e.sent_by} <span className={`font-normal ${muted}`}>at {formatTime(e.filled_at)}</span>
              </p>
              {e.answers.map((a, n) => (
                <div key={n} className="flex flex-col gap-1 pl-4">
                  <p className={`text-base ${muted}`}>{a.label}</p>
                  <AnswerValue type={a.type} value={a.value} photoUrl={photoUrl} />
                </div>
              ))}
            </div>
          ))}
        </Section>
      ))}
    </div>
  );
}
