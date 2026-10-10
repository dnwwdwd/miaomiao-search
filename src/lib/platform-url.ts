/** Extract the destination from a pasted URL, share message, or Markdown link. */
export function extractPlatformUrl(value: string): string {
  const markdownDestination = /\]\((https?:\/\/[^\s)]+)\)/i.exec(value)?.[1];
  const candidate = markdownDestination ?? value.match(/https?:\/\/[^\s，。；：！？）】》\])]+/i)?.[0] ?? value.trim();
  return candidate.replace(/\\([_&])/g, "$1").replace(/[.,;!?]+$/, "");
}
