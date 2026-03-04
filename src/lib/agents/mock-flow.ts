import type { VirtualFileSystem } from "@/lib/file-system";
import { AgentRole, type AgentStreamEvent, type AgentMessage, type WorkflowMode } from "@/lib/agents/types";
import { saveProjectState } from "@/lib/agents/save-project";

type RequestKind = "new" | "modify" | "fix";

function detectRequest(prompt: string): RequestKind {
  const lower = prompt.toLowerCase();
  const fixSignals = ["fix", "update color", "rename", "change text", "typo", "update label"];
  if (fixSignals.some((s) => lower.includes(s))) return "fix";
  const modifySignals = ["add", "change", "modify", "update", "extend", "improve", "enhance", "remove"];
  if (modifySignals.some((s) => lower.includes(s))) return "modify";
  return "new";
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// --- Pipeline / Tabs helpers ---

function getTabsDesignSpec(): string {
  return `## Design Specification: Tabs Component System

**Components:** Tabs, TabList, Tab, TabPanel, TabSwitcher, TabsContext
**Files:** 7 files in /components and /contexts

### Component Hierarchy
\`\`\`
<Tabs defaultTab="tab1">
  <TabList>
    <Tab id="tab1" label="Overview" />
    <Tab id="tab2" label="Settings" />
  </TabList>
  <TabPanel id="tab1">...</TabPanel>
  <TabPanel id="tab2">...</TabPanel>
</Tabs>
\`\`\`

### Props
- **Tabs:** \`defaultTab\` (string) — initial active tab id
- **Tab:** \`id\`, \`label\`, \`isActive\` (injected), \`onClick\` (injected)
- **TabPanel:** \`id\`, \`isActive\` (injected), \`children\`
- **TabSwitcher:** \`tabId\`, \`label\` — triggers tab switch via context

### State
- Active tab managed in \`Tabs\` via \`useState(defaultTab)\`
- Propagated to children via \`React.cloneElement\` and \`TabsContext\`

### ARIA Roles
- \`role="tablist"\` on TabList container
- \`role="tab"\` + \`aria-selected\` on each Tab button
- \`role="tabpanel"\` + \`aria-labelledby\` on each TabPanel
- \`aria-hidden="true"\` on inactive panels (remain in DOM)

### Tailwind Styling
- Active tab: \`border-blue-600 text-blue-600 font-semibold\`
- Inactive tab: \`border-transparent text-gray-600 hover:text-gray-900\`
- Panel: white background, rounded-lg, border-gray-200
- Responsive: \`p-4 md:p-8\` spacing`;
}

function getTabsFiles(): Record<string, string> {
  return {
    "/contexts/TabsContext.jsx": `import React, { createContext, useContext } from 'react';

const TabsContext = createContext(null);

export function TabsProvider({ children, activeTab, onTabChange }) {
  return (
    <TabsContext.Provider value={{ activeTab, onTabChange }}>
      {children}
    </TabsContext.Provider>
  );
}

export function useTab() {
  const context = useContext(TabsContext);
  if (!context) {
    throw new Error('useTab must be used within a Tabs component');
  }
  return context;
}
`,
    "/components/Tab.jsx": `import React from 'react';

export default function Tab({ id, label, isActive, onClick }) {
  return (
    <button
      id={id}
      onClick={onClick}
      role="tab"
      aria-selected={isActive}
      className={\`
        px-4 py-3 border-b-2 cursor-pointer transition-colors
        text-sm md:text-base flex items-center justify-center
        whitespace-nowrap
        \${
          isActive
            ? 'border-blue-600 text-blue-600 font-semibold'
            : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300 font-normal'
        }
      \`}
    >
      {label}
    </button>
  );
}
`,
    "/components/TabList.jsx": `import React from 'react';

export default function TabList({ children, activeTab, onTabChange }) {
  const enhancedChildren = React.Children.map(children, (child) => {
    if (!child || child.type.name !== 'Tab') return child;

    return React.cloneElement(child, {
      isActive: child.props.id === activeTab,
      onClick: () => onTabChange(child.props.id),
    });
  });

  return (
    <div
      className="flex flex-row border-b border-gray-200 overflow-x-auto"
      role="tablist"
    >
      {enhancedChildren}
    </div>
  );
}
`,
    "/components/TabPanel.jsx": `import React from 'react';

export default function TabPanel({ id, children, isActive }) {
  // Only render the panel content when active for better performance
  // The panel remains in the DOM but hidden for accessibility
  if (!isActive) {
    return (
      <div
        id={\`\${id}-panel\`}
        role="tabpanel"
        aria-labelledby={id}
        aria-hidden="true"
        className="hidden"
      />
    );
  }

  return (
    <div
      id={\`\${id}-panel\`}
      role="tabpanel"
      aria-labelledby={id}
      className="p-4 md:p-6"
    >
      {children}
    </div>
  );
}
`,
    "/components/TabSwitcher.jsx": `import React from 'react';
import { useTab } from '@/contexts/TabsContext';

export default function TabSwitcher({ tabId, label }) {
  const { onTabChange } = useTab();

  const handleClick = () => {
    onTabChange(tabId);
  };

  return (
    <button
      onClick={handleClick}
      className="px-4 py-2 bg-blue-600 text-white font-medium rounded-md hover:bg-blue-700 transition-colors text-sm"
    >
      {label}
    </button>
  );
}
`,
    "/components/Tabs.jsx": `import React, { useState } from 'react';
import { TabsProvider } from '@/contexts/TabsContext';

export default function Tabs({ defaultTab, children }) {
  const [activeTab, setActiveTab] = useState(defaultTab);

  const enhancedChildren = React.Children.map(children, (child) => {
    if (!child) return null;

    if (child.type.name === 'TabList') {
      return React.cloneElement(child, {
        activeTab,
        onTabChange: setActiveTab,
      });
    }

    if (child.type.name === 'TabPanel') {
      return React.cloneElement(child, {
        isActive: child.props.id === activeTab,
      });
    }

    return child;
  });

  return (
    <TabsProvider activeTab={activeTab} onTabChange={setActiveTab}>
      <div className="bg-white rounded-lg border border-gray-200">{enhancedChildren}</div>
    </TabsProvider>
  );
}
`,
    "/App.jsx": `import React from 'react';
import Tabs from '@/components/Tabs';
import TabList from '@/components/TabList';
import Tab from '@/components/Tab';
import TabPanel from '@/components/TabPanel';
import TabSwitcher from '@/components/TabSwitcher';

export default function App() {
  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Tabs Component Demo</h1>

        <Tabs defaultTab="tab1">
          <TabList>
            <Tab id="tab1" label="Overview" />
            <Tab id="tab2" label="Settings" />
            <Tab id="tab3" label="History" />
          </TabList>

          <TabPanel id="tab1">
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-gray-900">Overview</h2>
              <p className="text-gray-600">
                This is the overview tab content. It provides a general summary of the available features and functionality.
              </p>
              <p className="text-gray-600">
                You can organize your content into multiple tabs to keep your interface clean and organized.
              </p>
              <div className="pt-4 border-t border-gray-200">
                <p className="text-sm text-gray-600 mb-3">Try switching tabs from inside this tab:</p>
                <div className="flex flex-wrap gap-2">
                  <TabSwitcher tabId="tab2" label="Go to Settings" />
                  <TabSwitcher tabId="tab3" label="Go to History" />
                </div>
              </div>
            </div>
          </TabPanel>

          <TabPanel id="tab2">
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-gray-900">Settings</h2>
              <p className="text-gray-600">
                Configure your preferences and application settings here.
              </p>
              <div className="space-y-3">
                <label className="flex items-center space-x-3">
                  <input type="checkbox" className="w-4 h-4" defaultChecked />
                  <span className="text-gray-700">Enable notifications</span>
                </label>
                <label className="flex items-center space-x-3">
                  <input type="checkbox" className="w-4 h-4" />
                  <span className="text-gray-700">Dark mode</span>
                </label>
              </div>
              <div className="pt-4 border-t border-gray-200">
                <p className="text-sm text-gray-600 mb-3">Navigate to other tabs:</p>
                <div className="flex flex-wrap gap-2">
                  <TabSwitcher tabId="tab1" label="Back to Overview" />
                  <TabSwitcher tabId="tab3" label="View History" />
                </div>
              </div>
            </div>
          </TabPanel>

          <TabPanel id="tab3">
            <div className="space-y-4">
              <h2 className="text-xl font-semibold text-gray-900">History</h2>
              <p className="text-gray-600">
                View your recent activity and actions here.
              </p>
              <ul className="space-y-2">
                <li className="flex justify-between text-sm text-gray-600">
                  <span>Component created</span>
                  <span className="text-gray-500">Today</span>
                </li>
                <li className="flex justify-between text-sm text-gray-600">
                  <span>First interaction</span>
                  <span className="text-gray-500">Today</span>
                </li>
                <li className="flex justify-between text-sm text-gray-600">
                  <span>Initial setup</span>
                  <span className="text-gray-500">Today</span>
                </li>
              </ul>
              <div className="pt-4 border-t border-gray-200">
                <p className="text-sm text-gray-600 mb-3">Quick navigation:</p>
                <div className="flex flex-wrap gap-2">
                  <TabSwitcher tabId="tab1" label="Overview" />
                  <TabSwitcher tabId="tab2" label="Settings" />
                </div>
              </div>
            </div>
          </TabPanel>
        </Tabs>
      </div>
    </div>
  );
}
`,
  };
}

function getTabsQAReview(): string {
  return `## QA Review: Tabs Component System

**Verdict: APPROVED**

### Files Reviewed
1. \`/contexts/TabsContext.jsx\` — Context + provider + \`useTab\` hook
2. \`/components/Tab.jsx\` — Individual tab button with ARIA roles
3. \`/components/TabList.jsx\` — Tab container, injects isActive/onClick via cloneElement
4. \`/components/TabPanel.jsx\` — Panel with hidden/visible state, aria-labelledby
5. \`/components/TabSwitcher.jsx\` — Context-aware programmatic tab switcher
6. \`/components/Tabs.jsx\` — Root component, manages state, clones children
7. \`/App.jsx\` — Demo with 3 tabs and cross-tab navigation

### Checks Passed
- Proper ARIA roles: tablist, tab, tabpanel, aria-selected, aria-labelledby, aria-hidden
- Context-based programmatic switching works via TabSwitcher
- Tab panels remain in DOM with aria-hidden="true" for accessibility
- Responsive layout with md: breakpoints
- No unused imports or dead code
- Controlled state flows cleanly top-down via cloneElement + context

### Notes
- \`aria-controls\` linking tabs to panels could be added for stricter ARIA compliance (non-blocking)
- Minification may rename \`child.type.name\` checks in Tabs.jsx and TabList.jsx — consider using \`displayName\` if bundled for production`;
}

// --- Supervisor / Rating helpers ---

function getRatingDesignSpec(): string {
  return `## Design Specification: Rating Component

**Component:** Rating
**Files:** /components/Rating.jsx, /App.jsx

### Props
| Prop | Type | Default | Description |
|------|------|---------|-------------|
| initialRating | number | 0 | Starting rating value |
| maxStars | number | 5 | Total number of stars |
| onRatingChange | function | () => {} | Callback on rating change |
| readOnly | boolean | false | Disable interaction |
| size | 'sm' \\| 'md' \\| 'lg' | 'md' | Star size variant |
| color | string | 'yellow' | Fill color variant |
| showLabel | boolean | false | Show "Rating" label |
| showCount | boolean | false | Show numeric count display |
| count | number | 0 | Review count to display |

### State
- \`rating\` (number) — current selected rating
- \`hoverRating\` (number | null) — star being hovered

### Variants
| Prop | Values |
|------|--------|
| size | sm (w-4), md (w-5), lg (w-6) |
| color | yellow, blue, red, green, purple, orange, pink |

### Styling
- Stars use static color/focus-ring maps for Tailwind compilation safety
- Partial star support via overflow-hidden clip technique
- Interactive: cursor-pointer with hover:opacity-80
- Read-only: cursor-default, aria-disabled on buttons`;
}

function getRatingFiles(): Record<string, string> {
  return {
    "/components/Rating.jsx": `import React, { useState } from 'react';
import { Star } from 'lucide-react';

const Rating = ({
  initialRating = 0,
  maxStars = 5,
  onRatingChange = () => {},
  readOnly = false,
  size = 'md',
  color = 'yellow',
  showLabel = false,
  showCount = false,
  count = 0,
}) => {
  const [rating, setRating] = useState(initialRating);
  const [hoverRating, setHoverRating] = useState(null);

  // Size variants
  const sizeClasses = {
    sm: { star: 'w-4 h-4', gap: 'gap-1' },
    md: { star: 'w-5 h-5', gap: 'gap-1.5' },
    lg: { star: 'w-6 h-6', gap: 'gap-2' },
  };

  // Color variants for filled stars
  const colorClasses = {
    yellow: 'text-yellow-400',
    blue: 'text-blue-400',
    red: 'text-red-400',
    green: 'text-green-400',
    purple: 'text-purple-400',
    orange: 'text-orange-400',
    pink: 'text-pink-400',
  };

  // Focus ring color variants - static mapping for Tailwind compilation
  const focusRingClasses = {
    yellow: 'focus:ring-yellow-400',
    blue: 'focus:ring-blue-400',
    red: 'focus:ring-red-400',
    green: 'focus:ring-green-400',
    purple: 'focus:ring-purple-400',
    orange: 'focus:ring-orange-400',
    pink: 'focus:ring-pink-400',
  };

  const sizeConfig = sizeClasses[size] || sizeClasses.md;
  const colorClass = colorClasses[color] || colorClasses.yellow;
  const focusRingClass = focusRingClasses[color] || focusRingClasses.yellow;

  const currentRating = hoverRating !== null ? hoverRating : rating;

  const handleStarClick = (starIndex) => {
    if (readOnly) return;
    const newRating = starIndex + 1;
    setRating(newRating);
    onRatingChange(newRating);
  };

  const handleStarHover = (starIndex) => {
    if (readOnly) return;
    setHoverRating(starIndex + 1);
  };

  const handleMouseLeave = () => {
    setHoverRating(null);
  };

  const renderStar = (index) => {
    const isFilled = index < Math.floor(currentRating);
    const isPartial = index === Math.floor(currentRating) && currentRating % 1 !== 0;

    return (
      <button
        key={index}
        onClick={() => handleStarClick(index)}
        onMouseEnter={() => handleStarHover(index)}
        className={\`relative transition-colors duration-150 \${
          readOnly ? 'cursor-default' : 'cursor-pointer hover:opacity-80'
        } focus:outline-none focus:ring-2 focus:ring-offset-2 \${focusRingClass} rounded p-1\`}
        aria-label={\`Rate \${index + 1} out of \${maxStars}\`}
        aria-disabled={readOnly}
        disabled={false}
      >
        {/* Background empty star */}
        <Star
          className={\`\${sizeConfig.star} text-gray-300 transition-colors duration-150\`}
          fill="currentColor"
        />

        {/* Filled star overlay */}
        <div
          className={\`absolute top-1 left-1 overflow-hidden transition-all duration-150 \${
            isFilled ? 'w-full' : isPartial ? 'w-1/2' : 'w-0'
          }\`}
        >
          <Star
            className={\`\${sizeConfig.star} \${colorClass} transition-colors duration-150\`}
            fill="currentColor"
          />
        </div>
      </button>
    );
  };

  return (
    <div
      className="flex flex-row items-center gap-3"
      onMouseLeave={handleMouseLeave}
      role="group"
      aria-label="Rating"
    >
      {showLabel && (
        <label className="text-sm font-medium text-gray-700">Rating</label>
      )}

      <div className={\`flex \${sizeConfig.gap} p-2\`}>
        {Array.from({ length: maxStars }, (_, i) => renderStar(i))}
      </div>

      {showCount && (
        <div className="text-xs text-gray-600 ml-2 whitespace-nowrap">
          <span className="font-semibold text-gray-900">{currentRating.toFixed(1)}</span>
          <span className="text-gray-500"> / {maxStars}</span>
          {count > 0 && (
            <span className="text-gray-500 ml-1">({count})</span>
          )}
        </div>
      )}
    </div>
  );
};

export default Rating;
`,
    "/App.jsx": `import React, { useState } from 'react';
import Rating from '@/components/Rating';

export default function App() {
  const [rating1, setRating1] = useState(3);
  const [rating2, setRating2] = useState(4.5);
  const [rating3, setRating3] = useState(2);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-4xl font-bold text-slate-900 mb-2">Rating Component</h1>
        <p className="text-lg text-slate-600 mb-12">
          Interactive star rating component with multiple configurations
        </p>

        <div className="space-y-12">
          <div className="bg-white rounded-lg shadow-md p-8">
            <h2 className="text-xl font-semibold text-slate-900 mb-6">
              Example 1: Interactive Rating (Medium)
            </h2>
            <div className="flex justify-center">
              <Rating initialRating={rating1} onRatingChange={setRating1} size="md" color="yellow" />
            </div>
            <p className="text-center text-slate-600 mt-6">
              Current Rating: <span className="font-bold text-slate-900">{rating1}</span>
            </p>
          </div>

          <div className="bg-white rounded-lg shadow-md p-8">
            <h2 className="text-xl font-semibold text-slate-900 mb-6">
              Example 2: With Label & Count
            </h2>
            <div className="flex justify-center">
              <Rating
                initialRating={rating2}
                onRatingChange={setRating2}
                size="lg"
                color="yellow"
                showLabel={true}
                showCount={true}
                count={342}
              />
            </div>
            <p className="text-center text-slate-600 mt-6">
              Current Rating: <span className="font-bold text-slate-900">{rating2}</span>
            </p>
          </div>

          <div className="bg-white rounded-lg shadow-md p-8">
            <h2 className="text-xl font-semibold text-slate-900 mb-6">
              Example 3: Read-Only (Small)
            </h2>
            <div className="flex justify-center">
              <Rating
                initialRating={rating3}
                readOnly={true}
                size="sm"
                color="yellow"
                showLabel={true}
                showCount={true}
                count={128}
              />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-md p-8">
            <h2 className="text-xl font-semibold text-slate-900 mb-6">
              Example 4: Custom Color (Blue)
            </h2>
            <div className="flex justify-center">
              <Rating
                initialRating={4}
                onRatingChange={(r) => console.log('Blue rating:', r)}
                size="md"
                color="blue"
                showLabel={true}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
`,
  };
}

function getRatingQAInitialReview(): string {
  return `## QA Review: Rating Component

**Verdict: REVISION NEEDED**

### Issues Found

**[CRITICAL] Dynamic Tailwind class breaks compilation**
- \`focus:ring-\${color}-400\` is a dynamic class — Tailwind cannot statically analyze it at build time
- All dynamic color classes will be purged, causing missing focus ring styles in production
- **Fix:** Replace with a static lookup map: \`const focusRingClasses = { yellow: 'focus:ring-yellow-400', ... }\`

**[WARNING] Missing \`flex-row\` on rating container**
- The outer \`<div>\` uses \`flex\` but is missing an explicit \`flex-row\` direction
- On some configurations this may cause unexpected column layout
- **Fix:** Change to \`className="flex flex-row items-center gap-3"\`

**[WARNING] \`disabled={readOnly}\` hides buttons from screen readers**
- Using \`disabled\` on read-only star buttons removes them from the accessibility tree
- Screen reader users cannot perceive the current rating value
- **Fix:** Use \`aria-disabled={readOnly} disabled={false}\` and guard clicks in the handler`;
}

function getRatingQAFinalReview(): string {
  return `## QA Review: Rating Component (Revision)

**Verdict: APPROVED**

### Issues Resolved
- ✓ Dynamic Tailwind class replaced with static \`focusRingClasses\` lookup map — all color variants compile correctly
- ✓ \`flex-row\` added to container — layout is correct across all browser/config combinations
- ✓ Replaced \`disabled={readOnly}\` with \`aria-disabled={readOnly} disabled={false}\` — stars remain in accessibility tree for screen readers

### Checks Passed
- Component renders correctly in all 4 App.jsx examples
- Interactive rating: click and hover states work as expected
- Partial star rendering via overflow-hidden clip technique is accurate
- Read-only mode: cursor-default, no click/hover handling, stars accessible to screen readers
- Label and count display correctly at all size variants (sm/md/lg)
- All Tailwind classes are statically analyzable
- No unused imports or dead code`;
}

export async function runMockMultiAgentFlow(
  userContent: string,
  fileSystem: VirtualFileSystem,
  sendEvent: (e: AgentStreamEvent) => Promise<void>,
  writer: WritableStreamDefaultWriter,
  messages: any[],
  projectId?: string,
  mode: WorkflowMode = "pipeline"
) {
  (async () => {
    const collectedEvents: AgentMessage[] = [];
    const _send = sendEvent;
    sendEvent = async (e: AgentStreamEvent) => {
      collectedEvents.push({
        id: `agent-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        agent: e.agent,
        type: e.type,
        content: e.content || "",
        timestamp: Date.now(),
        toolName: e.toolName,
        toolArgs: e.toolArgs,
      });
      return _send(e);
    };
    try {
      const kind = detectRequest(userContent);

      if (mode === "pipeline") {
        // Always run full Design → Engineer → QA with Tabs demo

        // --- Design Agent ---
        await sendEvent({
          type: "agent_start",
          agent: AgentRole.DESIGN,
          content: `Analyzing request: "${userContent}"`,
        });
        await delay(600);

        await sendEvent({
          type: "agent_message",
          agent: AgentRole.DESIGN,
          content: getTabsDesignSpec(),
        });
        await delay(400);

        await sendEvent({
          type: "agent_tool_call",
          agent: AgentRole.DESIGN,
          content: "Created design specification",
          toolName: "create_design_spec",
          toolArgs: { component: "Tabs" },
        });
        await delay(300);

        await sendEvent({
          type: "agent_done",
          agent: AgentRole.DESIGN,
          content: "Design spec for Tabs ready — handing off to Engineer",
        });
        await delay(500);

        // --- Engineer Agent ---
        await sendEvent({
          type: "agent_start",
          agent: AgentRole.ENGINEER,
          content: "Building Tabs component system from design spec",
        });
        await delay(500);

        await sendEvent({
          type: "agent_message",
          agent: AgentRole.ENGINEER,
          content:
            "I'll implement the Tabs component system based on the design specification. Creating 6 component files plus the App entry point.",
        });
        await delay(400);

        const tabsFiles = getTabsFiles();
        const tabsFileOrder = [
          "/contexts/TabsContext.jsx",
          "/components/Tab.jsx",
          "/components/TabList.jsx",
          "/components/TabPanel.jsx",
          "/components/TabSwitcher.jsx",
          "/components/Tabs.jsx",
          "/App.jsx",
        ];

        for (const filePath of tabsFileOrder) {
          const content = tabsFiles[filePath];
          if (fileSystem.exists(filePath)) {
            fileSystem.updateFile(filePath, content);
          } else {
            fileSystem.createFileWithParents(filePath, content);
          }

          await sendEvent({
            type: "agent_tool_call",
            agent: AgentRole.ENGINEER,
            content: `Created ${filePath}`,
            toolName: "str_replace_editor",
            toolArgs: { command: "create", path: filePath },
          });
          await delay(350);
        }

        await sendEvent({
          type: "agent_done",
          agent: AgentRole.ENGINEER,
          content: "Implementation complete (7 files) — passing to QA for review",
        });
        await delay(500);

        // --- QA Agent ---
        await sendEvent({
          type: "agent_start",
          agent: AgentRole.QA,
          content: "Reviewing Tabs component system",
        });
        await delay(600);

        await sendEvent({
          type: "agent_message",
          agent: AgentRole.QA,
          content: getTabsQAReview(),
        });
        await delay(400);

        await sendEvent({
          type: "agent_tool_call",
          agent: AgentRole.QA,
          content: "Code approved!",
          toolName: "submit_review",
          toolArgs: { needsRevision: false },
        });
        await delay(300);

        await sendEvent({
          type: "agent_done",
          agent: AgentRole.QA,
          content: "Code approved — all checks passed!",
        });
        await delay(300);
      } else {
        // supervisor mode — Rating demo

        const routeMap = {
          new: {
            label: "Design → Engineer → QA",
            skipDesign: false,
            skipQA: false,
            reasoning:
              "This is a new component request — running the full pipeline with Design, Engineer, and QA.",
          },
          modify: {
            label: "Engineer → QA",
            skipDesign: true,
            skipQA: false,
            reasoning:
              "This looks like a feature addition to existing code — skipping Design, routing to Engineer → QA.",
          },
          fix: {
            label: "Engineer only",
            skipDesign: true,
            skipQA: true,
            reasoning: "Simple edit — Engineer only is sufficient.",
          },
        } as const;

        const { label, skipDesign, skipQA, reasoning } = routeMap[kind];

        // --- Orchestrator ---
        await sendEvent({
          type: "agent_start",
          agent: AgentRole.ORCHESTRATOR,
          content: "Analyzing request to determine workflow route...",
        });
        await delay(400);

        await sendEvent({
          type: "agent_message",
          agent: AgentRole.ORCHESTRATOR,
          content: reasoning,
        });
        await delay(300);

        await sendEvent({
          type: "agent_done",
          agent: AgentRole.ORCHESTRATOR,
          content: `Route: ${label}`,
        });
        await delay(300);

        // --- Design Agent (unless skipped) ---
        if (!skipDesign) {
          await sendEvent({
            type: "agent_start",
            agent: AgentRole.DESIGN,
            content: `Analyzing request: "${userContent}"`,
          });
          await delay(600);

          await sendEvent({
            type: "agent_message",
            agent: AgentRole.DESIGN,
            content: getRatingDesignSpec(),
          });
          await delay(400);

          await sendEvent({
            type: "agent_tool_call",
            agent: AgentRole.DESIGN,
            content: "Created design specification",
            toolName: "create_design_spec",
            toolArgs: { component: "Rating" },
          });
          await delay(300);

          await sendEvent({
            type: "agent_done",
            agent: AgentRole.DESIGN,
            content: "Design spec for Rating ready — handing off to Engineer",
          });
          await delay(500);
        }

        // --- Engineer Agent ---
        await sendEvent({
          type: "agent_start",
          agent: AgentRole.ENGINEER,
          content: skipDesign ? "Updating Rating component" : "Building Rating component from design spec",
        });
        await delay(500);

        await sendEvent({
          type: "agent_message",
          agent: AgentRole.ENGINEER,
          content: skipDesign
            ? "I'll update the Rating component as requested. Modifying the component and App files."
            : "I'll implement the Rating component based on the design specification. Creating the component file and the App entry point.",
        });
        await delay(400);

        const ratingFiles = getRatingFiles();
        const ratingFileOrder = ["/components/Rating.jsx", "/App.jsx"];

        for (const filePath of ratingFileOrder) {
          const content = ratingFiles[filePath];
          if (fileSystem.exists(filePath)) {
            fileSystem.updateFile(filePath, content);
          } else {
            fileSystem.createFileWithParents(filePath, content);
          }

          await sendEvent({
            type: "agent_tool_call",
            agent: AgentRole.ENGINEER,
            content: `Created ${filePath}`,
            toolName: "str_replace_editor",
            toolArgs: { command: "create", path: filePath },
          });
          await delay(350);
        }

        await sendEvent({
          type: "agent_done",
          agent: AgentRole.ENGINEER,
          content: skipQA ? "Implementation complete" : "Implementation complete — passing to QA for review",
        });
        await delay(500);

        if (!skipQA) {
          if (!skipDesign) {
            // Full pipeline ("new"): QA finds issues → Engineer revision → QA approves

            // QA phase 1
            await sendEvent({
              type: "agent_start",
              agent: AgentRole.QA,
              content: "Reviewing Rating implementation...",
            });
            await delay(600);

            await sendEvent({
              type: "agent_message",
              agent: AgentRole.QA,
              content: getRatingQAInitialReview(),
            });
            await delay(400);

            await sendEvent({
              type: "agent_tool_call",
              agent: AgentRole.QA,
              content: "Revision needed — sending back to Engineer",
              toolName: "submit_review",
              toolArgs: { needsRevision: true },
            });
            await delay(300);

            await sendEvent({
              type: "agent_done",
              agent: AgentRole.QA,
              content: "Revision needed — sending back to Engineer",
            });
            await delay(400);

            // Engineer revision
            await sendEvent({
              type: "agent_start",
              agent: AgentRole.ENGINEER,
              content: "Addressing QA feedback",
            });
            await delay(400);

            await sendEvent({
              type: "agent_message",
              agent: AgentRole.ENGINEER,
              content: "Fixing dynamic Tailwind class, layout, and accessibility issues",
            });
            await delay(400);

            // File was already written with the final correct content above
            fileSystem.updateFile("/components/Rating.jsx", ratingFiles["/components/Rating.jsx"]);

            await sendEvent({
              type: "agent_tool_call",
              agent: AgentRole.ENGINEER,
              content: "Updated /components/Rating.jsx",
              toolName: "str_replace_editor",
              toolArgs: { command: "str_replace", path: "/components/Rating.jsx" },
            });
            await delay(400);

            await sendEvent({
              type: "agent_done",
              agent: AgentRole.ENGINEER,
              content: "Revisions complete — returning to QA",
            });
            await delay(500);

            // QA phase 2
            await sendEvent({
              type: "agent_start",
              agent: AgentRole.QA,
              content: "Re-reviewing after revisions...",
            });
            await delay(500);

            await sendEvent({
              type: "agent_message",
              agent: AgentRole.QA,
              content: getRatingQAFinalReview(),
            });
            await delay(400);

            await sendEvent({
              type: "agent_tool_call",
              agent: AgentRole.QA,
              content: "Code approved!",
              toolName: "submit_review",
              toolArgs: { needsRevision: false },
            });
            await delay(300);

            await sendEvent({
              type: "agent_done",
              agent: AgentRole.QA,
              content: "Code approved!",
            });
            await delay(300);
          } else {
            // engineer_qa path ("modify"): QA approves directly, no revision
            await sendEvent({
              type: "agent_start",
              agent: AgentRole.QA,
              content: "Reviewing Rating update...",
            });
            await delay(600);

            await sendEvent({
              type: "agent_message",
              agent: AgentRole.QA,
              content: getRatingQAFinalReview(),
            });
            await delay(400);

            await sendEvent({
              type: "agent_tool_call",
              agent: AgentRole.QA,
              content: "Code approved!",
              toolName: "submit_review",
              toolArgs: { needsRevision: false },
            });
            await delay(300);

            await sendEvent({
              type: "agent_done",
              agent: AgentRole.QA,
              content: "Code approved — all checks passed!",
            });
            await delay(300);
          }
        }
      }

      // --- Workflow done ---
      await sendEvent({
        type: "workflow_done",
        agent: AgentRole.ORCHESTRATOR,
        content: JSON.stringify({
          files: fileSystem.serialize(),
          messageCount: 0,
        }),
      });

      // Save to project if applicable
      if (projectId) {
        const componentName = mode === "pipeline" ? "Tabs" : "Rating";
        const allMessages = [
          ...messages,
          {
            id: `multi-agent-${Date.now()}`,
            role: "assistant",
            content: `Multi-agent workflow completed. Created ${componentName} component system.`,
          },
        ];
        await saveProjectState(projectId, allMessages, fileSystem.serialize(), collectedEvents);
      }
    } catch (error) {
      console.error("Mock multi-agent workflow error:", error);
      await sendEvent({
        type: "workflow_done",
        agent: AgentRole.ORCHESTRATOR,
        content: JSON.stringify({ error: String(error) }),
      });
    } finally {
      try {
        await writer.close();
      } catch {
        // Already closed
      }
    }
  })();
}
