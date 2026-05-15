"use client";
import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import ProtectedLayout from "@/components/ProtectedLayout";
import { getJobMatches, getJobs } from "@/lib/api";

// ─── constants ───────────────────────────────────────────────────────────────

const LEVEL_LABELS = { entry: "Entry", junior: "Junior", mid: "Mid-Level", senior: "Senior", lead: "Lead", principal: "Principal" };
const LEVEL_COLORS = {
  entry:     "bg-sky-100 text-sky-700",
  junior:    "bg-violet-100 text-violet-700",
  mid:       "bg-amber-100 text-amber-700",
  senior:    "bg-emerald-100 text-emerald-700",
  lead:      "bg-rose-100 text-rose-700",
  principal: "bg-purple-100 text-purple-700",
};
const AVATAR_COLORS = [
  "bg-blue-500","bg-violet-500","bg-emerald-500","bg-amber-500",
  "bg-rose-500","bg-cyan-500","bg-indigo-500","bg-pink-500","bg-teal-500","bg-orange-500",
];
const LEVELS      = ["all","entry","junior","mid","senior","lead","principal"];
const SORT_OPTIONS = [
  { value:"recommended", label:"Recommended" },
  { value:"match",       label:"Top Match"   },
  { value:"date",        label:"Date Posted" },
];
const PAGE_SIZE = 10;

// ─── helpers ─────────────────────────────────────────────────────────────────

function avatarColor(name = "") {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff;
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function scoreColor(s) {
  if (s >= 70) return { bg: "bg-emerald-500", text: "text-emerald-600", ring: "#10b981", light: "bg-emerald-50" };
  if (s >= 50) return { bg: "bg-amber-500",   text: "text-amber-600",   ring: "#f59e0b", light: "bg-amber-50"  };
  return            { bg: "bg-indigo-500",  text: "text-indigo-600",  ring: "#6366f1", light: "bg-indigo-50" };
}

function relativeDate(iso) {
  if (!iso) return null;
  const days = Math.floor((Date.now() - new Date(iso)) / 864e5);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 7)  return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return new Date(iso).toLocaleDateString(undefined, { month:"short", day:"numeric" });
}

function normaliseJob(job) {
  const skills = (job.required_skills || []).map((s) => typeof s === "string" ? s : s.name || "").filter(Boolean);
  return {
    ...job,
    job_id:         job.id || job.job_id,
    company:        job.company || "",
    posted_at:      job.posted_at || null,
    match_score:    job.match_score || 0,
    matched_skills: job.matched_skills || [],
    missing_skills: job.missing_skills || [],
    jd_keywords:    job.jd_keywords || skills,
    resume_tips:    job.resume_tips || [],
    apply_url:      job.apply_url || job.source_url || null,
  };
}

function sortJobs(jobs, mode) {
  const now = Date.now();
  return [...jobs].sort((a, b) => {
    if (mode === "match") return (b.match_score || 0) - (a.match_score || 0);
    if (mode === "date")  return new Date(b.posted_at || 0) - new Date(a.posted_at || 0);
    const age  = (j) => j.posted_at ? (now - new Date(j.posted_at)) / 864e5 : 999;
    const rec  = (j) => Math.max(0, 100 - age(j) * 3);
    return ((b.match_score||0)*0.7 + rec(b)*0.3) - ((a.match_score||0)*0.7 + rec(a)*0.3);
  });
}

// ─── sub-components ──────────────────────────────────────────────────────────

function CompanyAvatar({ name }) {
  const color = avatarColor(name);
  return (
    <div className={`${color} w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm`}>
      <span className="text-white font-bold text-lg leading-none select-none">
        {(name || "?")[0].toUpperCase()}
      </span>
    </div>
  );
}

function MatchBadge({ score }) {
  const c = scoreColor(score);
  return (
    <div className={`${c.light} px-3 py-1.5 rounded-xl flex items-center gap-2 flex-shrink-0`}>
      <div className="relative w-7 h-7">
        <svg className="w-7 h-7 -rotate-90" viewBox="0 0 28 28">
          <circle cx="14" cy="14" r="11" fill="none" stroke="#e5e7eb" strokeWidth="3.5" />
          <circle cx="14" cy="14" r="11" fill="none" stroke={c.ring} strokeWidth="3.5"
            strokeDasharray={2*Math.PI*11}
            strokeDashoffset={2*Math.PI*11*(1-(score||0)/100)}
            strokeLinecap="round" />
        </svg>
      </div>
      <span className={`text-sm font-bold ${c.text}`}>{score > 0 ? `${score.toFixed(0)}%` : "—"}</span>
    </div>
  );
}

function SkillChip({ label, variant }) {
  const styles = {
    matched: "bg-emerald-50 text-emerald-700 border border-emerald-200 font-medium",
    missing: "bg-red-50 text-red-600 border border-red-100",
    neutral: "bg-gray-100 text-gray-500 border border-gray-200",
  };
  const dots = {
    matched: "bg-emerald-500",
    missing: "bg-red-400",
    neutral: "bg-gray-400",
  };
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full ${styles[variant]}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dots[variant]}`} />
      {label}
    </span>
  );
}

function JobCard({ job }) {
  const [expanded, setExpanded] = useState(false);
  const level       = job.seniority_level || "";
  const levelLabel  = LEVEL_LABELS[level] || level || null;
  const levelColor  = LEVEL_COLORS[level] || "bg-gray-100 text-gray-600";
  const matchedSet  = new Set((job.matched_skills || []).map((s) => s.toLowerCase()));
  const jdKeywords  = job.jd_keywords || [];
  const missing     = job.missing_skills || [];
  const tips        = job.resume_tips || [];
  const hasDetails  = missing.length > 0 || tips.length > 0;
  const posted      = relativeDate(job.posted_at);
  const c           = scoreColor(job.match_score || 0);

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-lg transition-all duration-200 flex flex-col overflow-hidden group">

      {/* Top accent bar */}
      <div className={`h-1 w-full ${c.bg} opacity-70`} />

      {/* Header */}
      <div className="p-5 flex gap-3">
        <CompanyAvatar name={job.company} />

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <h3 className="font-semibold text-gray-900 text-sm leading-snug line-clamp-2 group-hover:text-indigo-600 transition-colors">
                {job.title}
              </h3>
              <p className="text-xs text-gray-500 mt-0.5 truncate">
                <span className="font-medium text-gray-700">{job.company || "Unknown company"}</span>
                {job.location ? <span className="text-gray-400"> · {job.location}</span> : null}
              </p>
            </div>
            <MatchBadge score={job.match_score || 0} />
          </div>

          {/* Meta row */}
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            {levelLabel && (
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${levelColor}`}>
                {levelLabel}
              </span>
            )}
            {posted && (
              <span className="flex items-center gap-1 text-xs text-gray-400">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                {posted}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Skills section */}
      {jdKeywords.length > 0 ? (
        <div className="px-5 pb-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
            Skills Required
            {matchedSet.size > 0 && (
              <span className="ml-2 text-emerald-600 normal-case font-bold">
                {matchedSet.size}/{jdKeywords.length} matched
              </span>
            )}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {jdKeywords.slice(0, 10).map((kw) => (
              <SkillChip
                key={kw}
                label={kw}
                variant={matchedSet.has(kw.toLowerCase()) ? "matched" : "neutral"}
              />
            ))}
            {jdKeywords.length > 10 && (
              <span className="text-xs text-gray-400 self-center">+{jdKeywords.length - 10} more</span>
            )}
          </div>
          {matchedSet.size > 0 && (
            <div className="mt-3">
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-gray-400">Skill match</span>
                <span className={`font-semibold ${c.text}`}>
                  {Math.round((matchedSet.size / jdKeywords.length) * 100)}%
                </span>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full ${c.bg} rounded-full transition-all`}
                  style={{ width: `${(matchedSet.size / jdKeywords.length) * 100}%` }}
                />
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="px-5 pb-4">
          <div className="flex items-center gap-2 text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2">
            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Skills data pulled from live listing — click Apply to view full requirements
          </div>
        </div>
      )}

      {/* Expandable skill gap + tips */}
      {hasDetails && (
        <div className="border-t border-gray-100">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="w-full px-5 py-2.5 text-xs font-medium text-indigo-600 hover:bg-indigo-50 transition-colors flex items-center justify-between"
          >
            <span className="flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
              Skill gap &amp; resume tips
            </span>
            <svg className={`w-4 h-4 transition-transform ${expanded ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {expanded && (
            <div className="px-5 pb-5 pt-3 bg-gray-50 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {missing.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-red-500 uppercase tracking-wider mb-2">Skills to Learn</p>
                  <div className="flex flex-wrap gap-1.5">
                    {missing.map((s) => <SkillChip key={s} label={s} variant="missing" />)}
                  </div>
                </div>
              )}
              {tips.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-amber-500 uppercase tracking-wider mb-2">Resume Tips</p>
                  <ul className="space-y-2">
                    {tips.map((tip, i) => (
                      <li key={i} className="flex gap-2 text-xs text-gray-600 leading-relaxed">
                        <span className="text-amber-400 flex-shrink-0 font-bold">→</span>
                        {tip}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="mt-auto px-5 py-3 border-t border-gray-100 flex items-center justify-between gap-2">
        <Link
          href={`/skills?job_id=${job.job_id || job.id}`}
          className="text-xs font-medium text-gray-500 hover:text-indigo-600 transition-colors flex items-center gap-1"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          Skill Analysis
        </Link>

        {job.apply_url ? (
          <a
            href={job.apply_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 active:scale-95 px-4 py-2 rounded-xl transition-all shadow-sm shadow-indigo-200"
          >
            Apply Now
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        ) : (
          <span className="text-xs text-gray-300 italic">No apply link</span>
        )}
      </div>
    </div>
  );
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default function JobsPage() {
  const [matches,     setMatches]     = useState([]);
  const [allJobs,     setAllJobs]     = useState([]);
  const [search,      setSearch]      = useState("");
  const [levelFilter, setLevelFilter] = useState("all");
  const [sortMode,    setSortMode]    = useState("recommended");
  const [tab,         setTab]         = useState("matches");
  const [loading,     setLoading]     = useState(true);
  const [noResume,    setNoResume]    = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [showAll,     setShowAll]     = useState(false);

  useEffect(() => {
    Promise.all([
      getJobMatches().catch(() => ({ matches: [], message: "" })),
      getJobs(1, "").catch(() => ({ jobs: [] })),
    ]).then(([m, j]) => {
      if (m.message?.includes("Upload")) setNoResume(true);
      setMatches((m.matches || []).map(normaliseJob));
      setAllJobs((j.jobs  || []).map(normaliseJob));
      setLoading(false);
    });
  }, []);

  useEffect(() => {
    if (tab !== "all") return;
    const t = setTimeout(() => {
      getJobs(1, search).then((d) => setAllJobs((d.jobs || []).map(normaliseJob))).catch(() => {});
    }, 350);
    return () => clearTimeout(t);
  }, [search, tab]);

  useEffect(() => { setCurrentPage(1); }, [tab, levelFilter, sortMode, search]);

  const sortedJobs = useMemo(() => {
    let base = tab === "matches" ? matches : allJobs;
    if (tab === "matches" && !showAll) base = base.filter((j) => j.match_score >= 50);
    const filtered = levelFilter === "all" ? base : base.filter((j) => j.seniority_level === levelFilter);
    return sortJobs(filtered, sortMode);
  }, [tab, matches, allJobs, levelFilter, sortMode, showAll]);

  const totalPages  = Math.max(1, Math.ceil(sortedJobs.length / PAGE_SIZE));
  const safePage    = Math.min(currentPage, totalPages);
  const displayJobs = sortedJobs.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <ProtectedLayout>
      <div className="min-h-screen bg-gray-50">

        {/* Page header */}
        <div className="bg-white border-b border-gray-100 px-4 md:px-8 py-4 md:py-6">
          <div className="max-w-6xl mx-auto">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Job Matches</h1>
                <p className="text-sm text-gray-500 mt-0.5">
                  Live listings matched to your resume skills
                </p>
              </div>
              {!loading && matches.length > 0 && (
                <div className="flex items-center gap-4 text-center">
                  <div className="bg-indigo-50 rounded-xl px-4 py-2">
                    <p className="text-xl font-bold text-indigo-600">{matches.length}</p>
                    <p className="text-xs text-indigo-500">Roles found</p>
                  </div>
                  <div className="bg-emerald-50 rounded-xl px-4 py-2">
                    <p className="text-xl font-bold text-emerald-600">
                      {matches.filter((j) => j.match_score >= 50).length}
                    </p>
                    <p className="text-xs text-emerald-500">Good matches (50%+)</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-4 md:px-8 py-4 md:py-6">

          {/* No resume banner */}
          {noResume && (
            <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-2xl text-sm text-amber-800 flex items-center gap-3">
              <svg className="w-5 h-5 text-amber-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span>Upload a resume first to see personalized role matches.</span>
              <Link href="/resume" className="ml-auto font-semibold text-amber-700 whitespace-nowrap hover:underline">Upload →</Link>
            </div>
          )}

          {/* Controls bar */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-3 mb-6 flex flex-col sm:flex-row sm:items-center gap-3 flex-wrap">
            {/* Tab toggle */}
            <div className="flex bg-gray-100 rounded-xl p-1 gap-1">
              <button
                onClick={() => setTab("matches")}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${tab === "matches" ? "bg-white shadow text-indigo-600" : "text-gray-500 hover:text-gray-700"}`}
              >
                My Matches {matches.length > 0 && <span className="ml-1 bg-indigo-100 text-indigo-600 text-xs px-1.5 py-0.5 rounded-full">{matches.length}</span>}
              </button>
              <button
                onClick={() => setTab("all")}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${tab === "all" ? "bg-white shadow text-indigo-600" : "text-gray-500 hover:text-gray-700"}`}
              >
                All Roles
              </button>
            </div>

            <div className="h-5 w-px bg-gray-200 hidden sm:block" />

            {/* Sort */}
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9m-9 4h6m4 0l4-4m0 0l4 4m-4-4v12" />
              </svg>
              <select
                value={sortMode}
                onChange={(e) => setSortMode(e.target.value)}
                className="text-sm text-gray-700 font-medium bg-transparent border-none focus:outline-none focus:ring-0 cursor-pointer pr-6"
              >
                {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>

            <div className="h-5 w-px bg-gray-200 hidden sm:block" />

            {/* Level */}
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
              </svg>
              <select
                value={levelFilter}
                onChange={(e) => setLevelFilter(e.target.value)}
                className="text-sm text-gray-700 font-medium bg-transparent border-none focus:outline-none focus:ring-0 cursor-pointer pr-6"
              >
                {LEVELS.map((l) => <option key={l} value={l}>{LEVEL_LABELS[l] || "All Levels"}</option>)}
              </select>
            </div>

            {tab === "matches" && (
              <>
                <div className="h-5 w-px bg-gray-200 hidden sm:block" />
                <button
                  onClick={() => { setShowAll((v) => !v); setCurrentPage(1); }}
                  className={`ml-auto flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl border transition-all ${
                    showAll
                      ? "bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200"
                      : "bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100"
                  }`}
                >
                  {showAll ? (
                    <>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                      </svg>
                      Showing all
                    </>
                  ) : (
                    <>
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3l14 9-14 9V3z" />
                      </svg>
                      50%+ matches only
                    </>
                  )}
                </button>
              </>
            )}

            {tab === "all" && (
              <>
                <div className="h-5 w-px bg-gray-200 hidden sm:block" />
                <div className="relative sm:ml-auto">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search roles…"
                    className="pl-9 pr-4 py-2 bg-gray-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 w-56 placeholder-gray-400"
                  />
                </div>
              </>
            )}
          </div>

          {/* Loading */}
          {loading && (
            <div className="flex flex-col items-center gap-4 py-24">
              <div className="relative w-14 h-14">
                <div className="absolute inset-0 rounded-full border-4 border-indigo-100" />
                <div className="absolute inset-0 rounded-full border-4 border-indigo-600 border-t-transparent animate-spin" />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-gray-700">Fetching live job listings…</p>
                <p className="text-xs text-gray-400 mt-1">Searching LinkedIn, Indeed &amp; Glassdoor</p>
              </div>
            </div>
          )}

          {/* Empty state */}
          {!loading && displayJobs.length === 0 && (
            <div className="text-center py-24">
              <div className="w-16 h-16 bg-gray-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <p className="font-semibold text-gray-700">No roles found</p>
              <p className="text-sm text-gray-400 mt-1">
                {tab === "matches" ? "Upload a resume to get personalised matches" : "Try adjusting your filters"}
              </p>
            </div>
          )}

          {/* Job grid */}
          {!loading && displayJobs.length > 0 && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              {displayJobs.map((job, i) => (
                <JobCard key={job.job_id || job.id || i} job={job} />
              ))}
            </div>
          )}

          {/* Pagination */}
          {!loading && totalPages > 1 && (
            <div className="mt-8 flex items-center justify-center gap-2">
              <button
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={safePage === 1}
                className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:border-indigo-300 hover:text-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                ← Prev
              </button>

              <div className="flex items-center gap-1">
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((p) => p === 1 || p === totalPages || Math.abs(p - safePage) <= 2)
                  .reduce((acc, p, idx, arr) => {
                    if (idx > 0 && p - arr[idx - 1] > 1) acc.push("…");
                    acc.push(p);
                    return acc;
                  }, [])
                  .map((item, i) =>
                    item === "…" ? (
                      <span key={`e${i}`} className="px-1.5 text-gray-400 text-sm">…</span>
                    ) : (
                      <button
                        key={item}
                        onClick={() => setCurrentPage(item)}
                        className={`w-9 h-9 text-sm font-medium rounded-xl transition-all ${
                          item === safePage
                            ? "bg-indigo-600 text-white shadow-sm shadow-indigo-200"
                            : "text-gray-600 bg-white border border-gray-200 hover:border-indigo-300 hover:text-indigo-600"
                        }`}
                      >
                        {item}
                      </button>
                    )
                  )}
              </div>

              <button
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={safePage === totalPages}
                className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded-xl hover:border-indigo-300 hover:text-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
              >
                Next →
              </button>
            </div>
          )}

          {!loading && sortedJobs.length > 0 && (
            <p className="mt-3 text-center text-xs text-gray-400">
              Showing {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, sortedJobs.length)} of {sortedJobs.length} roles
            </p>
          )}
        </div>
      </div>
    </ProtectedLayout>
  );
}
