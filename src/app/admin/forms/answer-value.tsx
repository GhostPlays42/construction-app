import { Signature } from "@/app/flha/signature-pad";
import { answerText, isBlank, type Answer } from "@/lib/forms";

const muted = "text-zinc-600 dark:text-zinc-400";

// One answer to a form question. `photoUrl` gives a viewable link for a
// photo's storage path.
export function AnswerValue({
  type,
  value,
  photoUrl,
}: {
  type: string;
  value: Answer | null | undefined;
  photoUrl: (path: string) => string | null;
}) {
  if (isBlank(value)) return <p className={muted}>No answer</p>;
  if (type === "signature" && typeof value === "string") return <Signature path={value} />;
  if (type === "photo" && Array.isArray(value)) {
    return (
      <div className="grid grid-cols-2 gap-3">
        {value.map((path, i) => {
          const url = photoUrl(path);
          return url ? (
            <a key={path} href={url} target="_blank" rel="noopener noreferrer" title="Open full size">
              {/* eslint-disable-next-line @next/next/no-img-element -- a private link that expires */}
              <img src={url} alt={`Photo ${i + 1}`} className="aspect-[4/3] w-full rounded-lg object-cover" />
            </a>
          ) : (
            <p key={path} className="flex aspect-[4/3] items-center justify-center rounded-lg bg-zinc-100 p-2 text-base dark:bg-zinc-900">
              Couldn&apos;t load
            </p>
          );
        })}
      </div>
    );
  }
  return <p className="whitespace-pre-line">{answerText(type, value)}</p>;
}

// Every photo path in a set of answers.
export function photoPaths(items: { type: string; value: Answer | null | undefined }[]): string[] {
  return items.flatMap((i) => (i.type === "photo" && Array.isArray(i.value) ? i.value : []));
}
