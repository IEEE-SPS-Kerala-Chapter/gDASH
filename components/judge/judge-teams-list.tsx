"use client";

import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { AdminTeam } from "@/app/actions/admin";

const STATUS_LABELS: Record<string, string> = {
  submitted: "Submitted",
  under_review: "Under review",
  shortlisted: "Shortlisted",
  rejected: "Rejected",
};

/** A judge's assigned teams — read-only status, click through to score. */
export function JudgeTeamsList({ teams }: { teams: AdminTeam[] }) {
  const router = useRouter();

  if (teams.length === 0) {
    return (
      <div className="rounded-md border bg-card py-10 text-center text-muted-foreground">
        No teams have been assigned to you yet.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {teams.map((team) => {
        const status = team.registration?.status ?? "submitted";
        const myScore = team.registration?.scores[0];
        return (
          <Card
            key={team.id}
            className="flex cursor-pointer flex-col gap-3 p-4 hover:border-primary"
            onClick={() => router.push(`/dashboard/teams/${team.id}`)}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-heading font-semibold">{team.name}</h3>
                <p className="text-sm text-muted-foreground">{team.ai_theme}</p>
              </div>
              <Badge variant="secondary">{STATUS_LABELS[status] ?? status}</Badge>
            </div>
            <div className="border-t pt-3 text-sm">
              {myScore ? (
                <span>
                  Your score: <span className="font-semibold">{myScore.weighted.toFixed(1)} / 10</span>
                </span>
              ) : (
                <span className="text-muted-foreground">Not scored yet</span>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
