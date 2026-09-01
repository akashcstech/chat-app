import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";
import { getSession } from "@/lib/chat-store";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Private Chat — Just the two of you" },
      {
        name: "description",
        content: "A minimal, secure private chat room built for exactly two people.",
      },
      { property: "og:title", content: "Private Chat — Just the two of you" },
      {
        property: "og:description",
        content: "A minimal, secure private chat room built for exactly two people.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  useEffect(() => {
    getSession().then((user) => {
      navigate({ to: user ? "/chat" : "/login", replace: true });
    });
  }, [navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Loader2 className="size-5 animate-spin text-muted-foreground" />
    </div>
  );
}
