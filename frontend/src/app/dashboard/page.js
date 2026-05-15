"use client";
import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import ProtectedLayout from "@/components/ProtectedLayout";
import { getDashboardSummary, getJobMatches, getCourseRecommendations, fetchCanvasCourses } from "@/lib/api";
import { useAuth } from "@/lib/auth";

// ─── tiny helpers ─────────────────────────────────────────────────────────────

const greet = () => {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
};

const fmtDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—";

const scoreColor = (s) => {
  if (s == null) return { ring: "#9ca3af", text: "text-gray-500", bg: "bg-gray-100", bar: "bg-gray-300" };
  if (s >= 70)   return { ring: "#10b981", text: "text-emerald-600", bg: "bg-emerald-50", bar: "bg-emerald-500" };
  if (s >= 50)   return { ring: "#f59e0b", text: "text-amber-600",   bg: "bg-amber-50",   bar: "bg-amber-500"   };
  return           { ring: "#ef4444", text: "text-red-600",    bg: "bg-red-50",    bar: "bg-red-500"    };
};

const matchColor = (s) => {
  if (s >= 70) return "bg-emerald-100 text-emerald-700";
  if (s >= 50) return "bg-amber-100 text-amber-700";
  return "bg-indigo-100 text-indigo-700";
};

const AVATAR_COLORS = ["bg-blue-500","bg-violet-500","bg-emerald-500","bg-amber-500","bg-rose-500","bg-cyan-500","bg-indigo-500","bg-pink-500"];
const companyColor  = (name = "") => { let h = 0; for (const c of name) h = (h*31+c.charCodeAt(0))&0xffffffff; return AVATAR_COLORS[Math.abs(h)%AVATAR_COLORS.length]; };

const TARGET_ROLES = [
  "Software Engineer","Frontend Engineer","Backend Engineer","Full Stack Engineer",
  "Data Scientist","ML Engineer","DevOps Engineer","Product Manager","Data Analyst","Cloud Engineer",
];

// ─── ATS ring ─────────────────────────────────────────────────────────────────

function ATSRing({ score, size = 72 }) {
  const c = scoreColor(score);
  const r = size / 2 - 7;
  const circ = 2 * Math.PI * r;
  const fill = circ * (1 - (score || 0) / 100);
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="flex-shrink-0">
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#e5e7eb" strokeWidth="7" />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={c.ring} strokeWidth="7"
        strokeDasharray={circ} strokeDashoffset={fill}
        strokeLinecap="round" transform={`rotate(-90 ${size/2} ${size/2})`}
        style={{ transition: "stroke-dashoffset .6s ease" }} />
      <text x={size/2} y={size/2+5} textAnchor="middle" fontSize="14" fontWeight="700" fill={c.ring}>
        {score != null ? `${score.toFixed(0)}` : "—"}
      </text>
    </svg>
  );
}

// ─── Resume history item ──────────────────────────────────────────────────────

function ResumeRow({ resume, isLatest }) {
  const c = scoreColor(resume.atsScore);
  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-colors ${isLatest ? "bg-indigo-50 border border-indigo-100" : "hover:bg-gray-50"}`}>
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${isLatest ? "bg-indigo-100" : "bg-gray-100"}`}>
        <svg className={`w-4 h-4 ${isLatest ? "text-indigo-600" : "text-gray-400"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate">{resume.fileName}</p>
        <p className="text-xs text-gray-400">{fmtDate(resume.uploadedAt)}{isLatest && <span className="ml-2 text-indigo-500 font-medium">Latest</span>}</p>
      </div>
      {resume.atsScore != null ? (
        <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${c.bg} ${c.text}`}>
          {resume.atsScore.toFixed(0)}%
        </span>
      ) : (
        <Link href="/resume" className="text-xs text-indigo-500 hover:underline flex-shrink-0">Score →</Link>
      )}
    </div>
  );
}

// ─── Canvas / Learning section ────────────────────────────────────────────────

function CanvasSection({ missingSkills }) {
  const [view,       setView]       = useState(() => localStorage.getItem("canvas_view") || "connect"); // connect | connected | paste
  const [token,      setToken]      = useState("");
  const [canvasCourses, setCanvasCourses] = useState(() => { try { return JSON.parse(localStorage.getItem("canvas_courses") || "null"); } catch { return null; } });
  const [canvasUser, setCanvasUser] = useState(() => localStorage.getItem("canvas_user") || "");
  const [pasteText,  setPasteText]  = useState("");
  const [targetRole, setTargetRole] = useState(() => localStorage.getItem("target_role") || "Software Engineer");
  const [recData,    setRecData]    = useState(null);
  const [recLoading, setRecLoading] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error,      setError]      = useState("");

  const hasCourses = canvasCourses && canvasCourses.length > 0;

  useEffect(() => {
    if (hasCourses) setView("connected");
  }, []); // eslint-disable-line

  useEffect(() => {
    localStorage.setItem("target_role", targetRole);
    loadRecs();
  }, [targetRole]); // eslint-disable-line

  useEffect(() => {
    if (hasCourses) loadRecs();
  }, [canvasCourses]); // eslint-disable-line

  async function loadRecs() {
    setRecLoading(true);
    try {
      const data = await getCourseRecommendations(missingSkills.length ? missingSkills : [], targetRole, "beginner");
      setRecData(data);
    } catch { setRecData(null); }
    finally { setRecLoading(false); }
  }

  async function connectCanvas() {
    if (!token.trim()) return;
    setConnecting(true); setError("");
    try {
      const data = await fetchCanvasCourses(token.trim());
      setCanvasCourses(data.courses);
      setCanvasUser(data.canvasUser || "");
      localStorage.setItem("canvas_courses", JSON.stringify(data.courses));
      localStorage.setItem("canvas_user", data.canvasUser || "");
      localStorage.setItem("canvas_view", "connected");
      setView("connected");
    } catch (e) {
      setError(e.response?.data?.error || "Could not connect. Try pasting your course list instead.");
    } finally { setConnecting(false); }
  }

  function importPaste() {
    const lines = pasteText.split("\n").map(l => l.trim()).filter(l => l.length > 2);
    if (!lines.length) return;
    const courses = lines.map((l, i) => ({ id: i, name: l, code: l, status: "available" }));
    setCanvasCourses(courses);
    setCanvasUser("(imported)");
    localStorage.setItem("canvas_courses", JSON.stringify(courses));
    localStorage.setItem("canvas_view", "connected");
    setView("connected");
  }

  function disconnect() {
    localStorage.removeItem("canvas_courses");
    localStorage.removeItem("canvas_user");
    localStorage.setItem("canvas_view", "connect");
    setCanvasCourses(null); setCanvasUser(""); setView("connect"); setToken(""); setPasteText(""); setError("");
  }

  // ── connect screen ──
  if (view === "connect" || view === "paste") {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center gap-3">
          <div className="w-9 h-9 bg-rose-50 rounded-xl flex items-center justify-center flex-shrink-0">
            <svg className="w-5 h-5 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">Canvas Courses</h3>
            <p className="text-xs text-gray-400">Connect to see your real courses from SJSU Canvas</p>
          </div>
        </div>

        {/* Tab toggle */}
        <div className="flex border-b border-gray-100">
          {[["connect","Connect via Token"],["paste","Paste Course List"]].map(([v,label]) => (
            <button key={v} onClick={() => { setView(v); setError(""); }}
              className={`flex-1 py-3 text-xs font-semibold transition-colors ${view === v ? "text-indigo-600 border-b-2 border-indigo-600 -mb-px" : "text-gray-400 hover:text-gray-600"}`}>
              {label}
            </button>
          ))}
        </div>

        <div className="p-6">
          {view === "connect" ? (
            <>
              <div className="bg-indigo-50 border border-indigo-100 rounded-xl px-4 py-3 text-xs text-indigo-700 mb-4 space-y-1">
                <p className="font-bold">Get your Canvas access token:</p>
                <ol className="list-decimal list-inside space-y-0.5 text-indigo-600">
                  <li>Go to <a href="https://sjsu.instructure.com/profile/settings" target="_blank" rel="noopener noreferrer" className="underline font-medium">sjsu.instructure.com/profile/settings</a></li>
                  <li>Scroll to <span className="font-medium">Approved Integrations</span> at the bottom</li>
                  <li>Click <span className="font-medium">+ New Access Token</span>, copy it, paste below</li>
                </ol>
                <p className="text-indigo-400 mt-1">If you don&apos;t see Approved Integrations, use the &ldquo;Paste Course List&rdquo; tab instead.</p>
              </div>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && connectCanvas()}
                  placeholder="Paste your Canvas token here…"
                  className="flex-1 px-3 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-400"
                />
                <button onClick={connectCanvas} disabled={connecting || !token.trim()}
                  className="px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors whitespace-nowrap">
                  {connecting ? "Connecting…" : "Connect"}
                </button>
              </div>
              {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
            </>
          ) : (
            <>
              <p className="text-xs text-gray-500 mb-3">
                Go to <a href="https://sjsu.instructure.com" target="_blank" rel="noopener noreferrer" className="text-indigo-600 underline">sjsu.instructure.com</a>, copy your course names from the dashboard, and paste them below (one course per line).
              </p>
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                rows={6}
                placeholder={"CS 146 - Algorithm Design\nCS 157A - Database Management\nCS 160 - Software Engineering\nSTAT 95 - Statistics"}
                className="w-full px-3 py-2.5 text-sm bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none font-mono placeholder-gray-300"
              />
              <button onClick={importPaste} disabled={!pasteText.trim()}
                className="mt-3 w-full py-2.5 bg-indigo-600 text-white text-sm font-semibold rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                Import Courses
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  // ── connected screen ──
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <h3 className="font-semibold text-gray-900">Canvas Courses</h3>
          </div>
          {canvasUser && canvasUser !== "(imported)" && (
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{canvasUser}</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">Target role:</span>
            <select value={targetRole} onChange={(e) => setTargetRole(e.target.value)}
              className="text-xs font-semibold text-indigo-600 bg-indigo-50 border border-indigo-100 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-indigo-400">
              {TARGET_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <button onClick={disconnect} className="text-xs text-gray-400 hover:text-red-400 transition-colors">Disconnect</button>
        </div>
      </div>

      <div className="p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* My courses */}
        <div>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
            My Courses <span className="text-gray-300 font-normal">({canvasCourses?.length || 0})</span>
          </p>
          <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
            {(canvasCourses || []).map((c, i) => (
              <div key={c.id ?? i} className="flex items-center gap-2.5 px-3 py-2.5 bg-gray-50 rounded-xl">
                <div className="w-6 h-6 bg-indigo-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <svg className="w-3.5 h-3.5 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-gray-800 truncate">{c.name}</p>
                  {c.code && c.code !== c.name && <p className="text-xs text-gray-400">{c.code}</p>}
                </div>
                {c.term && <span className="text-xs text-gray-300 flex-shrink-0">{c.term}</span>}
              </div>
            ))}
          </div>
        </div>

        {/* Recommended courses */}
        <div>
          <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">
            Recommended to become a <span className="text-indigo-500">{targetRole}</span>
          </p>
          {recLoading ? (
            <div className="space-y-2">{[1,2,3,4].map(i => <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />)}</div>
          ) : recData?.courses?.length > 0 ? (
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {recData.courses.map((c, i) => (
                <a key={i} href={c.url} target="_blank" rel="noopener noreferrer"
                  className="flex items-start gap-3 px-3 py-2.5 bg-indigo-50 hover:bg-indigo-100 rounded-xl transition-colors group">
                  <div className="w-7 h-7 bg-indigo-200 rounded-lg flex items-center justify-center flex-shrink-0 text-xs font-bold text-indigo-700 mt-0.5">{i+1}</div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-gray-800 group-hover:text-indigo-700 line-clamp-1">{c.title}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-xs text-gray-400">{c.platform}</span>
                      <span className="text-gray-200">·</span>
                      <span className="text-xs text-gray-400">{c.duration}</span>
                      {c.free && <span className="text-xs font-semibold text-emerald-500">Free</span>}
                    </div>
                  </div>
                  <svg className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0 mt-1 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                </a>
              ))}
              {recData.total_estimated_hours > 0 && (
                <p className="text-xs text-gray-400 text-center pt-1">~{recData.total_estimated_hours} hours total</p>
              )}
            </div>
          ) : (
            <div className="border-2 border-dashed border-gray-100 rounded-xl p-6 text-center">
              <p className="text-xs text-gray-400">Your skills look great for this role!</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { user }    = useAuth();
  const [summary,   setSummary]   = useState(null);
  const [matches,   setMatches]   = useState([]);
  const [loadSum,   setLoadSum]   = useState(true);
  const [loadMatch, setLoadMatch] = useState(true);
  const [showAll,   setShowAll]   = useState(false);

  useEffect(() => {
    getDashboardSummary().then(setSummary).catch(() => setSummary({})).finally(() => setLoadSum(false));
    getJobMatches().then(d => setMatches(d?.matches?.slice(0,4) || [])).catch(() => setMatches([])).finally(() => setLoadMatch(false));
  }, []);

  const lr           = summary?.latestResume;
  const allResumes   = summary?.allResumes || [];
  const missingSkills = []; // will be populated once skill gap is added

  const statCards = [
    { label:"Resumes",     value: loadSum ? "…" : (summary?.resumeCount ?? 0),    color:"bg-indigo-500",  icon:"M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z", href:"/resume" },
    { label:"Job Matches", value: loadMatch ? "…" : matches.length,                color:"bg-emerald-500", icon:"M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z", href:"/jobs" },
    { label:"Skill Gaps",  value: loadSum ? "…" : (summary?.skillGapCount ?? 0),  color:"bg-violet-500",  icon:"M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z", href:"/skills" },
  ];

  return (
    <ProtectedLayout>
      <div className="min-h-screen bg-gray-50">

        {/* ── Header ── */}
        <div className="bg-white border-b border-gray-100 px-8 py-6">
          <div className="max-w-6xl mx-auto flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center shadow-sm shadow-indigo-200 flex-shrink-0">
                <span className="text-white font-bold text-lg">{user?.name?.[0]?.toUpperCase() || "U"}</span>
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">{greet()}, {user?.name?.split(" ")[0]} 👋</h1>
                <p className="text-sm text-gray-400 mt-0.5">Here&apos;s your career snapshot for today.</p>
              </div>
            </div>
            <span className="text-sm text-gray-400 bg-gray-50 px-3 py-1.5 rounded-xl border border-gray-100">
              {new Date().toLocaleDateString(undefined, { weekday:"long", month:"long", day:"numeric" })}
            </span>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-8 py-6 space-y-6">

          {/* ── Stat cards ── */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {statCards.map(({ label, value, color, icon, href }) => (
              <Link key={label} href={href} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 flex items-center gap-4 hover:shadow-md transition-shadow">
                <div className={`${color} w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm`}>
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
                  </svg>
                </div>
                <div>
                  <p className="text-2xl font-bold text-gray-900">{value}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{label}</p>
                </div>
              </Link>
            ))}
          </div>

          {/* ── Main grid ── */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

            {/* Left: Resume + History */}
            <div className="lg:col-span-2 space-y-4">

              {/* Latest resume ATS card */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                  <h2 className="font-semibold text-gray-900 text-sm">Latest Resume</h2>
                  <Link href="/resume" className="text-xs font-medium text-indigo-600 hover:underline">Upload new →</Link>
                </div>

                {loadSum ? (
                  <div className="p-5 space-y-3">
                    {[80,60,40].map(w => <div key={w} className={`h-3 bg-gray-100 rounded-full w-${w === 80 ? 'full' : w === 60 ? '3/4' : '1/2'} animate-pulse`} />)}
                  </div>
                ) : lr ? (
                  <div className="p-5">
                    <div className="flex items-center gap-4">
                      <ATSRing score={lr.atsScore} size={76} />
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-gray-900 text-sm truncate">{lr.fileName}</p>
                        <p className="text-xs text-gray-400 mt-0.5">Uploaded {fmtDate(lr.uploadedAt)}</p>
                        {lr.atsScore != null ? (
                          <span className={`mt-2 inline-block text-xs font-bold px-2.5 py-1 rounded-full ${scoreColor(lr.atsScore).bg} ${scoreColor(lr.atsScore).text}`}>
                            ATS Score: {lr.atsScore.toFixed(0)}%
                          </span>
                        ) : (
                          <Link href="/resume" className="mt-2 inline-block text-xs font-medium text-indigo-500 hover:underline">Score your resume →</Link>
                        )}
                      </div>
                    </div>

                    {/* Breakdown bars */}
                    {lr.atsDetails && (
                      <div className="mt-4 space-y-2.5">
                        {[
                          { label: "Format & Structure", val: lr.atsDetails.format_score },
                          { label: "Content Quality",    val: lr.atsDetails.content_score },
                          { label: "Consistency",        val: lr.atsDetails.consistency_score },
                        ].map(({ label, val }) => val != null && (
                          <div key={label}>
                            <div className="flex justify-between text-xs mb-1">
                              <span className="text-gray-500">{label}</span>
                              <span className={`font-semibold ${scoreColor(val).text}`}>{val.toFixed(0)}</span>
                            </div>
                            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div className={`h-full ${scoreColor(val).bar} rounded-full`} style={{ width:`${Math.min(val,100)}%` }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="p-6 text-center">
                    <p className="text-sm text-gray-400">No resume uploaded yet</p>
                    <Link href="/resume" className="mt-3 inline-block px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 transition-colors">Upload Resume</Link>
                  </div>
                )}
              </div>

              {/* Resume history */}
              {allResumes.length > 1 && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                  <button
                    onClick={() => setShowAll(v => !v)}
                    className="w-full px-5 py-3.5 flex items-center justify-between hover:bg-gray-50 transition-colors"
                  >
                    <span className="text-sm font-semibold text-gray-800">All Resumes ({allResumes.length})</span>
                    <svg className={`w-4 h-4 text-gray-400 transition-transform ${showAll ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {showAll && (
                    <div className="px-3 pb-3 space-y-1 border-t border-gray-100">
                      {allResumes.map((r, i) => (
                        <ResumeRow key={r.id || i} resume={r} isLatest={i === 0} />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Right: Job matches + Skill gap quick links */}
            <div className="lg:col-span-3 space-y-4">

              {/* Job matches */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                  <h2 className="font-semibold text-gray-900 text-sm">Top Job Matches</h2>
                  <Link href="/jobs" className="text-xs font-medium text-indigo-600 hover:underline">View all →</Link>
                </div>

                {loadMatch ? (
                  <div className="divide-y divide-gray-50">
                    {[1,2,3].map(i => (
                      <div key={i} className="px-6 py-4 flex items-center gap-3">
                        <div className="w-9 h-9 bg-gray-100 rounded-xl animate-pulse flex-shrink-0" />
                        <div className="flex-1 space-y-1.5">
                          <div className="h-3 bg-gray-100 rounded-full w-3/4 animate-pulse" />
                          <div className="h-2.5 bg-gray-100 rounded-full w-1/2 animate-pulse" />
                        </div>
                        <div className="w-14 h-6 bg-gray-100 rounded-full animate-pulse" />
                      </div>
                    ))}
                  </div>
                ) : matches.length > 0 ? (
                  <div className="divide-y divide-gray-50">
                    {matches.map((job, i) => (
                      <div key={job.job_id || i} className="px-6 py-4 flex items-center gap-3 hover:bg-gray-50 transition-colors">
                        <div className={`${companyColor(job.company)} w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0`}>
                          <span className="text-white text-sm font-bold">{(job.company || "?")[0].toUpperCase()}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{job.title}</p>
                          <p className="text-xs text-gray-400 truncate">{job.company || "—"}{job.location ? ` · ${job.location}` : ""}</p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${matchColor(job.match_score)}`}>
                            {(job.match_score || 0).toFixed(0)}%
                          </span>
                          {job.apply_url && (
                            <a href={job.apply_url} target="_blank" rel="noopener noreferrer"
                              className="text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 px-2.5 py-1 rounded-lg transition-colors">
                              Apply
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="px-6 py-8 text-center">
                    <p className="text-sm text-gray-400">Upload a resume to see live job matches</p>
                    <Link href="/resume" className="mt-2 inline-block text-sm text-indigo-600 font-medium hover:underline">Upload →</Link>
                  </div>
                )}
              </div>

              {/* Quick actions */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <h2 className="text-sm font-semibold text-gray-900 mb-3">Quick Actions</h2>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { href:"/resume",              label:"Upload Resume",       icon:"M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12", color:"bg-indigo-50 text-indigo-600"  },
                    { href:"/jobs",                label:"Browse Jobs",         icon:"M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z",                   color:"bg-emerald-50 text-emerald-600" },
                    { href:"/skills",              label:"Skill Gap Analysis",  icon:"M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2z",color:"bg-violet-50 text-violet-600"  },
                    { href:"/chat?mode=interview", label:"Mock Interview",      icon:"M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z",color:"bg-rose-50 text-rose-600"     },
                    { href:"/chat",                label:"AI Chat Assistant",   icon:"M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z",color:"bg-amber-50 text-amber-600"   },
                    { href:"/skills",              label:"View Courses",        icon:"M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253",color:"bg-cyan-50 text-cyan-600"     },
                  ].map(({ href, label, icon, color }) => (
                    <Link key={href+label} href={href}
                      className={`flex items-center gap-2.5 px-3 py-3 rounded-xl text-sm font-medium transition-colors hover:opacity-80 ${color}`}>
                      <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
                      </svg>
                      {label}
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ── Canvas learning section ── */}
          <CanvasSection missingSkills={missingSkills} />

        </div>
      </div>
    </ProtectedLayout>
  );
}
