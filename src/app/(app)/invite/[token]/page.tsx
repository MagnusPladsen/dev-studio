"use client";

import { useParams } from "next/navigation";
import { InviteAccept } from "@/components/InviteAccept";

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  return <InviteAccept token={token} />;
}
