// What a worker's phone keeps so their screens work without signal.
export type WorkerSnapshot = {
  userId: string;
  employeeId: string;
  firstName: string;
  companyName: string;
  // Missing on copies saved before site photos existed.
  companyId?: string;
  // When this copy came from the server.
  fetchedAt: string;
  jobs: { id: string; name: string; job_number: string | null; address: string | null; start_date: string | null }[];
  // This worker's recent FLHAs, so home knows what's done.
  flhas: { id: string; job_id: string; work_date: string; filled_at: string }[];
  // This worker's recent time cards, so they can see and change them.
  timeCards: TimeCardCopy[];
  // Recent safety meetings on the worker's jobs, run by anyone on the crew.
  safetyMeetings: { id: string; job_id: string; work_date: string; filled_at: string; led_by_name: string }[];
  // This worker's recent site photos & notes. Missing on older copies.
  siteEntries?: { id: string; job_id: string; work_date: string; filled_at: string }[];
  // This worker's recent trucking slips. Missing on older copies.
  truckingSlips?: {
    id: string;
    job_id: string;
    work_date: string;
    filled_at: string;
    status: "unchecked" | "checked";
    ticket_number: string | null;
  }[];
  // Where the office has sent this worker, today and the next two weeks.
  // Missing on older copies.
  schedule?: ScheduleDay[];
  // New chat messages from others, per job. Missing on older copies.
  chatUnread?: { job_id: string; unread: number }[];
  // Who is on each of the worker's active jobs, for the safety meeting sign-off.
  crews: { job_id: string; employee_id: string; full_name: string }[];
  lists: {
    codes: { id: string; code: string; name: string }[];
    hazards: { id: string; name: string }[];
    ppe: { id: string; name: string }[];
    // Active machines on the worker's jobs.
    equipment: { id: string; name: string; job_ids: string[] }[];
  };
};

export type ScheduleDay = {
  work_date: string;
  job_id: string;
  job_name: string;
  address: string | null;
  // "07:00:00", or null when no start time was set.
  start_time: string | null;
  notes: string | null;
};

// A time card as the office has it.
export type TimeCardCopy = {
  id: string;
  job_id: string;
  work_date: string;
  // "07:00:00"
  start_time: string;
  end_time: string;
  break_minutes: number;
  worked_minutes: number;
  status: "submitted" | "approved";
  filled_at: string;
  lines: { cost_code_id: string; code: string; name: string; minutes: number; description: string }[];
  equipment: { equipment_id: string; name: string; minutes: number }[];
};

export type FlhaPayload = {
  jobId: string;
  jobName: string;
  // The day it counts for and when it was filled in, on the phone.
  workDate: string;
  filledAt: string;
  tasks: string[];
  hazards: { hazard_id: string; control: string }[];
  otherHazard: string;
  otherControl: string;
  ppe: string[];
  signature: string;
};

export type TimeCardPayload = {
  jobId: string;
  jobName: string;
  workDate: string;
  // When this version was saved on the phone. A newer one replaces it.
  filledAt: string;
  // "07:00"
  start: string;
  end: string;
  breakMinutes: number;
  lines: { cost_code_id: string; minutes: number; description: string }[];
  equipment: { equipment_id: string; minutes: number }[];
};

export type SafetyMeetingPayload = {
  jobId: string;
  jobName: string;
  workDate: string;
  filledAt: string;
  hazards: string[];
  otherHazard: string;
  topic: string;
  // Each person present: their finger signature, or null when their name was tapped.
  attendees: { employee_id: string; signature: string | null }[];
};

export type SitePhotosPayload = {
  jobId: string;
  jobName: string;
  // Photos are stored in this company's folder.
  companyId: string;
  workDate: string;
  filledAt: string;
  notes: string;
  // Shrunk on the phone. "uploaded" is set once a photo reaches storage, so a
  // retry doesn't send it again.
  photos: { id: string; blob: Blob; costCodeId: string | null; caption: string; uploaded?: boolean }[];
};

export type TruckingSlipPayload = {
  jobId: string;
  jobName: string;
  companyId: string;
  workDate: string;
  filledAt: string;
  // Shrunk on the phone; "uploaded" once it reaches storage.
  photo: { blob: Blob; uploaded?: boolean };
};

// A form saved on the phone that hasn't reached the office yet.
export type OutboxItem = (
  | { kind: "flha"; payload: FlhaPayload }
  | { kind: "time-card"; payload: TimeCardPayload }
  | { kind: "safety-meeting"; payload: SafetyMeetingPayload }
  | { kind: "site-photos"; payload: SitePhotosPayload }
  | { kind: "trucking-slip"; payload: TruckingSlipPayload }
) & {
  id: string;
  userId: string;
  employeeId: string;
  createdAt: string;
  // "sent" stays on the phone until the phone's copy of the office data
  // shows it, so home never flickers back to "not done".
  status: "waiting" | "sent" | "failed";
  // Why it couldn't be sent, as a short code.
  error?: string;
};
