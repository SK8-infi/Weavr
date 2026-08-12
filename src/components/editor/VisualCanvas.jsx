import { useState } from 'react';
import { MousePointer, Check, Sparkles, Layers, ArrowUp, ArrowDown, Plus, Trash2 } from 'lucide-react';
import { useRegistry } from '../../context/RegistryContext';
import { useProject } from '../../context/ProjectContext';
import EditableText from './EditableText';
import SectionWrapper from './SectionWrapper';

export default function VisualCanvas({ viewportMode, onOpenBlockDrawer }) {
  const { selectedPage } = useRegistry();
  const { selectedRepo, workspacePath, setIsDirty } = useProject();
  const [lastEditedField, setLastEditedField] = useState(null);

  const handleFieldChange = (fieldName, newValue) => {
    setLastEditedField(fieldName);
    setIsDirty(true);
    setTimeout(() => setLastEditedField(null), 3000);
  };

  const viewportWidths = {
    desktop: 'w-full max-w-7xl h-full',
    tablet: 'w-[768px] h-full',
    mobile: 'w-[375px] h-full',
  };

  return (
    <div className="flex-1 bg-neutral-950 overflow-y-auto p-4 md:p-6 flex flex-col items-center">
      <div
        className={`transition-all duration-300 bg-[#FAF5EB] text-neutral-900 rounded-3xl shadow-2xl overflow-hidden border border-neutral-800 flex flex-col ${viewportWidths[viewportMode]}`}
      >
        {/* Workspace Connection & Visual Status Bar */}
        <div className="h-10 bg-neutral-900 px-4 border-b border-neutral-800 flex items-center justify-between flex-shrink-0 text-xs font-mono select-none">
          <div className="flex items-center gap-2 text-neutral-400 truncate">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse flex-shrink-0" />
            <span className="font-bold text-amber-400 truncate">
              {selectedRepo.fullName}
            </span>
            <span className="text-neutral-600">|</span>
            <span className="truncate">{workspacePath}</span>
          </div>

          <div className="flex items-center gap-3 text-[10px] text-neutral-400 font-sans">
            {lastEditedField && (
              <span className="flex items-center gap-1 text-emerald-400 font-bold bg-emerald-500/10 px-2.5 py-1 rounded-md border border-emerald-500/30 animate-fadeIn">
                <Check className="w-3 h-3" /> Edit Saved: {lastEditedField}
              </span>
            )}

            <div className="flex items-center gap-1 text-amber-400 font-bold bg-amber-500/10 px-2.5 py-1 rounded-md border border-amber-500/30">
              <MousePointer className="w-3 h-3" />
              <span>Click Any Text to Edit</span>
            </div>

            <button
              onClick={onOpenBlockDrawer}
              className="px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 rounded-lg font-bold transition-all cursor-pointer"
            >
              + Insert Block
            </button>
          </div>
        </div>

        {/* Authentic IEEE IATMSI Visual Site Canvas */}
        <div className="flex-1 overflow-y-auto">
          {/* Authentic Top Header */}
          <div className="bg-gradient-to-r from-[#722332] to-[#4A121A] p-4 text-white flex flex-col md:flex-row items-center justify-between gap-4 border-b-4 border-[#C59B27] px-8">
            <div className="flex items-center gap-3">
              <span className="w-10 h-10 rounded-xl bg-[#C59B27] text-[#4A121A] flex items-center justify-center font-black text-sm">
                IEEE
              </span>
              <div>
                <h1 className="text-lg font-black tracking-wide uppercase font-heading text-[#FFFDF9]">
                  <EditableText
                    value="IATMSI-2027"
                    onChange={(val) => handleFieldChange('Conference Title', val)}
                  />
                </h1>
                <p className="text-[10px] text-amber-200/80 font-medium">
                  <EditableText
                    value="May 20–22, 2027 • Kathmandu, Nepal"
                    onChange={(val) => handleFieldChange('Dates & Venue', val)}
                  />
                </p>
              </div>
            </div>

            <div className="flex items-center gap-4 text-xs font-bold text-[#FFFDF9]/90">
              <span>Home</span>
              <span>About</span>
              <span>Call for Papers</span>
              <span>Registration</span>
              <span>Awards</span>
              <span>Contact</span>
            </div>
          </div>

          {/* Page Route Title Banner */}
          <div className="bg-gradient-to-b from-[#FFFDF9] via-[#FAF5EB] to-[#F5EBDC] p-6 md:p-8 text-center border-b border-[#C59B27]/30">
            <span className="text-[10px] font-black uppercase tracking-widest text-[#FAF5EB] bg-[#722332] px-3.5 py-1 rounded-full shadow-xs inline-block mb-2">
              Route: {selectedPage.path}
            </span>
            <h2 className="text-2xl md:text-4xl font-black text-[#4A121A] font-heading uppercase tracking-wide">
              <EditableText
                value={selectedPage.title}
                onChange={(val) => handleFieldChange('Page Title', val)}
                placeholder="Click to edit page title..."
              />
            </h2>
          </div>

          {/* Render Sections in Stack Order */}
          <div className="p-4 md:p-8 space-y-10 min-h-[600px]">
            {selectedPage.sections.length === 0 ? (
              <div className="p-12 text-center border-2 border-dashed border-[#C59B27]/40 rounded-2xl text-neutral-600 bg-white">
                <p className="font-bold text-sm">No sections on this page yet.</p>
                <button
                  onClick={onOpenBlockDrawer}
                  className="mt-3 px-4 py-2 bg-[#722332] text-white rounded-xl font-bold text-xs shadow-md hover:bg-[#5B1824] transition-all cursor-pointer"
                >
                  + Insert Section Block
                </button>
              </div>
            ) : (
              selectedPage.sections.map((secId, idx) => (
                <SectionWrapper
                  key={`${secId}-${idx}`}
                  sectionId={secId}
                  index={idx}
                  totalSections={selectedPage.sections.length}
                  onOpenPalette={onOpenBlockDrawer}
                >
                  {/* 1. HERO SECTION */}
                  {secId === 'hero' && (
                    <div className="bg-white rounded-2xl p-6 md:p-10 border-2 border-[#C59B27]/40 shadow-sm space-y-6">
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-black uppercase tracking-widest text-[#FAF5EB] bg-[#722332] px-3.5 py-1 rounded-full shadow-xs">
                          <EditableText
                            value="Welcome to IATMSI 2027"
                            onChange={(val) => handleFieldChange('Hero Badge', val)}
                          />
                        </span>
                      </div>
                      <h1 className="text-2xl md:text-4xl font-black text-[#4A121A] font-heading leading-tight uppercase">
                        <EditableText
                          value="IEEE International Conference on Advances in Technology, Management & Applied Science"
                          onChange={(val) => handleFieldChange('Hero Heading', val)}
                        />
                      </h1>
                      <p className="text-xs md:text-sm text-neutral-700 font-medium leading-relaxed bg-gradient-to-br from-[#FFFDF9] via-[#FAF5EB] to-[#F5EBDC] p-5 rounded-xl border border-[#C59B27]/40">
                        <EditableText
                          multiline
                          value="Jointly organized by ABV-IIITM Gwalior, India and partner institutions in Kathmandu, Nepal. Bringing together top researchers, faculty, and industry experts worldwide."
                          onChange={(val) => handleFieldChange('Hero Rationale', val)}
                        />
                      </p>
                      <div className="flex flex-wrap gap-4 pt-2">
                        <button className="bg-[#722332] text-[#FAF5EB] font-black px-6 py-3 rounded-xl text-xs md:text-sm uppercase tracking-wider border border-[#C59B27] shadow-sm">
                          <EditableText
                            value="Call for Papers →"
                            onChange={(val) => handleFieldChange('Primary CTA Button', val)}
                          />
                        </button>
                        <button className="bg-[#C59B27] text-[#4A121A] font-black px-6 py-3 rounded-xl text-xs md:text-sm uppercase tracking-wider shadow-sm">
                          <EditableText
                            value="Register Now"
                            onChange={(val) => handleFieldChange('Secondary CTA Button', val)}
                          />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* 2. ABOUT CONF SECTION */}
                  {secId === 'aboutConfSection' && (
                    <div className="bg-white rounded-2xl p-6 md:p-8 border-2 border-[#C59B27]/40 shadow-sm space-y-6">
                      <div className="border-b border-[#C59B27]/30 pb-4">
                        <span className="text-xs font-black uppercase tracking-widest text-[#FAF5EB] bg-[#722332] px-3.5 py-1 rounded-full shadow-xs inline-block mb-2">
                          <EditableText value="About Conference" onChange={(val) => handleFieldChange('About Tag', val)} />
                        </span>
                        <h3 className="text-xl md:text-2xl font-black text-[#4A121A] font-heading tracking-wide uppercase">
                          <EditableText
                            value="ABOUT THE CONFERENCE"
                            onChange={(val) => handleFieldChange('About Title', val)}
                          />
                        </h3>
                      </div>
                      <p className="text-xs md:text-sm text-neutral-800 font-medium leading-relaxed bg-gradient-to-br from-[#FFFDF9] via-[#FAF5EB] to-[#F5EBDC] p-5 rounded-xl border border-[#C59B27]/40">
                        <EditableText
                          multiline
                          value="The 5th IEEE International Conference on Interdisciplinary Approaches in Technology and Management for Social Innovation (IATMSI-2027) is globally recognized conference series organized under the aegis of the IEEE community."
                          onChange={(val) => handleFieldChange('About Description', val)}
                        />
                      </p>
                    </div>
                  )}

                  {/* 3. SPONSORSHIP SECTION */}
                  {secId === 'sponsorshipSection' && (
                    <div className="bg-white rounded-2xl p-6 md:p-8 border-2 border-[#C59B27]/40 shadow-sm space-y-6">
                      <div className="border-b border-[#C59B27]/30 pb-4">
                        <span className="text-xs font-black uppercase tracking-widest text-[#FAF5EB] bg-[#722332] px-3.5 py-1 rounded-full shadow-xs inline-block mb-2">
                          Partnership Opportunities
                        </span>
                        <h3 className="text-xl md:text-2xl font-black text-[#4A121A] font-heading tracking-wide uppercase">
                          <EditableText
                            value="Sponsorship Flyer & Brochure"
                            onChange={(val) => handleFieldChange('Sponsorship Title', val)}
                          />
                        </h3>
                      </div>
                      <p className="text-xs md:text-sm text-neutral-800 font-semibold leading-relaxed bg-gradient-to-br from-[#FFFDF9] via-[#FAF5EB] to-[#F5EBDC] p-4 md:p-5 rounded-xl border border-[#C59B27]/40">
                        <EditableText
                          multiline
                          value="We invite leading corporate organizations, academic institutions, and industry pioneers to partner with IEEE IATMSI-2027 as sponsors."
                          onChange={(val) => handleFieldChange('Sponsorship Intro', val)}
                        />
                      </p>
                    </div>
                  )}

                  {/* 4. HARDNOVATE CONTEST */}
                  {secId === 'hardnovateSection' && (
                    <div className="bg-white rounded-2xl p-6 md:p-8 border-2 border-[#C59B27]/40 shadow-sm space-y-6">
                      <div className="border-b border-[#C59B27]/30 pb-4">
                        <span className="text-xs font-black uppercase tracking-widest text-[#FAF5EB] bg-[#722332] px-3.5 py-1 rounded-full shadow-xs inline-block mb-2">
                          Hardware Innovation Stage
                        </span>
                        <h3 className="text-xl md:text-2xl font-black text-[#4A121A] font-heading tracking-wide uppercase">
                          <EditableText
                            value="Hardnovate Contest — Innovate. Build. Showcase."
                            onChange={(val) => handleFieldChange('Hardnovate Title', val)}
                          />
                        </h3>
                      </div>
                      <p className="text-xs md:text-sm text-neutral-800 font-bold p-4 rounded-xl bg-gradient-to-br from-[#FFFDF9] via-[#FAF5EB] to-[#F5EBDC] border border-[#C59B27]/40">
                        <EditableText
                          multiline
                          value="National-level hardware innovation contest for engineering minds, makers, and tinkerers at IATMSI-2027."
                          onChange={(val) => handleFieldChange('Hardnovate Subtitle', val)}
                        />
                      </p>
                    </div>
                  )}

                  {/* DEFAULT AUTHENTIC SECTION RENDERER */}
                  {secId !== 'hero' &&
                    secId !== 'aboutConfSection' &&
                    secId !== 'sponsorshipSection' &&
                    secId !== 'hardnovateSection' && (
                      <div className="bg-white rounded-2xl p-6 md:p-8 border-2 border-[#C59B27]/40 shadow-sm space-y-4">
                        <div className="border-b border-[#C59B27]/30 pb-3 flex items-center justify-between">
                          <h3 className="text-xl md:text-2xl font-black text-[#4A121A] font-heading uppercase tracking-wide">
                            <EditableText
                              value={`Conference Section — ${secId}`}
                              onChange={(val) => handleFieldChange(`Section ${secId}`, val)}
                            />
                          </h3>
                          <span className="text-[10px] font-mono text-neutral-500 bg-neutral-100 px-2 py-0.5 rounded border">
                            src/components/sections/{secId}.jsx
                          </span>
                        </div>
                        <div className="bg-gradient-to-br from-[#FFFDF9] via-[#FAF5EB] to-[#F5EBDC] p-5 rounded-xl border border-[#C59B27]/40">
                          <p className="text-xs md:text-sm text-neutral-800 font-medium leading-relaxed">
                            <EditableText
                              multiline
                              value={`Click anywhere on this text to edit content for section block '${secId}'. Live changes update target repository ${selectedRepo.name}.`}
                              onChange={(val) => handleFieldChange(`Section ${secId} Content`, val)}
                            />
                          </p>
                        </div>
                      </div>
                    )}
                </SectionWrapper>
              ))
            )}
          </div>

          {/* Authentic IEEE IATMSI Footer */}
          <div className="bg-gradient-to-r from-[#2C2627] to-[#1D1718] p-8 text-white border-t-4 border-[#C59B27] space-y-4 text-center">
            <p className="text-xs text-amber-200/80 font-bold uppercase tracking-widest">
              <EditableText
                value="IEEE IATMSI-2027 • ABV-IIITM Gwalior & Kathmandu Nepal"
                onChange={(val) => handleFieldChange('Footer Title', val)}
              />
            </p>
            <p className="text-[11px] text-neutral-400">
              <EditableText
                value="© 2027 IEEE IATMSI. All rights reserved. Supported by IEEE Region 10."
                onChange={(val) => handleFieldChange('Footer Rights', val)}
              />
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
