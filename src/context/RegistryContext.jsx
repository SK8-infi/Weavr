import { createContext, useContext, useState } from 'react';
import { useProject } from './ProjectContext';

const INITIAL_PAGES = [
  { id: 'home', title: 'Home', path: '/', sections: ['hero', 'aboutConfSection', 'programScheduleSection', 'callForPapersSection', 'themeTracksSection', 'awardsContestSection', 'supportersSection'] },
  { id: 'about', title: 'ABOUT IATMSI-2027', path: '/about', sections: ['hero', 'aboutFullSection'] },
  { id: 'history', title: 'IATMSI HISTORY', path: '/about/history', sections: ['hero', 'historySection'] },
  { id: 'committee', title: 'ORGANIZING COMMITTEE', path: '/committee', sections: ['hero', 'committeeSection'] },
  { id: 'track-chairs', title: 'TRACK CHAIRS', path: '/about/track-chairs', sections: ['hero', 'trackChairsSection'] },
  { id: 'important-dates', title: 'IMPORTANT DATES', path: '/important-dates', sections: ['hero', 'importantDatesSection'] },
  { id: 'paper-submission', title: 'PAPER SUBMISSION', path: '/call-for-papers/paper-submission', sections: ['hero', 'paperSubmissionSection'] },
  { id: 'registration', title: 'REGISTRATION', path: '/registration', sections: ['hero', 'registrationSection'] },
  { id: 'hardnovate', title: 'HARDNOVATE CONTEST', path: '/awards/hardnovate', sections: ['hero', 'hardnovateSection'] },
  { id: 'rising-researcher', title: 'RISING RESEARCHER AWARD', path: '/awards/rising-researcher', sections: ['hero', 'risingResearcherSection'] },
  { id: 'excellence-research', title: 'EXCELLENCE IN RESEARCH AWARD', path: '/awards/excellence', sections: ['hero', 'excellenceResearchSection'] },
  { id: 'dissertation-award', title: 'DOCTORAL DISSERTATION AWARD', path: '/awards/dissertation', sections: ['hero', 'doctoralAwardSection'] },
  { id: 'simulation-excellence', title: 'SIMULATION EXCELLENCE AWARD', path: '/awards/simulation', sections: ['hero', 'simulationAwardSection'] },
  { id: 'best-paper', title: 'BEST PAPER AWARDS', path: '/awards/best-paper', sections: ['hero', 'bestPaperAwardSection'] },
  { id: 'fellowships', title: 'FELLOWSHIPS & GRANTS', path: '/awards/fellowships', sections: ['hero', 'fellowshipsSection'] },
  { id: 'sponsorship', title: 'BE A SPONSOR OR PARTNER', path: '/sponsorship', sections: ['hero', 'sponsorshipSection'] },
  { id: 'call-for-reviewers', title: 'CALL FOR REVIEWERS', path: '/call-for-reviewers', sections: ['hero', 'callForReviewersSection'] },
  { id: 'contact', title: 'CONTACT US', path: '/contact', sections: ['hero', 'contactSection'] },
  { id: 'faqs', title: 'FAQs', path: '/faqs', sections: ['hero', 'faqsSection'] },
];

export const AVAILABLE_SECTIONS = [
  { id: 'hero', name: 'Hero Carousel & CTA Banner' },
  { id: 'intro', name: 'Conference Rationale & Intro' },
  { id: 'aboutFullSection', name: 'About Full Details Block' },
  { id: 'importantDatesSection', name: 'Important Dates Timeline Table' },
  { id: 'registrationSection', name: 'Registration Fee Table & Process' },
  { id: 'sponsorshipSection', name: 'Sponsorship Flyer & Brochure Downloads' },
  { id: 'hardnovateSection', name: 'Hardnovate Contest & Themes' },
  { id: 'risingResearcherSection', name: 'Rising Researcher Award & Benefits' },
  { id: 'excellenceResearchSection', name: 'Excellence in Research Award' },
  { id: 'doctoralAwardSection', name: 'Doctoral Dissertation Award & Fee Waiver' },
  { id: 'simulationAwardSection', name: 'Simulation Excellence Award' },
  { id: 'bestPaperAwardSection', name: 'Best Paper Awards & Requirements' },
  { id: 'fellowshipsSection', name: 'Fellowship Program Tiers & Rules' },
  { id: 'committeeSection', name: 'Organizing Committee Grid' },
  { id: 'contactSection', name: 'Contact Info & Kathmandu Map Embed' },
  { id: 'faqsSection', name: 'Expandable Accordion FAQs' },
];

const RegistryContext = createContext(null);

export function RegistryProvider({ children }) {
  const { setIsDirty } = useProject();
  const [pages, setPages] = useState(INITIAL_PAGES);
  const [selectedPageId, setSelectedPageId] = useState('home');

  const selectedPage = pages.find((p) => p.id === selectedPageId) || pages[0];

  const addPage = (title, path) => {
    const id = title.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const newPage = {
      id,
      title: title.toUpperCase(),
      path: path.startsWith('/') ? path : `/${path}`,
      sections: ['hero'],
    };
    setPages((prev) => [...prev, newPage]);
    setSelectedPageId(id);
    setIsDirty(true);
  };

  const deletePage = (id) => {
    if (pages.length <= 1) return;
    setPages((prev) => {
      const filtered = prev.filter((p) => p.id !== id);
      if (selectedPageId === id) {
        setSelectedPageId(filtered[0].id);
      }
      return filtered;
    });
    setIsDirty(true);
  };

  const moveSection = (pageId, index, direction) => {
    setPages((prev) =>
      prev.map((p) => {
        if (p.id !== pageId) return p;
        const newSections = [...p.sections];
        const targetIndex = direction === 'up' ? index - 1 : index + 1;
        if (targetIndex < 0 || targetIndex >= newSections.length) return p;
        const temp = newSections[index];
        newSections[index] = newSections[targetIndex];
        newSections[targetIndex] = temp;
        return { ...p, sections: newSections };
      })
    );
    setIsDirty(true);
  };

  const addSectionToPage = (sectionId) => {
    if (selectedPage.sections.includes(sectionId)) return;
    setPages((prev) =>
      prev.map((p) =>
        p.id === selectedPage.id
          ? { ...p, sections: [...p.sections, sectionId] }
          : p
      )
    );
    setIsDirty(true);
  };

  const removeSectionFromPage = (sectionId) => {
    setPages((prev) =>
      prev.map((p) =>
        p.id === selectedPage.id
          ? { ...p, sections: p.sections.filter((s) => s !== sectionId) }
          : p
      )
    );
    setIsDirty(true);
  };

  const updatePageMeta = (pageId, updates) => {
    setPages((prev) =>
      prev.map((p) => (p.id === pageId ? { ...p, ...updates } : p))
    );
    setIsDirty(true);
  };

  return (
    <RegistryContext.Provider
      value={{
        pages,
        selectedPageId,
        setSelectedPageId,
        selectedPage,
        addPage,
        deletePage,
        moveSection,
        addSectionToPage,
        removeSectionFromPage,
        updatePageMeta,
        availableSections: AVAILABLE_SECTIONS,
      }}
    >
      {children}
    </RegistryContext.Provider>
  );
}

export function useRegistry() {
  const context = useContext(RegistryContext);
  if (!context) throw new Error('useRegistry must be used within RegistryProvider');
  return context;
}
