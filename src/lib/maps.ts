// A link that opens the address in the phone's map app (or Google Maps in a
// browser).
export function mapLink(address: string): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
}
