"use client";
import { useState, useEffect, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import ProtectedLayout from "@/components/ProtectedLayout";
import { uploadResume, getResumes, scoreResume, reparseResume } from "@/lib/api";

function SkillTag({ name }) {
  return (
    <span className="inline-block text-xs px-2.5 py-1 bg-brand-50 text-brand-700 rounded-full font-medium border border-brand-100">
      {name}
    </span>
  );
}

// ─── Score colour helpers ─────────────────────────────────────────────────────
const ringColor = (s) => {
  if (s == null) return "#9ca3af";
  if (s >= 70) return "#10b981";
  if (s >= 50) return "#f59e0b";
  return "#ef4444";
};
const gradeBg = (g) => {
  if (!g) return "bg-gray-100 text-gray-500";
  if (g.startsWith("A")) return "bg-emerald-100 text-emerald-700";
  if (g === "B")         return "bg-blue-100 text-blue-700";
  if (g === "C")         return "bg-amber-100 text-amber-700";
  return "bg-red-100 text-red-700";
};
const scoreLabel = (s) => {
  if (s >= 85) return "Excellent";
  if (s >= 70) return "Good";
  if (s >= 55) return "Fair";
  if (s >= 40) return "Needs Work";
  return "Poor";
};

// ─── Large score ring ─────────────────────────────────────────────────────────
function ScoreRing({ score, size = 140 }) {
  const r = size / 2 - 10;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - (score || 0) / 100);
  const color = ringColor(score);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#f3f4f6" strokeWidth="10" />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="10"
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round" transform={`rotate(-90 ${size/2} ${size/2})`}
        style={{ transition: "stroke-dashoffset .8s ease" }} />
      <text x={size/2} y={size/2 - 6} textAnchor="middle" fontSize="28" fontWeight="800" fill={color}>
        {score != null ? Math.round(score) : "—"}
      </text>
      <text x={size/2} y={size/2 + 14} textAnchor="middle" fontSize="11" fill="#9ca3af">/ 100</text>
    </svg>
  );
}

// ─── Mini category ring ───────────────────────────────────────────────────────
function MiniRing({ score, size = 52 }) {
  const r = size / 2 - 5;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - (score || 0) / 100);
  const color = ringColor(score);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="flex-shrink-0">
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#f3f4f6" strokeWidth="5" />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth="5"
        strokeDasharray={circ} strokeDashoffset={offset}
        strokeLinecap="round" transform={`rotate(-90 ${size/2} ${size/2})`}
        style={{ transition: "stroke-dashoffset .6s ease" }} />
      <text x={size/2} y={size/2 + 4} textAnchor="middle" fontSize="11" fontWeight="700" fill={color}>
        {score != null ? Math.round(score) : "—"}
      </text>
    </svg>
  );
}

// ─── Full ATS results panel ───────────────────────────────────────────────────
const CATEGORIES = [
  { key: "impact",       label: "Impact",       icon: "⚡", desc: "Action verbs, metrics, results" },
  { key: "skills",       label: "Skills",       icon: "🛠", desc: "Tech stack visibility" },
  { key: "format",       label: "Format",       icon: "📄", desc: "ATS parsability & structure" },
  { key: "style",        label: "Style",        icon: "✏️", desc: "Consistency & tone" },
  { key: "completeness", label: "Completeness", icon: "✅", desc: "LinkedIn, summary, sections" },
];

function ATSResults({ scores }) {
  const [openCat, setOpenCat] = useState(null);

  const allIssues = scores.issues || [];
  const allWins   = CATEGORIES.flatMap(c => (scores[c.key]?.wins || []));

  return (
    <div className="space-y-6">
      {/* Hero score + category grid */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-gray-50 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-gray-900">ATS Score Report</h3>
            <p className="text-xs text-gray-400 mt-0.5">Scored across 5 categories like ResumeWorded & VMock</p>
          </div>
          <span className={`text-xs font-bold px-3 py-1.5 rounded-full ${
            scores.composite >= 70 ? "bg-emerald-100 text-emerald-700" :
            scores.composite >= 50 ? "bg-amber-100 text-amber-700" :
            "bg-red-100 text-red-700"
          }`}>
            {scoreLabel(scores.composite)}
          </span>
        </div>

        <div className="p-6 flex flex-col sm:flex-row gap-8 items-center">
          {/* Big ring */}
          <div className="flex flex-col items-center gap-2 flex-shrink-0">
            <ScoreRing score={scores.composite} />
            <p className="text-sm font-semibold text-gray-700">Overall ATS Score</p>
          </div>

          {/* Category cards */}
          <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 w-full">
            {CATEGORIES.map(({ key, label, icon, desc }) => {
              const cat = scores[key];
              if (!cat) return null;
              const isOpen = openCat === key;
              return (
                <button
                  key={key}
                  onClick={() => setOpenCat(isOpen ? null : key)}
                  className={`text-left p-3 rounded-xl border transition-all ${
                    isOpen
                      ? "border-indigo-300 bg-indigo-50 shadow-sm"
                      : "border-gray-100 hover:border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <MiniRing score={cat.score} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-semibold text-gray-800">{icon} {label}</span>
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${gradeBg(cat.grade)}`}>
                          {cat.grade}
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-400 mt-0.5 truncate">{desc}</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Expanded category detail */}
        {openCat && scores[openCat] && (
          <div className="border-t border-gray-100 px-6 py-5 bg-gray-50">
            {(() => {
              const cat = scores[openCat];
              const meta = CATEGORIES.find(c => c.key === openCat);
              return (
                <div className="grid sm:grid-cols-2 gap-6">
                  {cat.issues?.length > 0 && (
                    <div>
                      <p className="text-xs font-bold text-red-600 uppercase tracking-wider mb-3">
                        {meta?.icon} {meta?.label} — Issues
                      </p>
                      <ul className="space-y-2">
                        {cat.issues.map((iss, i) => (
                          <li key={i} className="flex gap-2 text-sm text-gray-700">
                            <span className="text-red-400 mt-0.5 flex-shrink-0">✕</span>
                            <span>{iss}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {cat.wins?.length > 0 && (
                    <div>
                      <p className="text-xs font-bold text-emerald-600 uppercase tracking-wider mb-3">
                        What&apos;s Working
                      </p>
                      <ul className="space-y-2">
                        {cat.wins.map((win, i) => (
                          <li key={i} className="flex gap-2 text-sm text-gray-700">
                            <span className="text-emerald-500 mt-0.5 flex-shrink-0">✓</span>
                            <span>{win}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* Issues + wins split */}
      <div className="grid sm:grid-cols-2 gap-4">
        {/* All Issues */}
        {allIssues.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h4 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
              <span className="w-5 h-5 bg-red-100 rounded-full flex items-center justify-center text-red-600 text-xs">✕</span>
              Needs Improvement ({allIssues.length})
            </h4>
            <ul className="space-y-3">
              {allIssues.map((iss, i) => (
                <li key={i} className="flex gap-2.5 text-sm text-gray-700 pb-3 border-b border-gray-50 last:border-0 last:pb-0">
                  <span className="w-5 h-5 bg-red-50 rounded-full flex items-center justify-center text-red-400 text-xs flex-shrink-0 mt-0.5">!</span>
                  {iss}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* All Wins */}
        {allWins.length > 0 && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
            <h4 className="text-sm font-bold text-gray-900 mb-4 flex items-center gap-2">
              <span className="w-5 h-5 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-600 text-xs">✓</span>
              What&apos;s Working ({allWins.length})
            </h4>
            <ul className="space-y-3">
              {allWins.map((win, i) => (
                <li key={i} className="flex gap-2.5 text-sm text-gray-700 pb-3 border-b border-gray-50 last:border-0 last:pb-0">
                  <span className="w-5 h-5 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-500 text-xs flex-shrink-0 mt-0.5">✓</span>
                  {win}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Top suggestions */}
      {scores.suggestions?.length > 0 && (
        <div className="bg-gradient-to-br from-indigo-50 to-violet-50 border border-indigo-100 rounded-2xl p-5">
          <h4 className="text-sm font-bold text-indigo-900 mb-3">
            💡 Top Recommendations
          </h4>
          <ol className="space-y-2">
            {scores.suggestions.slice(0, 5).map((s, i) => (
              <li key={i} className="flex gap-3 text-sm text-indigo-800">
                <span className="w-5 h-5 bg-indigo-600 text-white rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5">
                  {i + 1}
                </span>
                {s}
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}

function ResumePageInner() {
  const [resumes, setResumes] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [parsed, setParsed] = useState(null);
  const [scores, setScores] = useState(null);
  const [scoring, setScoring] = useState(false);
  const [scoreError, setScoreError] = useState("");
  const [reparseText, setReparseText] = useState("");
  const [reparsing, setReparsing] = useState(false);
  const [showReparsePanel, setShowReparsePanel] = useState(false);

  const loadData = useCallback(() =>
    getResumes().then((d) => setResumes(d.resumes || [])).catch(() => {}), []);

  useEffect(() => { loadData(); }, [loadData]);

  const onDrop = useCallback(async (accepted) => {
    if (!accepted.length) return;
    setUploading(true);
    setUploadError("");
    setScoreError("");
    setScores(null);
    setShowReparsePanel(false);
    setParsed(null);
    setScores(null);
    try {
      const data = await uploadResume(accepted[0]);
      setParsed(data.parsed || null);
      await loadData();
    } catch (err) {
      setUploadError(err.response?.data?.error || "Upload failed. Only PDF, DOCX, and TXT are supported.");
    } finally {
      setUploading(false);
    }
  }, [loadData]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    // Accept by MIME type and extension — macOS sometimes reports PDFs as
    // application/octet-stream, so we include that as a fallback too.
    accept: {
      "application/pdf": [".pdf"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
      "text/plain": [".txt"],
      "application/octet-stream": [".pdf", ".docx"],
    },
    maxFiles: 1,
    multiple: false,
    onDropRejected: (files) => {
      const f = files[0];
      const ext = f?.file?.name?.split(".").pop()?.toLowerCase();
      if (ext && !["pdf", "docx", "txt"].includes(ext)) {
        setUploadError(`"${f.file.name}" is not supported. Please upload a PDF, DOCX, or TXT file.`);
      } else {
        setUploadError(`Could not read "${f?.file?.name}". Try clicking "browse files" to select it manually instead of dragging.`);
      }
    },
  });

  const handleScore = async () => {
    if (!resumes[0]) return;
    setScoring(true);
    setScores(null);
    setScoreError("");
    try {
      const data = await scoreResume(resumes[0].id);
      setScores(data.scores);
    } catch (err) {
      const msg = err.response?.data?.error || "Scoring failed.";
      setScoreError(msg);
      if (msg.includes("No parseable content") || resumes[0]?.status === "upload_only") {
        setShowReparsePanel(true);
      }
    } finally {
      setScoring(false);
    }
  };

  const handleReparse = async () => {
    if (!reparseText.trim() || !resumes[0]) return;
    setReparsing(true);
    setScoreError("");
    try {
      const data = await reparseResume(resumes[0].id, reparseText);
      setParsed(data.parsed);
      await loadData();
      setShowReparsePanel(false);
      setReparseText("");
    } catch (err) {
      setScoreError(err.response?.data?.error || "Re-parse failed.");
    } finally {
      setReparsing(false);
    }
  };

  const displayParsed = parsed || resumes[0];
  const skills = displayParsed?.skills || [];
  const skillNames = skills.map((s) => (typeof s === "string" ? s : s.name)).filter(Boolean);
  const experience = displayParsed?.experience || [];
  const education = displayParsed?.education || [];

  return (
    <ProtectedLayout>
      <div className="p-4 md:p-8 max-w-5xl mx-auto">
        <div className="mb-7">
          <h1 className="text-2xl font-bold text-gray-900">Resume</h1>
          <p className="text-gray-500 mt-1">Upload your resume to parse skills and score against job listings.</p>
        </div>

        {/* Drop zone */}
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-colors mb-8 ${
            isDragActive ? "border-brand-500 bg-brand-50" : "border-gray-300 hover:border-brand-400 hover:bg-gray-50"
          }`}
        >
          <input {...getInputProps()} />
          {uploading ? (
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-4 border-brand-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-gray-500 text-sm">Parsing your resume…</p>
            </div>
          ) : (
            <>
              <div className="w-14 h-14 mx-auto rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center mb-4">
                <svg className="w-7 h-7 text-brand-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                </svg>
              </div>
              <p className="font-medium text-gray-700">{isDragActive ? "Drop it here" : "Drag & drop your resume"}</p>
              <p className="text-sm text-gray-400 mt-1">or <span className="text-brand-600 font-medium">browse files</span> — PDF, DOCX, TXT · max 5 MB</p>
            </>
          )}
        </div>

        {uploadError && (
          <div className="mb-5 p-3.5 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{uploadError}</div>
        )}

        {/* Upload-only warning with re-parse option */}
        {resumes[0]?.status === "upload_only" && !showReparsePanel && (
          <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
            <svg className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-800">Resume not yet parsed</p>
              <p className="text-xs text-amber-700 mt-0.5">
                The parser service wasn&apos;t running when you uploaded. Paste your resume text below to parse it now, or re-upload the file.
              </p>
            </div>
            <button
              onClick={() => setShowReparsePanel(true)}
              className="text-xs font-semibold text-amber-700 border border-amber-300 px-3 py-1.5 rounded-lg hover:bg-amber-100 whitespace-nowrap"
            >
              Paste & Re-parse
            </button>
          </div>
        )}

        {/* Re-parse panel */}
        {showReparsePanel && (
          <div className="mb-6 bg-white border border-brand-200 rounded-xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-900 text-sm">Paste Resume Text</h3>
              <button onClick={() => setShowReparsePanel(false)} className="text-gray-400 hover:text-gray-600 text-lg leading-none">×</button>
            </div>

            <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800 space-y-1">
              <p className="font-semibold">Tip — what to paste:</p>
              <ul className="space-y-0.5 ml-3 list-disc">
                <li><strong>Best:</strong> Re-upload your PDF using the drop zone above — it auto-parses on upload.</li>
                <li><strong>Also works:</strong> Your <code>.tex</code> LaTeX source — LaTeX commands are automatically stripped.</li>
                <li><strong>Also works:</strong> Plain text copied from your PDF viewer.</li>
              </ul>
            </div>

            {/\\(?:documentclass|begin|resumeItem|textbf|usepackage)\b/.test(reparseText) && (
              <div className="mb-3 p-2.5 bg-green-50 border border-green-200 rounded-lg text-xs text-green-800 flex items-center gap-2">
                <svg className="w-4 h-4 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                LaTeX source detected — commands will be stripped automatically before parsing.
              </div>
            )}

            <textarea
              value={reparseText}
              onChange={(e) => setReparseText(e.target.value)}
              rows={8}
              placeholder={"Paste your resume here — plain text, PDF text, or LaTeX .tex source all work.\n\nExample plain text:\nJane Smith | jane@email.com | (555) 123-4567\n\nSkills: Python, React, PostgreSQL, Docker\n\nExperience:\nSoftware Engineer at Acme Corp, 2022–Present\n  - Built REST APIs with FastAPI and PostgreSQL\n  - Deployed services with Docker and AWS"}
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 resize-y font-mono"
            />
            <div className="flex gap-3 mt-3">
              <button
                onClick={handleReparse}
                disabled={!reparseText.trim() || reparsing}
                className="px-5 py-2 bg-brand-600 hover:bg-brand-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
              >
                {reparsing ? "Parsing…" : "Parse Resume"}
              </button>
              <button onClick={() => setShowReparsePanel(false)} className="px-4 py-2 border border-gray-200 rounded-lg text-sm text-gray-600 hover:bg-gray-50">
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Parsed resume display */}
        {skillNames.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
            {/* Skills */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
              <h2 className="font-semibold text-gray-900 mb-4">Detected Skills ({skillNames.length})</h2>
              <div className="flex flex-wrap gap-2">
                {skillNames.map((s) => <SkillTag key={s} name={s} />)}
              </div>
            </div>

            {/* Experience */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
              <h2 className="font-semibold text-gray-900 mb-4">Experience</h2>
              {experience.length === 0 ? (
                <p className="text-gray-400 text-sm">No experience entries detected</p>
              ) : (
                <div className="space-y-3">
                  {experience.slice(0, 4).map((exp, i) => (
                    <div key={i} className="border-l-2 border-brand-200 pl-3">
                      <p className="font-medium text-sm text-gray-900">{exp.title || "Role"}</p>
                      <p className="text-xs text-gray-500">{exp.company}{exp.duration ? ` · ${exp.duration}` : ""}</p>
                    </div>
                  ))}
                </div>
              )}

              {education.length > 0 && (
                <>
                  <h2 className="font-semibold text-gray-900 mt-5 mb-3">Education</h2>
                  <div className="space-y-2">
                    {education.slice(0, 2).map((edu, i) => (
                      <div key={i}>
                        <p className="font-medium text-sm text-gray-900">{edu.degree || "Degree"}</p>
                        <p className="text-xs text-gray-500">{edu.institution}{edu.year ? ` · ${edu.year}` : ""}</p>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ATS Scoring */}
        {resumes.length > 0 && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-gray-900">ATS Score Report</h2>
                <p className="text-sm text-gray-400 mt-0.5">Detailed analysis across 5 categories — like ResumeWorded & VMock</p>
              </div>
              <button
                onClick={handleScore}
                disabled={scoring}
                className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-semibold transition-colors disabled:opacity-50 shadow-sm"
              >
                {scoring ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Analyzing…
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                    Score My Resume
                  </>
                )}
              </button>
            </div>

            {scoring && (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 flex flex-col items-center gap-4">
                <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                <p className="text-sm text-gray-500 font-medium">Analyzing your resume across 5 categories…</p>
              </div>
            )}

            {scoreError && (
              <div className="mb-4 p-3.5 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm flex items-start gap-2">
                <span className="flex-1">{scoreError}</span>
                {showReparsePanel === false && resumes[0]?.status === "upload_only" && (
                  <button onClick={() => setShowReparsePanel(true)} className="font-semibold underline whitespace-nowrap">Re-parse →</button>
                )}
              </div>
            )}

            {scores && <ATSResults scores={scores} />}
          </div>
        )}

        {resumes.length === 0 && !uploading && (
          <div className="text-center text-gray-400 text-sm mt-4">No resume uploaded yet.</div>
        )}
      </div>
    </ProtectedLayout>
  );
}

export default function ResumePage() {
  return <ResumePageInner />;
}
