"use client";

import dynamic from "next/dynamic";

const MainContent = dynamic(
  () => import("./main-content").then((m) => ({ default: m.MainContent })),
  { ssr: false }
);

interface MainContentLoaderProps {
  user?: {
    id: string;
    email: string;
  } | null;
  project?: {
    id: string;
    name: string;
    messages: any[];
    data: any;
    agentEvents: any[][];
    createdAt: Date;
    updatedAt: Date;
  };
  isMock?: boolean;
}

export function MainContentLoader({ user, project, isMock }: MainContentLoaderProps) {
  return <MainContent user={user} project={project} isMock={isMock} />;
}
