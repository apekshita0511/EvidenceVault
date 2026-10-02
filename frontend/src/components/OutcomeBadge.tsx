import { CircleAlert, CircleCheck, CircleX } from "lucide-react";
import { Badge } from "./ui/Misc";

// Shown only for custody events that are verification outcomes.
export function OutcomeBadge({ action }: { action: string }) {
  if (action === "integrity_match") return <Badge tone="success" icon={CircleCheck}>Match</Badge>;
  if (action === "integrity_mismatch") return <Badge tone="danger" icon={CircleX}>Mismatch</Badge>;
  if (action === "integrity_unreadable") return <Badge tone="info" icon={CircleAlert}>Unavailable</Badge>;
  return null;
}