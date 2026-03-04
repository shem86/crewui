import { getUser } from "@/actions";
import { getProjects } from "@/actions/get-projects";
import { createProject } from "@/actions/create-project";
import { MainContentLoader } from "./main-content-loader";
import { redirect } from "next/navigation";
import { isMockProvider } from "@/lib/provider";

export default async function Home() {
  const user = await getUser();

  // If user is authenticated, redirect to their most recent project
  if (user) {
    const projects = await getProjects();

    if (projects.length > 0) {
      redirect(`/${projects[0].id}`);
    }

    // If no projects exist, create a new one
    const newProject = await createProject({
      name: `New Design #${~~(Math.random() * 100000)}`,
      messages: [],
      data: {},
    });

    redirect(`/${newProject.id}`);
  }

  // For anonymous users, show the main content without a project
  return <MainContentLoader user={user} isMock={isMockProvider()} />;
}
