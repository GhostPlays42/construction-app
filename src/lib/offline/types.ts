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
  lists: {
    codes: { id: string; code: string; name: string }[];
    hazards: { id: string; name: string }[];
    ppe: { id: string; name: string }[];
  };
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

// A form saved on the phone that hasn't reached the office yet.
export type OutboxItem = {
  id: string;
  kind: "flha";
  userId: string;
  employeeId: string;
  createdAt: string;
  // "sent" stays on the phone until the phone's copy of the office data
  // shows it, so home never flickers back to "not done".
  status: "waiting" | "sent" | "failed";
  // Why it couldn't be sent, as a short code.
  error?: string;
  payload: FlhaPayload;
};
