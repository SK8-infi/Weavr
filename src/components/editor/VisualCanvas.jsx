import { useRegistry } from '../../context/RegistryContext';
import SectionWrapper from './SectionWrapper';
import EditableText from './EditableText';

export default function VisualCanvas({ viewportMode, onOpenBlockDrawer }) {
  const { selectedPage } = useRegistry();

  const viewportWidths = {
    desktop: 'w-full max-w-7xl',
    tablet: 'w-[768px]',
    mobile: 'w-[375px]',
  };

  return (
    <div className="flex-1 bg-neutral-950 overflow-y-auto p-4 md:p-8 flex flex-col items-center">
      <div
        className={`transition-all duration-300 bg-[#FAF5EB] text-neutral-900 rounded-3xl shadow-2xl overflow-hidden border border-neutral-800 ${viewportWidths[viewportMode]}`}
      >
        {/* Rendered Visual Page Top Banner Header */}
        <div className="bg-gradient-to-r from-[#722332] to-[#4A121A] p-6 text-white text-center border-b-4 border-[#C59B27]">
          <span className="text-[10px] font-black tracking-widest uppercase bg-[#C59B27] text-neutral-950 px-3 py-0.5 rounded-full inline-block mb-2">
            IATMSI-2027 • May 20–22, 2027 • Kathmandu, Nepal
          </span>
          <h1 className="text-2xl md:text-3xl font-black font-heading uppercase tracking-wide">
            <EditableText value={selectedPage.title} placeholder="Enter Page Title..." />
          </h1>
          <p className="text-xs text-amber-200/80 font-mono mt-1">
            Route: {selectedPage.path}
          </p>
        </div>

        {/* Render Sections in Stack Order */}
        <div className="p-4 md:p-8 space-y-8 min-h-[600px]">
          {selectedPage.sections.length === 0 ? (
            <div className="p-12 text-center border-2 border-dashed border-neutral-300 rounded-2xl text-neutral-500">
              <p className="font-bold text-sm">No sections on this page yet.</p>
              <button
                onClick={onOpenBlockDrawer}
                className="mt-3 px-4 py-2 bg-[#722332] text-white rounded-xl font-bold text-xs shadow-md hover:bg-[#5B1824] transition-all cursor-pointer"
              >
                + Add Section Block
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
                {/* Mock Visual Renderers for Section Blocks */}
                {secId === 'hero' && (
                  <div className="bg-gradient-to-br from-[#FFFDF9] via-[#FAF5EB] to-[#F5EBDC] p-6 md:p-8 rounded-2xl border-2 border-[#C59B27]/40 shadow-sm space-y-4">
                    <span className="text-xs font-black uppercase tracking-widest text-[#FAF5EB] bg-[#722332] px-3.5 py-1 rounded-full shadow-xs inline-block">
                      Welcome to IATMSI 2027
                    </span>
                    <h2 className="text-xl md:text-3xl font-black text-[#4A121A] uppercase font-heading">
                      <EditableText value="IEEE International Conference on Advances in Technology, Management & Applied Science" />
                    </h2>
                    <p className="text-xs md:text-sm text-neutral-700 font-medium leading-relaxed">
                      <EditableText
                        multiline
                        value="Jointly organized by ABV-IIITM Gwalior, India and partner institutions in Kathmandu, Nepal. Bringing together top researchers, faculty, and industry experts."
                      />
                    </p>
                    <div className="flex gap-3 pt-2">
                      <button className="bg-[#722332] text-white font-bold px-5 py-2.5 rounded-xl text-xs shadow-md">
                        <EditableText value="Call for Papers →" />
                      </button>
                      <button className="bg-amber-600 text-white font-bold px-5 py-2.5 rounded-xl text-xs shadow-md">
                        <EditableText value="Register Now" />
                      </button>
                    </div>
                  </div>
                )}

                {secId === 'sponsorshipSection' && (
                  <div className="bg-white p-6 md:p-8 rounded-2xl border-2 border-[#C59B27]/40 shadow-sm space-y-4">
                    <span className="text-xs font-black uppercase tracking-widest text-[#FAF5EB] bg-[#722332] px-3.5 py-1 rounded-full shadow-xs inline-block">
                      Partnership Opportunities
                    </span>
                    <h3 className="text-xl md:text-2xl font-black text-[#4A121A] uppercase font-heading">
                      <EditableText value="Sponsorship Flyer & Brochure" />
                    </h3>
                    <p className="text-xs md:text-sm text-neutral-800 font-semibold p-4 rounded-xl bg-gradient-to-br from-[#FFFDF9] via-[#FAF5EB] to-[#F5EBDC] border border-[#C59B27]/40">
                      <EditableText
                        multiline
                        value="We invite leading corporate organizations, academic institutions, and industry pioneers to partner with IEEE IATMSI-2027 as sponsors."
                      />
                    </p>
                  </div>
                )}

                {secId === 'hardnovateSection' && (
                  <div className="bg-white p-6 md:p-8 rounded-2xl border-2 border-[#C59B27]/40 shadow-sm space-y-4">
                    <span className="text-xs font-black uppercase tracking-widest text-[#FAF5EB] bg-[#722332] px-3.5 py-1 rounded-full shadow-xs inline-block">
                      Hardware Innovation Stage
                    </span>
                    <h3 className="text-xl md:text-2xl font-black text-[#4A121A] uppercase font-heading">
                      <EditableText value="Hardnovate Contest — Innovate. Build. Showcase." />
                    </h3>
                    <p className="text-xs md:text-sm text-neutral-700 font-medium">
                      <EditableText
                        multiline
                        value="National-level hardware innovation contest for engineering minds, makers, and tinkerers at IATMSI-2027."
                      />
                    </p>
                  </div>
                )}

                {/* Default Fallback Renderer */}
                {secId !== 'hero' && secId !== 'sponsorshipSection' && secId !== 'hardnovateSection' && (
                  <div className="bg-white p-6 md:p-8 rounded-2xl border-2 border-[#C59B27]/40 shadow-sm space-y-3">
                    <h3 className="text-lg md:text-xl font-black text-[#4A121A] uppercase font-heading">
                      <EditableText value={`Visual Section Block — ${secId}`} />
                    </h3>
                    <p className="text-xs md:text-sm text-neutral-700 font-medium leading-relaxed">
                      <EditableText
                        multiline
                        value="Editable content block. Click anywhere on this text to edit headings, paragraphs, dates, or table data directly in place."
                      />
                    </p>
                  </div>
                )}
              </SectionWrapper>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
