import { CircleAlert, CircleCheck, CircleDashed, CircleX } from "lucide-react";
import { Badge } from "./ui/Misc";
import type { Integrity } from "../api/types";

// Unavailable (file could not be read) is deliberately distinct from a mismatch: it is not evidence of tampering.
export function IntegrityBadge({ value }: { value: Integrity }) {
  if (value === "match") return <Badge tone="success" icon={CircleCheck}>Verified</Badge>;
  if (value === "mismatch") return <Badge tone="danger" icon={CircleX}>Mismatch detected</Badge>;
  if (value === "unreadable") return <Badge tone="info" icon={CircleAlert}>Unavailable</Badge>;
  return <Badge tone="warning" icon={CircleDashed}>Not yet verified</Badge>;
}