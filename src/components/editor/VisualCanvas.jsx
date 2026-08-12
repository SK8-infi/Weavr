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
        {/* Authentic IEEE IATMSI Header Top Bar */}
        <div className="bg-gradient-to-r from-[#722332] to-[#4A121A] p-4 text-white flex flex-col md:flex-row items-center justify-between gap-4 border-b-4 border-[#C59B27] px-8">
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-[#C59B27] text-[#4A121A] flex items-center justify-center font-black text-sm">
              IEEE
            </span>
            <div>
              <h1 className="text-lg font-black tracking-wide uppercase font-heading text-[#FFFDF9]">
                IATMSI-2027
              </h1>
              <p className="text-[10px] text-amber-200/80 font-medium">
                May 20–22, 2027 • Kathmandu, Nepal
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

        {/* Page Title Header */}
        <div className="bg-gradient-to-b from-[#FFFDF9] via-[#FAF5EB] to-[#F5EBDC] p-6 md:p-8 text-center border-b border-[#C59B27]/30">
          <span className="text-[10px] font-black uppercase tracking-widest text-[#FAF5EB] bg-[#722332] px-3.5 py-1 rounded-full shadow-xs inline-block mb-2">
            IATMSI 2027 Route: {selectedPage.path}
          </span>
          <h2 className="text-2xl md:text-4xl font-black text-[#4A121A] font-heading uppercase tracking-wide">
            <EditableText value={selectedPage.title} placeholder="Enter Page Title..." />
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
                        Flagship International Conference
                      </span>
                    </div>
                    <h1 className="text-2xl md:text-4xl font-black text-[#4A121A] font-heading leading-tight uppercase">
                      <EditableText value="IEEE International Conference on Advances in Technology, Management & Applied Science" />
                    </h1>
                    <p className="text-xs md:text-sm text-neutral-700 font-medium leading-relaxed bg-gradient-to-br from-[#FFFDF9] via-[#FAF5EB] to-[#F5EBDC] p-5 rounded-xl border border-[#C59B27]/40">
                      <EditableText
                        multiline
                        value="Jointly organized by ABV-IIITM Gwalior, India and partner institutions in Kathmandu, Nepal. Bringing together top researchers, faculty, and industry experts worldwide."
                      />
                    </p>
                    <div className="flex flex-wrap gap-4 pt-2">
                      <button className="bg-[#722332] text-[#FAF5EB] font-black px-6 py-3 rounded-xl text-xs md:text-sm uppercase tracking-wider border border-[#C59B27] shadow-sm">
                        <EditableText value="Call for Papers →" />
                      </button>
                      <button className="bg-[#C59B27] text-[#4A121A] font-black px-6 py-3 rounded-xl text-xs md:text-sm uppercase tracking-wider shadow-sm">
                        <EditableText value="Register Now" />
                      </button>
                    </div>
                  </div>
                )}

                {/* 2. SPONSORSHIP SECTION */}
                {secId === 'sponsorshipSection' && (
                  <div className="bg-white rounded-2xl p-6 md:p-8 border-2 border-[#C59B27]/40 shadow-sm space-y-6">
                    <div className="border-b border-[#C59B27]/30 pb-4">
                      <span className="text-xs font-black uppercase tracking-widest text-[#FAF5EB] bg-[#722332] px-3.5 py-1 rounded-full shadow-xs inline-block mb-2">
                        Partnership Opportunities
                      </span>
                      <h3 className="text-xl md:text-2xl font-black text-[#4A121A] font-heading tracking-wide uppercase">
                        <EditableText value="Sponsorship Flyer & Brochure" />
                      </h3>
                    </div>
                    <p className="text-xs md:text-sm text-neutral-800 font-semibold leading-relaxed bg-gradient-to-br from-[#FFFDF9] via-[#FAF5EB] to-[#F5EBDC] p-4 md:p-5 rounded-xl border border-[#C59B27]/40">
                      <EditableText
                        multiline
                        value="We invite leading corporate organizations, academic institutions, and industry pioneers to partner with IEEE IATMSI-2027 as sponsors."
                      />
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="bg-gradient-to-br from-[#FFFDF9] via-[#FAF5EB] to-[#F5EBDC] p-5 rounded-xl border border-[#C59B27]/40 space-y-2">
                        <h4 className="font-black text-[#4A121A] text-sm">
                          <EditableText value="Sponsorship Flyer PDF" />
                        </h4>
                        <button className="bg-[#722332] text-white text-xs font-bold px-4 py-2 rounded-lg">
                          Download Flyer (.pdf)
                        </button>
                      </div>
                      <div className="bg-gradient-to-br from-[#FFFDF9] via-[#FAF5EB] to-[#F5EBDC] p-5 rounded-xl border border-[#C59B27]/40 space-y-2">
                        <h4 className="font-black text-[#4A121A] text-sm">
                          <EditableText value="Sponsorship Brochure PDF" />
                        </h4>
                        <button className="bg-[#722332] text-white text-xs font-bold px-4 py-2 rounded-lg">
                          Download Brochure (.pdf)
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* 3. HARDNOVATE SECTION */}
                {secId === 'hardnovateSection' && (
                  <div className="bg-white rounded-2xl p-6 md:p-8 border-2 border-[#C59B27]/40 shadow-sm space-y-6">
                    <div className="border-b border-[#C59B27]/30 pb-4">
                      <span className="text-xs font-black uppercase tracking-widest text-[#FAF5EB] bg-[#722332] px-3.5 py-1 rounded-full shadow-xs inline-block mb-2">
                        Hardware Innovation Stage
                      </span>
                      <h3 className="text-xl md:text-2xl font-black text-[#4A121A] font-heading tracking-wide uppercase">
                        <EditableText value="Hardnovate Contest — Innovate. Build. Showcase." />
                      </h3>
                    </div>
                    <p className="text-xs md:text-sm text-neutral-800 font-bold p-4 rounded-xl bg-gradient-to-br from-[#FFFDF9] via-[#FAF5EB] to-[#F5EBDC] border border-[#C59B27]/40">
                      <EditableText
                        multiline
                        value="National-level hardware innovation contest for engineering minds, makers, and tinkerers at IATMSI-2027."
                      />
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className="bg-gradient-to-br from-[#FFFDF9] via-[#FAF5EB] to-[#F5EBDC] p-4 rounded-xl border border-[#C59B27]/40 text-center space-y-2">
                        <div className="w-10 h-10 rounded-full bg-[#722332]/10 mx-auto flex items-center justify-center font-bold text-lg text-[#722332]">
                          💰
                        </div>
                        <p className="text-xs font-black text-[#4A121A]">
                          <EditableText value="Prizes Up to ₹1 Lakh!" />
                        </p>
                      </div>
                      <div className="bg-gradient-to-br from-[#FFFDF9] via-[#FAF5EB] to-[#F5EBDC] p-4 rounded-xl border border-[#C59B27]/40 text-center space-y-2">
                        <div className="w-10 h-10 rounded-full bg-[#722332]/10 mx-auto flex items-center justify-center font-bold text-lg text-[#722332]">
                          🎖️
                        </div>
                        <p className="text-xs font-black text-[#4A121A]">
                          <EditableText value="Get recognized by industry leaders" />
                        </p>
                      </div>
                      <div className="bg-gradient-to-br from-[#FFFDF9] via-[#FAF5EB] to-[#F5EBDC] p-4 rounded-xl border border-[#C59B27]/40 text-center space-y-2">
                        <div className="w-10 h-10 rounded-full bg-[#722332]/10 mx-auto flex items-center justify-center font-bold text-lg text-[#722332]">
                          👥
                        </div>
                        <p className="text-xs font-black text-[#4A121A]">
                          <EditableText value="Network with innovators & mentors" />
                        </p>
                      </div>
                      <div className="bg-gradient-to-br from-[#FFFDF9] via-[#FAF5EB] to-[#F5EBDC] p-4 rounded-xl border border-[#C59B27]/40 text-center space-y-2">
                        <div className="w-10 h-10 rounded-full bg-[#722332]/10 mx-auto flex items-center justify-center font-bold text-lg text-[#722332]">
                          📜
                        </div>
                        <p className="text-xs font-black text-[#4A121A]">
                          <EditableText value="Certificates & media coverage" />
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* 4. RISING RESEARCHER / EXCELLENCE RESEARCH SECTION */}
                {(secId === 'risingResearcherSection' || secId === 'excellenceResearchSection') && (
                  <div className="bg-white rounded-2xl p-6 md:p-8 border-2 border-[#C59B27]/40 shadow-sm space-y-6">
                    <h3 className="text-xl md:text-2xl font-black text-[#4A121A] font-heading tracking-wide uppercase border-b border-[#C59B27]/30 pb-4 flex items-center gap-3">
                      <span className="w-3.5 h-3.5 rounded-full bg-[#722332]" />
                      <EditableText
                        value={
                          secId === 'risingResearcherSection'
                            ? 'Rising Researcher Award'
                            : 'Excellence in Research Award'
                        }
                      />
                    </h3>
                    <p className="text-xs md:text-sm text-neutral-800 font-medium leading-relaxed bg-gradient-to-br from-[#FFFDF9] via-[#FAF5EB] to-[#F5EBDC] p-4 rounded-xl border border-[#C59B27]/40">
                      <EditableText
                        multiline
                        value="Recognizes outstanding researchers who have demonstrated sustained, significant contributions through high-quality publications, innovations, and academic work."
                      />
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                      {[
                        'Certificate of Achievement',
                        'Cash Prize and Memento',
                        'Recognition by Academic Leaders',
                        'Networking Opportunities',
                        'Certificates & Media Coverage',
                      ].map((item, bIdx) => (
                        <div
                          key={bIdx}
                          className="bg-gradient-to-br from-[#FFFDF9] via-[#FAF5EB] to-[#F5EBDC] p-4 rounded-xl border border-[#C59B27]/40 text-center flex flex-col items-center justify-center space-y-2"
                        >
                          <div className="w-8 h-8 rounded-full bg-[#722332]/10 flex items-center justify-center border border-[#C59B27]/30 font-bold text-xs text-[#722332]">
                            ★
                          </div>
                          <span className="text-xs font-black text-[#4A121A]">
                            <EditableText value={item} />
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* DEFAULT AUTHENTIC FALLBACK SECTION RENDERER */}
                {secId !== 'hero' &&
                  secId !== 'sponsorshipSection' &&
                  secId !== 'hardnovateSection' &&
                  secId !== 'risingResearcherSection' &&
                  secId !== 'excellenceResearchSection' && (
                    <div className="bg-white rounded-2xl p-6 md:p-8 border-2 border-[#C59B27]/40 shadow-sm space-y-4">
                      <h3 className="text-xl md:text-2xl font-black text-[#4A121A] font-heading uppercase tracking-wide border-b border-[#C59B27]/30 pb-3 flex items-center gap-3">
                        <span className="w-3.5 h-3.5 rounded-full bg-[#722332]" />
                        <EditableText value={`Conference Section — ${secId}`} />
                      </h3>
                      <div className="bg-gradient-to-br from-[#FFFDF9] via-[#FAF5EB] to-[#F5EBDC] p-5 rounded-xl border border-[#C59B27]/40 space-y-2">
                        <p className="text-xs md:text-sm text-neutral-800 font-medium leading-relaxed">
                          <EditableText
                            multiline
                            value="Authentic rendered website block. Click any heading or paragraph to edit content live in place."
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
            IEEE IATMSI-2027 • ABV-IIITM Gwalior & Kathmandu Nepal
          </p>
          <p className="text-[11px] text-neutral-400">
            © 2027 IEEE IATMSI. All rights reserved. Supported by IEEE Region 10.
          </p>
        </div>
      </div>
    </div>
  );
}
