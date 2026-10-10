// Slip photos are kept a little sharper than site photos, so small print
// on the slip stays readable for the app and the office.
export const SLIP_LONG_SIDE = 2000;

// Where a slip's photo is kept in the slip-photos bucket.
export function slipPhotoPath(companyId: string, slipId: string) {
  return `${companyId}/${slipId}.jpg`;
}

// Plain-words messages for the short codes the database uses.
export const SLIP_MESSAGES: Record<string, string> = {
  trucking_company_required: "Enter the trucking company.",
  ticket_required: "Enter the ticket #.",
  amount_required: "Enter the loads or the tonnage.",
  bad_amount: "Check the loads and tonnage. They can't be negative or that large.",
  bad_slip_date: "Check the date on the slip.",
  too_long: "Keep each value under 200 characters.",
  already_checked: "This slip is already checked. Ask your office to make any changes.",
  not_found: "This slip isn't available. Check with your office.",
  photo_missing: "The slip photo didn't finish uploading. Check with your office.",
  upload_refused: "The slip photo was turned away when sending. Check with your office.",
  flha_required: "Do your FLHA for this job first.",
  job_not_available: "You're no longer on this job. Check with your office.",
  bad_time: "Your phone's clock was wrong when you took this. Check with your office.",
  no_access: "Your access is turned off. Check with your office.",
  missing_id: "Something went wrong saving this. Check with your office.",
};

export function slipMessage(code: string): string {
  return SLIP_MESSAGES[code] ?? "Something went wrong sending this. Check with your office.";
}
