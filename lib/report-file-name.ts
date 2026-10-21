/** "Team Nova-GIG-7K3QPA" — a team report's file name (without extension), safe on Windows, macOS and Linux. */
export function reportFileBase(teamName: string, entryCode: string): string {
  // eslint-disable-next-line no-control-regex
  const name = teamName.replace(/[\\/:*?"<>|\u0000-\u001f]/g, "").replace(/\s+/g, " ").trim() || "Team";
  return `${name}-${entryCode}`;
}
