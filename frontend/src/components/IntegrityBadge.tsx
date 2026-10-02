import { CircleAlert, CircleCheck, CircleDashed, CircleX } from "lucide-react";
import { Badge } from "./ui/Misc";
import type { Integrity } from "../api/types";

export function IntegrityBadge({ value }: { value: Integrity }) {
  if (value === "match") return <Badge tone="success" icon={CircleCheck}>Verified</Badge>;
  if (value === "mismatch") return <Badge tone="danger" icon={CircleX}>Hash mismatch</Badge>;
  if (value === "unreadable") return <Badge tone="danger" icon={CircleAlert}>File unreadable</Badge>;
  return <Badge tone="warning" icon={CircleDashed}>Not yet verified</Badge>;
}