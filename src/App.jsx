import { useState } from "react";
import {
  Layers,
  FolderOpen,
  GitBranch,
  Save,
  Send,
  Plus,
  Trash2,
  GripVertical,
  Edit3,
  Eye,
  FileText,
  Settings,
  Check,
  ExternalLink,
  ChevronRight,
  Sparkles,
  LayoutGrid
} from "lucide-react";
import "./App.css";

// Initial mock state loaded from IATMSI-2027 pageRegistry.js and navigationData.js
const INITIAL_PAGES = [
  { id: "home", title: "Home", path: "/", sections: ["hero", "aboutConfSection", "programScheduleSection", "callForPapersSection", "themeTracksSection", "awardsContestSection", "supportersSection"] },
  { id: "about", title: "ABOUT IATMSI-2027", path: "/about", sections: ["hero", "aboutFullSection"] },
  { id: "history", title: "IATMSI HISTORY", path: "/about/history", sections: ["hero", "historySection"] },
  { id: "committee", title: "ORGANIZING COMMITTEE", path: "/committee", sections: ["hero", "committeeSection"] },
  { id: "track-chairs", title: "TRACK CHAIRS", path: "/about/track-chairs", sections: ["hero", "trackChairsSection"] },
  { id: "important-dates", title: "IMPORTANT DATES", path: "/important-dates", sections: ["hero", "importantDatesSection"] },
  { id: "paper-submission", title: "PAPER SUBMISSION", path: "/call-for-papers/paper-submission", sections: ["hero", "paperSubmissionSection"] },
  { id: "registration", title: "REGISTRATION", path: "/registration", sections: ["hero", "registrationSection"] },
  { id: "hardnovate", title: "HARDNOVATE CONTEST", path: "/awards/hardnovate", sections: ["hero", "hardnovateSection"] },
  { id: "rising-researcher", title: "RISING RESEARCHER AWARD", path: "/awards/rising-researcher", sections: ["hero", "risingResearcherSection"] },
  { id: "excellence-research", title: "EXCELLENCE IN RESEARCH AWARD", path: "/awards/excellence", sections: ["hero", "excellenceResearchSection"] },
  { id: "dissertation-award", title: "DOCTORAL DISSERTATION AWARD", path: "/awards/dissertation", sections: ["hero", "doctoralAwardSection"] },
  { id: "simulation-excellence", title: "SIMULATION EXCELLENCE AWARD", path: "/awards/simulation", sections: ["hero", "simulationAwardSection"] },
  { id: "best-paper", title: "BEST PAPER AWARDS", path: "/awards/best-paper", sections: ["hero", "bestPaperAwardSection"] },
  { id: "fellowships", title: "FELLOWSHIPS & GRANTS", path: "/awards/fellowships", sections: ["hero", "fellowshipsSection"] },
  { id: "sponsorship", title: "BE A SPONSOR OR PARTNER", path: "/sponsorship", sections: ["hero", "sponsorshipSection"] },
  { id: "call-for-reviewers", title: "CALL FOR REVIEWERS", path: "/call-for-reviewers", sections: ["hero", "callForReviewersSection"] },
  { id: "contact", title: "CONTACT US", path: "/contact", sections: ["hero", "contactSection"] },
  { id: "faqs", title: "FAQs", path: "/faqs", sections: ["hero", "faqsSection"] },
];

const AVAILABLE_SECTIONS = [
  { id: "hero", name: "Hero Carousel & CTA Banner" },
  { id: "intro", name: "Conference Rationale & Intro" },
  { id: "aboutFullSection", name: "About Full Details Block" },
  { id: "importantDatesSection", name: "Important Dates Timeline Table" },
  { id: "registrationSection", name: "Registration Fee Table & Process" },
  { id: "sponsorshipSection", name: "Sponsorship Flyer & Brochure Downloads" },
  { id: "hardnovateSection", name: "Hardnovate Contest & Themes" },
  { id: "risingResearcherSection", name: "Rising Researcher Award & Benefits" },
  { id: "excellenceResearchSection", name: "Excellence in Research Award" },
  { id: "doctoralAwardSection", name: "Doctoral Dissertation Award & Fee Waiver" },
  { id: "simulationAwardSection", name: "Simulation Excellence Award" },
  { id: "bestPaperAwardSection", name: "Best Paper Awards & Requirements" },
  { id: "fellowshipsSection", name: "Fellowship Program Tiers & Rules" },
  { id: "committeeSection", name: "Organizing Committee Grid" },
  { id: "contactSection", name: "Contact Info & Kathmandu Map Embed" },
  { id: "faqsSection", name: "Expandable Accordion FAQs" },
];

export default function App() {
  const [workspacePath, setWorkspacePath] = useState("c:/Github/IATMSI");
  const [pages, setPages] = useState(INITIAL_PAGES);
  const [selectedPageId, setSelectedPageId] = useState("home");
  const [activeTab, setActiveTab] = useState("sections"); // "sections" | "content" | "preview"
  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishSuccess, setPublishSuccess] = useState(false);
  const [newPageTitle, setNewPageTitle] = useState("");
  const [newPagePath, setNewPagePath] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);

  const selectedPage = pages.find((p) => p.id === selectedPageId) || pages[0];

  const handleAddPage = () => {
    if (!newPageTitle || !newPagePath) return;
    const id = newPageTitle.toLowerCase().replace(/[^a-z0-9]/g, "-");
    const newPage = {
      id,
      title: newPageTitle.toUpperCase(),
      path: newPagePath.startsWith("/") ? newPagePath : `/${newPagePath}`,
      sections: ["hero"],
    };
    setPages([...pages, newPage]);
    setSelectedPageId(id);
    setNewPageTitle("");
    setNewPagePath("");
    setShowAddModal(false);
  };

  const handleDeletePage = (id) => {
    if (pages.length <= 1) return;
    const filtered = pages.filter((p) => p.id !== id);
    setPages(filtered);
    if (selectedPageId === id) {
      setSelectedPageId(filtered[0].id);
    }
  };

  const handleMoveSection = (pageId, index, direction) => {
    const page = pages.find((p) => p.id === pageId);
    if (!page) return;
    const newSections = [...page.sections];
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= newSections.length) return;
    const temp = newSections[index];
    newSections[index] = newSections[targetIndex];
    newSections[targetIndex] = temp;

    setPages(
      pages.map((p) => (p.id === pageId ? { ...p, sections: newSections } : p))
    );
  };

  const handleAddSectionToPage = (sectionId) => {
    if (selectedPage.sections.includes(sectionId)) return;
    const updated = {
      ...selectedPage,
      sections: [...selectedPage.sections, sectionId],
    };
    setPages(pages.map((p) => (p.id === selectedPage.id ? updated : p)));
  };

  const handleRemoveSectionFromPage = (sectionId) => {
    const updated = {
      ...selectedPage,
      sections: selectedPage.sections.filter((s) => s !== sectionId),
    };
    setPages(pages.map((p) => (p.id === selectedPage.id ? updated : p)));
  };

  const handleSaveLocal = () => {
    setIsSaving(true);
    setTimeout(() => {
      setIsSaving(false);
    }, 600);
  };

  const handlePublishGit = () => {
    setIsPublishing(true);
    setPublishSuccess(false);
    setTimeout(() => {
      setIsPublishing(false);
      setPublishSuccess(true);
      setTimeout(() => setPublishSuccess(false), 3000);
    }, 1500);
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-neutral-950 text-neutral-100 font-sans text-xs">
      {/* 1. TOP HEADER BAR */}
      <header className="h-14 bg-neutral-900 border-b border-neutral-800 px-4 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-amber-500 to-rose-700 flex items-center justify-center text-white shadow-md">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h1 className="text-sm font-black tracking-widest uppercase bg-gradient-to-r from-amber-400 via-rose-300 to-amber-200 bg-clip-text text-transparent">
              WEAVR
            </h1>
            <p className="text-[10px] text-neutral-400 font-medium">
              No-Code Visual Editor & Site Studio
            </p>
          </div>

          <div className="ml-6 px-3 py-1 rounded-lg bg-neutral-800 border border-neutral-700 flex items-center gap-2 text-[11px] text-neutral-300">
            <FolderOpen className="w-3.5 h-3.5 text-amber-400" />
            <span className="font-mono text-neutral-400">{workspacePath}</span>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1 bg-neutral-950 p-1 rounded-xl border border-neutral-800">
          <button
            onClick={() => setActiveTab("sections")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition-all ${
              activeTab === "sections"
                ? "bg-amber-500 text-neutral-950 shadow-xs"
                : "text-neutral-400 hover:text-white"
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Section Stack</span>
          </button>

          <button
            onClick={() => setActiveTab("content")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition-all ${
              activeTab === "content"
                ? "bg-amber-500 text-neutral-950 shadow-xs"
                : "text-neutral-400 hover:text-white"
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Content Data</span>
          </button>

          <button
            onClick={() => setActiveTab("preview")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold transition-all ${
              activeTab === "preview"
                ? "bg-amber-500 text-neutral-950 shadow-xs"
                : "text-neutral-400 hover:text-white"
            }`}
          >
            <Eye className="w-3.5 h-3.5" />
            <span>Live Sandbox</span>
          </button>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={handleSaveLocal}
            disabled={isSaving}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-200 border border-neutral-700 font-bold transition-all"
          >
            <Save className="w-3.5 h-3.5 text-amber-400" />
            <span>{isSaving ? "Saving..." : "Save Local"}</span>
          </button>

          <button
            onClick={handlePublishGit}
            disabled={isPublishing}
            className="flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-gradient-to-r from-rose-700 to-amber-600 hover:from-rose-600 hover:to-amber-500 text-white font-bold shadow-md transition-all"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{isPublishing ? "Publishing..." : "Save & Publish"}</span>
          </button>

          {publishSuccess && (
            <span className="flex items-center gap-1 text-emerald-400 text-[11px] font-bold">
              <Check className="w-3.5 h-3.5" /> Published!
            </span>
          )}
        </div>
      </header>

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 flex overflow-hidden">
        {/* 2. LEFT SIDEBAR: PAGE ROUTE PALETTE */}
        <aside className="w-72 bg-neutral-900 border-r border-neutral-800 flex flex-col flex-shrink-0">
          <div className="p-3 border-b border-neutral-800 flex items-center justify-between">
            <div className="flex items-center gap-2 text-neutral-300 font-black uppercase text-[11px]">
              <LayoutGrid className="w-4 h-4 text-amber-400" />
              <span>Page Registry ({pages.length})</span>
            </div>
            <button
              onClick={() => setShowAddModal(true)}
              className="p-1 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-amber-400 transition-all"
              title="Add New Page Route"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {pages.map((p) => {
              const isSelected = p.id === selectedPageId;
              return (
                <div
                  key={p.id}
                  onClick={() => setSelectedPageId(p.id)}
                  className={`group p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                    isSelected
                      ? "bg-amber-500/10 border-amber-500/50 text-amber-300 shadow-xs"
                      : "bg-neutral-950/40 border-neutral-800/80 text-neutral-400 hover:bg-neutral-800/50 hover:text-neutral-200"
                  }`}
                >
                  <div className="flex items-center gap-2 overflow-hidden">
                    <ChevronRight
                      className={`w-3.5 h-3.5 flex-shrink-0 ${
                        isSelected ? "text-amber-400" : "text-neutral-600"
                      }`}
                    />
                    <div className="truncate">
                      <p className="font-black text-[11px] truncate">{p.title}</p>
                      <p className="font-mono text-[9px] text-neutral-500 truncate">
                        {p.path}
                      </p>
                    </div>
                  </div>

                  {pages.length > 1 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeletePage(p.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 text-neutral-500 hover:text-rose-400 transition-all"
                      title="Delete Page"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </aside>

        {/* 3. CENTER EDITOR CANVAS */}
        <main className="flex-1 flex flex-col bg-neutral-950 overflow-hidden">
          {/* Active Page Header Banner */}
          <div className="p-4 bg-neutral-900/60 border-b border-neutral-800 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-400 font-mono text-[10px] font-bold">
                  {selectedPage.path}
                </span>
                <h2 className="text-base font-black text-white">
                  {selectedPage.title}
                </h2>
              </div>
              <p className="text-[11px] text-neutral-400 mt-0.5">
                Active Sections: {selectedPage.sections.length} block(s) loaded
              </p>
            </div>

            <a
              href={`http://localhost:5173${selectedPage.path}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-xs text-amber-400 hover:underline font-semibold bg-neutral-800 px-3 py-1.5 rounded-lg border border-neutral-700"
            >
              <span>Open Route in Browser</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>

          {/* TAB 1: SECTION STACK BUILDER */}
          {activeTab === "sections" && (
            <div className="flex-1 flex overflow-hidden p-4 gap-6">
              {/* Active Stack Column */}
              <div className="flex-1 flex flex-col bg-neutral-900 rounded-2xl border border-neutral-800 overflow-hidden">
                <div className="p-3 border-b border-neutral-800 font-black text-neutral-300 uppercase tracking-wider text-[11px] flex items-center justify-between">
                  <span>Page Section Hierarchy (Drag & Reorder)</span>
                  <span className="text-[10px] text-neutral-500 font-normal">
                    {selectedPage.sections.length} Sections
                  </span>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {selectedPage.sections.map((secId, idx) => {
                    const meta = AVAILABLE_SECTIONS.find((s) => s.id === secId) || {
                      name: secId,
                    };
                    return (
                      <div
                        key={`${secId}-${idx}`}
                        className="bg-neutral-950 p-3.5 rounded-xl border border-neutral-800 flex items-center justify-between gap-3 shadow-xs hover:border-amber-500/40 transition-all"
                      >
                        <div className="flex items-center gap-3">
                          <GripVertical className="w-4 h-4 text-neutral-600 cursor-grab" />
                          <span className="w-6 h-6 rounded-lg bg-neutral-800 text-amber-400 flex items-center justify-center font-bold text-xs">
                            {idx + 1}
                          </span>
                          <div>
                            <p className="font-bold text-neutral-200">{meta.name}</p>
                            <p className="font-mono text-[10px] text-neutral-500">
                              id: {secId}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleMoveSection(selectedPage.id, idx, "up")}
                            disabled={idx === 0}
                            className="px-2 py-1 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-30 rounded-md text-neutral-300 text-xs font-bold"
                          >
                            ↑
                          </button>
                          <button
                            onClick={() => handleMoveSection(selectedPage.id, idx, "down")}
                            disabled={idx === selectedPage.sections.length - 1}
                            className="px-2 py-1 bg-neutral-800 hover:bg-neutral-700 disabled:opacity-30 rounded-md text-neutral-300 text-xs font-bold"
                          >
                            ↓
                          </button>
                          <button
                            onClick={() => handleRemoveSectionFromPage(secId)}
                            className="p-1.5 text-neutral-500 hover:text-rose-400 rounded-md hover:bg-neutral-800 transition-all ml-2"
                            title="Remove Section"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Section Palette Column */}
              <div className="w-80 flex flex-col bg-neutral-900 rounded-2xl border border-neutral-800 overflow-hidden flex-shrink-0">
                <div className="p-3 border-b border-neutral-800 font-black text-neutral-300 uppercase tracking-wider text-[11px]">
                  Available Section Palette
                </div>
                <div className="flex-1 overflow-y-auto p-3 space-y-2">
                  {AVAILABLE_SECTIONS.map((sec) => {
                    const isAdded = selectedPage.sections.includes(sec.id);
                    return (
                      <div
                        key={sec.id}
                        className={`p-3 rounded-xl border flex items-center justify-between transition-all ${
                          isAdded
                            ? "bg-neutral-950/60 border-neutral-800/60 opacity-50"
                            : "bg-neutral-950 border-neutral-800 hover:border-amber-500/40"
                        }`}
                      >
                        <div>
                          <p className="font-bold text-neutral-300 text-[11px]">{sec.name}</p>
                          <p className="font-mono text-[9px] text-neutral-500">{sec.id}</p>
                        </div>

                        <button
                          onClick={() => handleAddSectionToPage(sec.id)}
                          disabled={isAdded}
                          className={`p-1.5 rounded-lg border flex items-center justify-center transition-all ${
                            isAdded
                              ? "bg-neutral-800 border-neutral-700 text-neutral-500 cursor-not-allowed"
                              : "bg-amber-500/10 border-amber-500/40 text-amber-400 hover:bg-amber-500 hover:text-neutral-950"
                          }`}
                          title={isAdded ? "Already on page" : "Add to page"}
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: CONTENT DATA FORM INSPECTOR */}
          {activeTab === "content" && (
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              <div className="bg-neutral-900 p-6 rounded-2xl border border-neutral-800 space-y-4">
                <h3 className="text-sm font-black text-amber-400 uppercase tracking-wider border-b border-neutral-800 pb-3 flex items-center gap-2">
                  <Edit3 className="w-4 h-4" />
                  Edit Page Metadata & Header Config
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-bold text-neutral-400 mb-1">
                      Page Title
                    </label>
                    <input
                      type="text"
                      value={selectedPage.title}
                      onChange={(e) => {
                        const title = e.target.value;
                        setPages(
                          pages.map((p) =>
                            p.id === selectedPage.id ? { ...p, title } : p
                          )
                        );
                      }}
                      className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-3 py-2 text-neutral-200 font-semibold focus:outline-none focus:border-amber-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-neutral-400 mb-1">
                      Route Path
                    </label>
                    <input
                      type="text"
                      value={selectedPage.path}
                      onChange={(e) => {
                        const path = e.target.value;
                        setPages(
                          pages.map((p) =>
                            p.id === selectedPage.id ? { ...p, path } : p
                          )
                        );
                      }}
                      className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-3 py-2 text-neutral-200 font-semibold focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>
              </div>

              {/* Data Modules Reference Box */}
              <div className="bg-neutral-900 p-6 rounded-2xl border border-neutral-800 space-y-3">
                <h3 className="text-sm font-black text-amber-400 uppercase tracking-wider border-b border-neutral-800 pb-3">
                  Bound Data Modules (`src/data/`)
                </h3>
                <p className="text-xs text-neutral-400 font-medium leading-relaxed">
                  Weavr reads and updates named exports directly inside the target repository:
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-2">
                  <div className="p-3 bg-neutral-950 rounded-xl border border-neutral-800 font-mono text-[11px] text-amber-300">
                    conferenceData.js
                  </div>
                  <div className="p-3 bg-neutral-950 rounded-xl border border-neutral-800 font-mono text-[11px] text-amber-300">
                    committeeData.js
                  </div>
                  <div className="p-3 bg-neutral-950 rounded-xl border border-neutral-800 font-mono text-[11px] text-amber-300">
                    registrationData.js
                  </div>
                  <div className="p-3 bg-neutral-950 rounded-xl border border-neutral-800 font-mono text-[11px] text-amber-300">
                    sponsorshipData.js
                  </div>
                  <div className="p-3 bg-neutral-950 rounded-xl border border-neutral-800 font-mono text-[11px] text-amber-300">
                    fellowshipsData.js
                  </div>
                  <div className="p-3 bg-neutral-950 rounded-xl border border-neutral-800 font-mono text-[11px] text-amber-300">
                    hardnovateData.js
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: LIVE SANDBOX PREVIEW */}
          {activeTab === "preview" && (
            <div className="flex-1 bg-neutral-900 p-2 flex flex-col">
              <div className="h-8 bg-neutral-950 rounded-t-xl px-4 flex items-center justify-between border-b border-neutral-800 text-[11px] font-mono text-neutral-400">
                <span className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  Live Preview: http://localhost:5173{selectedPage.path}
                </span>
                <span>Vite Dev Sandbox</span>
              </div>
              <iframe
                src={`http://localhost:5173${selectedPage.path}`}
                title="Live Sandbox Preview"
                className="flex-1 w-full border-0 rounded-b-xl bg-white"
              />
            </div>
          )}
        </main>
      </div>

      {/* ADD PAGE MODAL */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-neutral-900 border border-neutral-700 rounded-2xl p-6 w-full max-w-md space-y-4 shadow-2xl">
            <h3 className="text-base font-black text-white uppercase tracking-wider border-b border-neutral-800 pb-3">
              Add New Page Route
            </h3>

            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-neutral-400 mb-1">
                  Page Title
                </label>
                <input
                  type="text"
                  placeholder="e.g. KEYNOTE SPEAKERS"
                  value={newPageTitle}
                  onChange={(e) => setNewPageTitle(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-3 py-2 text-neutral-200 font-semibold focus:outline-none focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-neutral-400 mb-1">
                  Route Path
                </label>
                <input
                  type="text"
                  placeholder="e.g. /speakers"
                  value={newPagePath}
                  onChange={(e) => setNewPagePath(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-700 rounded-xl px-3 py-2 text-neutral-200 font-semibold focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-800">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-bold text-xs"
              >
                Cancel
              </button>
              <button
                onClick={handleAddPage}
                className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-neutral-950 font-black text-xs shadow-md"
              >
                Create Page
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
