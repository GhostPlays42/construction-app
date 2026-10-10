import type { SitePhotosPayload } from "./types";

export const MAX_PHOTOS = 20;

// Plain-words messages for the short codes the database and these checks use.
export const SITE_PHOTO_MESSAGES: Record<string, string> = {
  photo_or_notes_required: "Add a photo or write some notes.",
  too_many_photos: `That's too many photos for one send. Keep it to ${MAX_PHOTOS}, then send the rest.`,
  notes_too_long: "Keep the notes under 4000 characters.",
  caption_too_long: "Keep each caption under 300 characters.",
  photo_missing: "A photo didn't finish uploading. Check with your office.",
  upload_refused: "A photo was turned away when sending. Check with your office.",
  flha_required: "Do your FLHA for this job first.",
  job_not_available: "You're no longer on this job. Check with your office.",
  item_not_available: "The office changed a cost code while this was waiting. Check with your office.",
  bad_time: "Your phone's clock was wrong when you filled this in. Check with your office.",
  no_access: "Your access is turned off. Check with your office.",
  missing_id: "Something went wrong saving this. Check with your office.",
};

export function sitePhotoMessage(code: string): string {
  return SITE_PHOTO_MESSAGES[code] ?? "Something went wrong sending this. Check with your office.";
}

// The same checks the database makes, run on the phone so a worker with no
// signal finds out straight away. Returns a code, or null when it's ready.
export function checkSitePhotos(p: SitePhotosPayload): string | null {
  if (p.photos.length === 0 && !p.notes.trim()) return "photo_or_notes_required";
  if (p.photos.length > MAX_PHOTOS) return "too_many_photos";
  if (p.notes.trim().length > 4000) return "notes_too_long";
  if (p.photos.some((ph) => ph.caption.trim().length > 300)) return "caption_too_long";
  return null;
}

// Where a photo is kept in the site-photos bucket.
export function photoPath(companyId: string, entryId: string, photoId: string) {
  return `${companyId}/${entryId}/${photoId}.jpg`;
}

// Photos are shrunk on the phone before they're saved, so they send quickly
// on a weak signal and take less room. Long side 1600 pixels is plenty to
// read a site photo full screen.
const LONG_SIDE = 1600;
const QUALITY = 0.8;

export async function shrinkPhoto(file: Blob, longSide = LONG_SIDE): Promise<Blob> {
  // Browsers turn the photo upright from the camera's orientation tag here.
  const image = await createImageBitmap(file);
  const scale = Math.min(1, longSide / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale);
  canvas.getContext("2d")!.drawImage(image, 0, 0, canvas.width, canvas.height);
  image.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("shrink_failed"))), "image/jpeg", QUALITY),
  );
}
