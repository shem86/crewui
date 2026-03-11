"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, FolderOpen, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { createProject } from "@/actions/create-project";
import { signOut } from "@/actions";

interface ProjectDashboardProps {
  projects: { id: string; name: string; updatedAt: Date }[];
  userEmail: string;
}

function relativeTime(date: Date): string {
  const diffDays = Math.floor((Date.now() - date.getTime()) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 30) return `${diffDays} days ago`;
  const m = Math.floor(diffDays / 30);
  return `${m} month${m > 1 ? "s" : ""} ago`;
}

export function ProjectDashboard({ projects, userEmail }: ProjectDashboardProps) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [projectName, setProjectName] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const handleNewProject = () => {
    setProjectName("");
    setDialogOpen(true);
  };

  const handleCreateProject = async () => {
    setIsCreating(true);
    try {
      const name = projectName.trim() || `Design #${~~(Math.random() * 100000)}`;
      const project = await createProject({ name, messages: [], data: {} });
      setDialogOpen(false);
      router.push(`/${project.id}`);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Top bar */}
      <header className="border-b px-6 py-3 flex items-center justify-between">
        <Link href="/" className="font-semibold text-lg hover:opacity-75 transition-opacity">
          CrewUI
        </Link>
        <div className="flex items-center gap-3">
          <span className="text-sm text-muted-foreground">{userEmail}</span>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => signOut()} title="Sign out">
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-5xl mx-auto w-full px-6 py-10">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Your Projects</h1>
          <Button onClick={handleNewProject} className="gap-2">
            <Plus className="h-4 w-4" />
            New Project
          </Button>
        </div>

        {projects.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-4 text-center">
            <FolderOpen className="h-12 w-12 text-muted-foreground/50" />
            <div>
              <p className="text-lg font-medium">No projects yet</p>
              <p className="text-muted-foreground text-sm mt-1">Get started by creating your first project</p>
            </div>
            <Button onClick={handleNewProject} className="gap-2 mt-2">
              <Plus className="h-4 w-4" />
              Create your first project
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* New Project card */}
            <button
              onClick={handleNewProject}
              className="rounded-xl border border-dashed flex flex-col items-center justify-center gap-2 p-8 text-muted-foreground hover:text-foreground hover:border-foreground/30 hover:bg-accent/50 transition-colors min-h-[120px]">
              <Plus className="h-6 w-6" />
              <span className="text-sm font-medium">New Project</span>
            </button>

            {/* Project cards */}
            {projects.map((project) => (
              <Card
                key={project.id}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => router.push(`/${project.id}`)}>
                <CardHeader className="pb-2">
                  <CardTitle className="truncate text-base">{project.name}</CardTitle>
                </CardHeader>
                <CardContent>
                  <CardDescription>{relativeTime(new Date(project.updatedAt))}</CardDescription>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>

      {/* New project dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New Project</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="Project name"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !isCreating && handleCreateProject()}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={isCreating}>
              Cancel
            </Button>
            <Button onClick={handleCreateProject} disabled={isCreating}>
              {isCreating ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
