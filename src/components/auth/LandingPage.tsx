"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { AuthDialog } from "./AuthDialog";
import { loginAsGuest } from "@/actions";

export function LandingPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<"signin" | "signup">("signin");
  const [isPending, startTransition] = useTransition();

  const openSignIn = () => {
    setDialogMode("signin");
    setDialogOpen(true);
  };

  const openSignUp = () => {
    setDialogMode("signup");
    setDialogOpen(true);
  };

  const handleGuestLogin = () => {
    startTransition(async () => {
      await loginAsGuest();
    });
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="flex flex-col items-center gap-6 text-center max-w-md">
        <div className="flex flex-col items-center gap-2">
          <h1 className="text-4xl font-bold tracking-tight">UIGen</h1>
          <p className="text-muted-foreground text-lg">
            AI-powered React component generation with live preview
          </p>
        </div>

        <div className="flex flex-col gap-3 w-full max-w-xs">
          <Button size="lg" onClick={openSignUp}>
            Sign Up
          </Button>
          <Button size="lg" variant="outline" onClick={openSignIn}>
            Log In
          </Button>
          <Button
            size="lg"
            variant="ghost"
            onClick={handleGuestLogin}
            disabled={isPending}
          >
            {isPending ? "Signing in..." : "Continue as Guest"}
          </Button>
        </div>
      </div>

      <AuthDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        defaultMode={dialogMode}
      />
    </div>
  );
}
