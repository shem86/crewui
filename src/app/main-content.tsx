"use client";

import { useState } from "react";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { FileSystemProvider, useFileSystem } from "@/lib/contexts/file-system-context";
import { ChatProvider } from "@/lib/contexts/chat-context";
import { ChatInterface } from "@/components/chat/ChatInterface";
import { FileTree } from "@/components/editor/FileTree";
import { CodeEditor } from "@/components/editor/CodeEditor";
import { PreviewFrame } from "@/components/preview/PreviewFrame";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HeaderActions } from "@/components/HeaderActions";
import Link from "next/link";

interface MainContentProps {
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

function RightPanel({
  user,
  projectId,
}: {
  user: MainContentProps["user"];
  projectId?: string;
}) {
  const [activeView, setActiveView] = useState<"preview" | "code">("preview");
  const { getAllFiles, refreshTrigger: _ } = useFileSystem();
  const hasFiles = getAllFiles().size > 0;

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Top Bar */}
      <div className="h-14 border-b border-neutral-200/60 px-6 flex items-center justify-between bg-neutral-50/50">
        {hasFiles ? (
          <Tabs
            value={activeView}
            onValueChange={(v) => setActiveView(v as typeof activeView)}
          >
            <TabsList className="bg-white/60 border border-neutral-200/60 p-0.5 h-9 shadow-sm">
              <TabsTrigger
                value="preview"
                className="data-[state=active]:bg-white data-[state=active]:text-neutral-900 data-[state=active]:shadow-sm text-neutral-600 px-4 py-1.5 text-sm font-medium transition-all"
              >
                Preview
              </TabsTrigger>
              <TabsTrigger
                value="code"
                className="data-[state=active]:bg-white data-[state=active]:text-neutral-900 data-[state=active]:shadow-sm text-neutral-600 px-4 py-1.5 text-sm font-medium transition-all"
              >
                Code
              </TabsTrigger>
            </TabsList>
          </Tabs>
        ) : (
          <div />
        )}
        <HeaderActions user={user} projectId={projectId} />
      </div>

      {/* Content Area */}
      <div className="flex-1 overflow-hidden bg-neutral-50">
        {!hasFiles || activeView === "preview" ? (
          <div className="h-full bg-white">
            <PreviewFrame />
          </div>
        ) : (
          <ResizablePanelGroup direction="horizontal" className="h-full">
            {/* File Tree */}
            <ResizablePanel defaultSize={30} minSize={20} maxSize={50}>
              <div className="h-full bg-neutral-50 border-r border-neutral-200">
                <FileTree />
              </div>
            </ResizablePanel>

            <ResizableHandle className="w-[1px] bg-neutral-200 hover:bg-neutral-300 transition-colors" />

            {/* Code Editor */}
            <ResizablePanel defaultSize={70}>
              <div className="h-full bg-white">
                <CodeEditor />
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        )}
      </div>
    </div>
  );
}

export function MainContent({ user, project, isMock }: MainContentProps) {
  return (
    <FileSystemProvider initialData={project?.data}>
      <ChatProvider projectId={project?.id} initialMessages={project?.messages} initialAgentEventRuns={project?.agentEvents}>
        <div className="h-screen w-screen overflow-hidden bg-neutral-50">
          <ResizablePanelGroup direction="horizontal" className="h-full">
            {/* Left Panel - Chat */}
            <ResizablePanel defaultSize={35} minSize={25} maxSize={50}>
              <div className="h-full flex flex-col bg-white">
                {/* Chat Header */}
                <div className="h-14 flex items-center justify-between px-6 border-b border-neutral-200/60">
                  <Link href="/" className="text-lg font-semibold text-neutral-900 tracking-tight hover:opacity-75 transition-opacity">
                    CrewUI
                  </Link>
                  {isMock && (
                    <div className="relative group">
                      <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200 text-xs font-medium text-amber-700 select-none cursor-default">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                        Demo mode
                      </span>
                      <div className="absolute right-0 top-full mt-2 w-64 px-3 py-2 rounded-lg bg-neutral-900 text-white text-xs leading-relaxed shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-50">
                        <p className="font-medium mb-1">No API key detected</p>
                        <p className="text-neutral-300">Running scripted mock responses. Add <code className="font-mono bg-neutral-700 px-1 rounded">ANTHROPIC_API_KEY</code> to <code className="font-mono bg-neutral-700 px-1 rounded">.env</code> to use Claude.</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Chat Content */}
                <div className="flex-1 overflow-hidden">
                  <ChatInterface />
                </div>
              </div>
            </ResizablePanel>

            <ResizableHandle className="w-[1px] bg-neutral-200 hover:bg-neutral-300 transition-colors" />

            {/* Right Panel - Preview/Code */}
            <ResizablePanel defaultSize={65}>
              <RightPanel user={user} projectId={project?.id} />
            </ResizablePanel>
          </ResizablePanelGroup>
        </div>
      </ChatProvider>
    </FileSystemProvider>
  );
}
