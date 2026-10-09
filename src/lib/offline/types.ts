// What a worker's phone keeps so their screens work without signal.
export type WorkerSnapshot = {
  userId: string;
  employeeId: string;
  firstName: string;
  companyName: string;
  // When this copy came from the server.
  fetchedAt: string;
  jobs: { id: string; name: string; job_number: string | null; address: string | null; start_date: string | null }[];
  // This worker's recent FLHAs, so home knows what's done.
  flhas: { id: string; job_id: string; work_date: string; filled_at: string }[];
  // This worker's recent time cards, so they can see and change them.
  timeCards: TimeCardCopy[];
  lists: {
    codes: { id: string; code: string; name: string }[];
    hazards: { id: string; name: string }[];
    ppe: { id: string; name: string }[];
    // Active machines on the worker's jobs.
    equipment: { id: string; name: string; job_ids: string[] }[];
  };
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

// A form saved on the phone that hasn't reached the office yet.
export type OutboxItem = (
  | { kind: "flha"; payload: FlhaPayload }
  | { kind: "time-card"; payload: TimeCardPayload }
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
