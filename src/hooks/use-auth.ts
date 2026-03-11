"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn as signInAction, signUp as signUpAction } from "@/actions";
import { getAnonWorkData, clearAnonWork } from "@/lib/anon-work-tracker";
import { createProject } from "@/actions/create-project";

export function useAuth() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const handlePostSignIn = async () => {
    // Get any anonymous work
    const anonWork = getAnonWorkData();

    if (anonWork && anonWork.messages.length > 0) {
      // Create a project with the anonymous work
      const project = await createProject({
        name: `Design from ${new Date().toLocaleTimeString()}`,
        messages: anonWork.messages,
        data: anonWork.fileSystemData,
      });

      clearAnonWork();
      router.push(`/${project.id}`);
      return;
    }

    router.push("/");
  };

  const signIn = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const result = await signInAction(email, password);

      if (result.success) {
        await handlePostSignIn();
      }

      return result;
    } finally {
      setIsLoading(false);
    }
  };

  const signUp = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const result = await signUpAction(email, password);

      if (result.success) {
        await handlePostSignIn();
      }

      return result;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    signIn,
    signUp,
    isLoading,
  };
}
