import { getUser } from "@/actions";
import { getProjects } from "@/actions/get-projects";
import { createProject } from "@/actions/create-project";
import { LandingPage } from "@/components/auth/LandingPage";
import { redirect } from "next/navigation";

export default async function Home() {
  const user = await getUser();

  if (!user) {
    return <LandingPage />;
  }

  const projects = await getProjects();

  if (projects.length > 0) {
    redirect(`/${projects[0].id}`);
  }

  const newProject = await createProject({
    name: `New Design #${~~(Math.random() * 100000)}`,
    messages: [],
    data: {},
  });

  redirect(`/${newProject.id}`);
}
