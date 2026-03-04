import { getUser } from "@/actions";
import { getProject } from "@/actions/get-project";
import { MainContentLoader } from "@/app/main-content-loader";
import { redirect } from "next/navigation";
import { isMockProvider } from "@/lib/provider";

interface PageProps {
  params: Promise<{ projectId: string }>;
}

export default async function ProjectPage({ params }: PageProps) {
  const { projectId } = await params;
  const user = await getUser();

  if (!user) {
    redirect("/");
  }

  let project;
  try {
    project = await getProject(projectId);
  } catch {
    redirect("/");
  }

  return <MainContentLoader user={user} project={project} isMock={isMockProvider()} />;
}
