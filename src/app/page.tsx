import { getUser } from "@/actions";
import { getProjects } from "@/actions/get-projects";
import { LandingPage } from "@/components/auth/LandingPage";
import { ProjectDashboard } from "@/components/dashboard/ProjectDashboard";

export default async function Home() {
  const user = await getUser();
  if (!user) return <LandingPage />;

  const projects = await getProjects();
  return <ProjectDashboard projects={projects} userEmail={user.email} />;
}
