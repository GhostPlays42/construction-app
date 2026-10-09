"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { todayISO } from "@/lib/dates";
import { JOB_PICK_COOKIE } from "./job-pick";

// Remembers which job a worker on several jobs picked, for today only.
// It only chooses between jobs the worker can already see; row level
// security decides which jobs those are.
export async function pickJob(jobId: string) {
  const store = await cookies();
  store.set(JOB_PICK_COOKIE, `${todayISO()}_${jobId}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24,
  });
  redirect("/");
}

export async function switchJob() {
  const store = await cookies();
  store.delete(JOB_PICK_COOKIE);
  redirect("/");
}
