// What a machine is doing right now. "On a job" isn't stored: a machine is
// on a job when it's ticked on one that's active.

export type EquipmentStatus = "down" | "on_job" | "available" | "off";

type JobLink = { jobs: { id: string; name: string; status: string } | null };

export function activeJobs(links: JobLink[]) {
  return links.flatMap((l) => (l.jobs && l.jobs.status === "active" ? [l.jobs] : []));
}

export function equipmentStatus(e: {
  is_active: boolean;
  down_for_repair: boolean;
  job_equipment: JobLink[];
}): EquipmentStatus {
  if (!e.is_active) return "off";
  if (e.down_for_repair) return "down";
  return activeJobs(e.job_equipment).length > 0 ? "on_job" : "available";
}

export const STATUS_LABEL: Record<EquipmentStatus, string> = {
  down: "Down for repair",
  on_job: "On a job",
  available: "Available",
  off: "Switched off",
};

export function describeMachine(e: {
  unit_number: string | null;
  name: string;
}): string {
  return e.unit_number ? `${e.unit_number} · ${e.name}` : e.name;
}
