"use client";
import { useState, useCallback, Suspense } from "react";
import ProtectedLayout from "@/components/ProtectedLayout";
import { getSkillGapByRole, getCourseRecommendations } from "@/lib/api";

// ─── constants ────────────────────────────────────────────────────────────────

const TARGET_ROLES = [
  "Software Engineer", "Frontend Engineer", "Backend Engineer", "Full Stack Engineer",
  "Data Scientist", "ML Engineer", "DevOps / SRE Engineer", "Data Engineer",
  "Cloud Engineer", "Android Engineer", "iOS Engineer", "Product Manager",
];

const ROLE_ICONS = {
  "Software Engineer":     "⚙️",
  "Frontend Engineer":     "🎨",
  "Backend Engineer":      "🔧",
  "Full Stack Engineer":   "🔗",
  "Data Scientist":        "📊",
  "ML Engineer":           "🤖",
  "DevOps / SRE Engineer": "☁️",
  "Data Engineer":         "🗄️",
  "Cloud Engineer":        "☁️",
  "Android Engineer":      "📱",
  "iOS Engineer":          "🍎",
  "Product Manager":       "🗺️",
};

const CATEGORY_CONFIG = {
  languages:  { label: "Languages",    color: "#6366f1", bg: "bg-indigo-50",   text: "text-indigo-700",  border: "border-indigo-200" },
  frameworks: { label: "Frameworks",   color: "#8b5cf6", bg: "bg-violet-50",   text: "text-violet-700",  border: "border-violet-200" },
  databases:  { label: "Databases",    color: "#06b6d4", bg: "bg-cyan-50",     text: "text-cyan-700",    border: "border-cyan-200" },
  cloud:      { label: "Cloud/DevOps", color: "#f59e0b", bg: "bg-amber-50",    text: "text-amber-700",   border: "border-amber-200" },
  tools:      { label: "Tools",        color: "#64748b", bg: "bg-slate-50",    text: "text-slate-700",   border: "border-slate-200" },
  ml_ai:      { label: "ML / AI",      color: "#10b981", bg: "bg-emerald-50",  text: "text-emerald-700", border: "border-emerald-200" },
  general:    { label: "General",      color: "#94a3b8", bg: "bg-gray-50",     text: "text-gray-600",    border: "border-gray-200" },
};

const PRIORITY_CONFIG = {
  high:   { label: "Must Learn",        bg: "bg-rose-50",   text: "text-rose-700",   border: "border-rose-200",   dot: "bg-rose-500",   badge: "bg-rose-100 text-rose-700" },
  medium: { label: "Good to Have",      bg: "bg-amber-50",  text: "text-amber-700",  border: "border-amber-200",  dot: "bg-amber-500",  badge: "bg-amber-100 text-amber-700" },
  low:    { label: "Nice to Have",      bg: "bg-gray-50",   text: "text-gray-600",   border: "border-gray-200",   dot: "bg-gray-400",   badge: "bg-gray-100 text-gray-600" },
};

// ─── sub-components ──────────────────────────────────────────────────────────

function MatchRing({ pct, size = 160 }) {
  const r = (size - 18) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ * (1 - Math.min(pct || 0, 100) / 100);
  const color = pct >= 70 ? "#10b981" : pct >= 50 ? "#f59e0b" : "#ef4444";
  const label = pct >= 70 ? "Strong fit" : pct >= 50 ? "Good fit" : "Developing";
  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#f1f5f9" strokeWidth={14} />
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={14}
            strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 1s ease" }} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-black text-gray-900">{Math.round(pct || 0)}%</span>
          <span className="text-[11px] font-medium text-gray-400">match</span>
        </div>
      </div>
      <span className="text-xs font-semibold px-3 py-1 rounded-full"
        style={{ backgroundColor: `${color}20`, color }}>
        {label}
      </span>
    </div>
  );
}

function StatCard({ value, label, color }) {
  return (
    <div className={`${color} rounded-2xl px-6 py-4 text-center`}>
      <p className="text-2xl font-black text-gray-900">{value}</p>
      <p className="text-xs text-gray-500 mt-0.5">{label}</p>
    </div>
  );
}

function CategoryBar({ catKey, matched, total }) {
  const cfg = CATEGORY_CONFIG[catKey] || CATEGORY_CONFIG.general;
  const pct = total > 0 ? Math.round((matched / total) * 100) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-700">{cfg.label}</span>
        <span className="text-xs text-gray-400">{matched}/{total} · {pct}%</span>
      </div>
      <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, backgroundColor: cfg.color }} />
      </div>
    </div>
  );
}

function SkillChip({ skill, has, category }) {
  const cfg = CATEGORY_CONFIG[category] || CATEGORY_CONFIG.general;
  if (has) {
    return (
      <span className={`inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full font-medium ${cfg.bg} ${cfg.text} border ${cfg.border}`}>
        <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
        </svg>
        {skill}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full font-medium bg-gray-50 text-gray-400 border border-gray-200 line-through">
      {skill}
    </span>
  );
}

function GapItem({ gap }) {
  const pri = PRIORITY_CONFIG[gap.priority] || PRIORITY_CONFIG.low;
  const cat = CATEGORY_CONFIG[gap.category] || CATEGORY_CONFIG.general;
  return (
    <div className={`flex items-center justify-between px-4 py-3 rounded-xl border ${pri.border} ${pri.bg}`}>
      <div className="flex items-center gap-2.5">
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${pri.dot}`} />
        <span className={`text-sm font-semibold capitalize ${pri.text}`}>{gap.skill}</span>
        <span className={`text-xs px-2 py-0.5 rounded-full ${cat.bg} ${cat.text} border ${cat.border}`}>
          {cat.label}
        </span>
      </div>
      <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${pri.badge}`}>
        {pri.label}
      </span>
    </div>
  );
}

function CourseCard({ course }) {
  return (
    <a href={course.url} target="_blank" rel="noopener noreferrer"
      className="group flex items-start gap-3 p-4 bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-lg hover:border-indigo-200 transition-all">
      <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center flex-shrink-0 group-hover:bg-indigo-100 transition-colors">
        <svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.746 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-sm text-gray-900 group-hover:text-indigo-700 line-clamp-2 transition-colors">{course.title}</p>
        <p className="text-xs text-gray-400 mt-0.5">{course.platform}{course.duration ? ` · ${course.duration}` : ""}</p>
        <div className="flex items-center gap-2 mt-2 flex-wrap">
          <span className="text-xs text-indigo-600 font-semibold capitalize bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">{course.skill}</span>
          {course.free && <span className="text-xs text-emerald-600 font-semibold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">Free</span>}
        </div>
      </div>
      <svg className="w-4 h-4 text-gray-300 group-hover:text-indigo-400 flex-shrink-0 mt-1 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
      </svg>
    </a>
  );
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function getCategory(skill, gapData) {
  const allGaps = gapData?.gaps || [];
  const found = allGaps.find((g) => g.skill === skill);
  if (found) return found.category;
  // check matched skills — they don't carry category, infer from name
  const cat = {
    languages:  ["python","java","javascript","typescript","c++","c#","go","rust","ruby","swift","kotlin","php","sql","r","html","css"],
    frameworks: ["react","angular","vue","next.js","node.js","express","django","flask","fastapi","spring","spring boot",".net","webpack","jetpack compose","swiftui"],
    databases:  ["postgresql","mysql","mongodb","redis","elasticsearch","dynamodb","cassandra","sqlite","firebase","core data"],
    cloud:      ["aws","azure","gcp","google cloud","docker","kubernetes","terraform","ansible","jenkins","ci/cd","heroku","vercel"],
    ml_ai:      ["machine learning","deep learning","tensorflow","pytorch","nlp","computer vision","pandas","numpy","spark","airflow","kafka"],
    tools:      ["git","github","jira","linux","agile","scrum","xcode","android sdk","ios sdk","mvvm","rest apis","testing","data structures","algorithms","system design","responsive design"],
  };
  for (const [key, skills] of Object.entries(cat)) {
    if (skills.some((s) => skill.toLowerCase().includes(s) || s.includes(skill.toLowerCase()))) return key;
  }
  return "general";
}

function buildCategoryStats(gapData) {
  const allRequired = [
    ...(gapData?.strong_matches || []).map((s) => ({ skill: s, has: true })),
    ...(gapData?.gaps || []).map((g) => ({ skill: g.skill, has: false, category: g.category })),
  ];
  const stats = {};
  for (const item of allRequired) {
    const cat = item.category || getCategory(item.skill, gapData);
    if (!stats[cat]) stats[cat] = { matched: 0, total: 0 };
    stats[cat].total++;
    if (item.has) stats[cat].matched++;
  }
  return stats;
}

// ─── main page ────────────────────────────────────────────────────────────────

function SkillsContent() {
  const [selectedRole, setSelectedRole] = useState("Software Engineer");
  const [gapData,       setGapData]       = useState(null);
  const [courses,       setCourses]       = useState(null);
  const [analyzing,     setAnalyzing]     = useState(false);
  const [loadingCourses, setLoadingCourses] = useState(false);
  const [error,         setError]         = useState("");
  const [activeTab,     setActiveTab]     = useState("gaps"); // gaps | courses | skills

  const analyze = useCallback(async () => {
    setAnalyzing(true);
    setGapData(null);
    setCourses(null);
    setError("");
    try {
      const data = await getSkillGapByRole(selectedRole);
      setGapData(data);
      if (data.gaps?.length > 0) {
        setLoadingCourses(true);
        const gapSkills = data.gaps.slice(0, 6).map((g) => g.skill);
        const fetchCourses = async () => {
          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              if (attempt > 0) await new Promise(r => setTimeout(r, 1200));
              const c = await getCourseRecommendations(gapSkills, selectedRole);
              if (c?.courses?.length > 0) { setCourses(c); return; }
            } catch (_) {}
          }
        };
        fetchCourses().finally(() => setLoadingCourses(false));
      }
      setActiveTab("gaps");
    } catch (err) {
      setError(err.response?.data?.error || "Analysis failed. Make sure you've uploaded a resume and all services are running.");
    } finally {
      setAnalyzing(false);
    }
  }, [selectedRole]);

  const categoryStats = gapData ? buildCategoryStats(gapData) : {};
  const highPriority   = (gapData?.gaps || []).filter((g) => g.priority === "high");
  const mediumPriority = (gapData?.gaps || []).filter((g) => g.priority === "medium");
  const lowPriority    = (gapData?.gaps || []).filter((g) => g.priority === "low");
  const learningPath   = courses?.learning_path || [];

  return (
    <ProtectedLayout>
      <div className="min-h-screen bg-gray-50">

        {/* Page header */}
        <div className="bg-white border-b border-gray-100 px-4 md:px-8 py-4 md:py-6">
          <div className="max-w-5xl mx-auto">
            <h1 className="text-2xl font-bold text-gray-900">Skill Gap Analysis</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Pick a target role to see exactly what you have, what you're missing, and how to close the gap.
            </p>
          </div>
        </div>

        <div className="max-w-5xl mx-auto px-4 md:px-8 py-4 md:py-8 space-y-6 md:space-y-8">

          {/* Role picker card */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <p className="text-sm font-bold text-gray-700 mb-4">Select Your Target Role</p>

            {/* Role grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 mb-5">
              {TARGET_ROLES.map((role) => (
                <button
                  key={role}
                  onClick={() => setSelectedRole(role)}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-left text-xs font-medium transition-all ${
                    selectedRole === role
                      ? "bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-200"
                      : "bg-gray-50 text-gray-700 border-gray-200 hover:border-indigo-300 hover:bg-indigo-50"
                  }`}
                >
                  <span className="text-base leading-none">{ROLE_ICONS[role] || "💼"}</span>
                  <span className="leading-tight">{role}</span>
                </button>
              ))}
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-100 rounded-xl text-sm text-red-700">
                {error}
              </div>
            )}

            <button
              onClick={analyze}
              disabled={analyzing}
              className="w-full py-3 bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-bold rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 shadow-md shadow-indigo-100 text-sm flex items-center justify-center gap-2"
            >
              {analyzing ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Analyzing your resume…
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  Analyze Skill Gap for {selectedRole}
                </>
              )}
            </button>
          </div>

          {/* Results */}
          {gapData && (
            <>
              {/* Summary hero */}
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                <div className="flex flex-col sm:flex-row items-center gap-8">
                  <MatchRing pct={gapData.match_percentage} size={160} />
                  <div className="flex-1 w-full space-y-4">
                    <div>
                      <h2 className="text-lg font-bold text-gray-900">
                        You as a <span className="text-indigo-600">{selectedRole}</span>
                      </h2>
                      <p className="text-sm text-gray-500 mt-0.5">{gapData.summary}</p>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <StatCard
                        value={gapData.strong_matches?.length || 0}
                        label="Skills matched"
                        color="bg-emerald-50"
                      />
                      <StatCard
                        value={gapData.gaps?.length || 0}
                        label="Skills to learn"
                        color="bg-rose-50"
                      />
                      <StatCard
                        value={courses?.total_estimated_hours ? `${courses.total_estimated_hours}h` : (gapData.gaps?.length || 0) * 8 + "h"}
                        label="Est. study time"
                        color="bg-indigo-50"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* Tab bar */}
              <div className="flex bg-white rounded-2xl border border-gray-100 shadow-sm p-1.5 gap-1">
                {[
                  { key: "gaps",    label: "Skill Gaps",      count: gapData.gaps?.length },
                  { key: "strengths", label: "Your Strengths", count: gapData.strong_matches?.length },
                  { key: "progress", label: "Category Progress", count: Object.keys(categoryStats).length },
                  { key: "courses", label: "Courses",          count: courses?.courses?.length || null },
                ].map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-xl text-xs font-semibold transition-all ${
                      activeTab === tab.key
                        ? "bg-indigo-600 text-white shadow-sm"
                        : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    {tab.label}
                    {tab.count != null && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold ${
                        activeTab === tab.key ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500"
                      }`}>
                        {tab.count}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* Tab: Skill Gaps */}
              {activeTab === "gaps" && (
                <div className="space-y-4">
                  {gapData.gaps?.length === 0 ? (
                    <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-8 text-center">
                      <div className="text-4xl mb-3">🎉</div>
                      <p className="font-bold text-emerald-800 text-lg">You already have all the key skills!</p>
                      <p className="text-sm text-emerald-600 mt-1">You're well-positioned for this role.</p>
                    </div>
                  ) : (
                    <>
                      {highPriority.length > 0 && (
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                          <div className="flex items-center gap-2 mb-4">
                            <span className="w-3 h-3 rounded-full bg-rose-500" />
                            <h3 className="font-bold text-gray-900 text-sm">Must Learn ({highPriority.length})</h3>
                            <span className="text-xs text-gray-400">Core requirements for this role</span>
                          </div>
                          <div className="space-y-2">
                            {highPriority.map((g) => <GapItem key={g.skill} gap={g} />)}
                          </div>
                        </div>
                      )}

                      {mediumPriority.length > 0 && (
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                          <div className="flex items-center gap-2 mb-4">
                            <span className="w-3 h-3 rounded-full bg-amber-500" />
                            <h3 className="font-bold text-gray-900 text-sm">Good to Have ({mediumPriority.length})</h3>
                            <span className="text-xs text-gray-400">Will strengthen your candidacy</span>
                          </div>
                          <div className="space-y-2">
                            {mediumPriority.map((g) => <GapItem key={g.skill} gap={g} />)}
                          </div>
                        </div>
                      )}

                      {lowPriority.length > 0 && (
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                          <div className="flex items-center gap-2 mb-4">
                            <span className="w-3 h-3 rounded-full bg-gray-400" />
                            <h3 className="font-bold text-gray-900 text-sm">Nice to Have ({lowPriority.length})</h3>
                            <span className="text-xs text-gray-400">Bonus points for your profile</span>
                          </div>
                          <div className="space-y-2">
                            {lowPriority.map((g) => <GapItem key={g.skill} gap={g} />)}
                          </div>
                        </div>
                      )}

                      {/* Learning path */}
                      {learningPath.length > 0 && (
                        <div className="bg-gradient-to-r from-indigo-50 to-violet-50 rounded-2xl border border-indigo-100 p-5">
                          <h3 className="font-bold text-indigo-900 text-sm mb-4">
                            🗺 Recommended Learning Path
                          </h3>
                          <div className="flex flex-wrap items-center gap-2">
                            {learningPath.map((skill, i) => (
                              <span key={skill} className="flex items-center gap-2">
                                <span className="flex items-center gap-1.5 bg-white text-indigo-700 font-semibold text-xs px-3 py-1.5 rounded-full border border-indigo-200 shadow-sm">
                                  <span className="w-4 h-4 bg-indigo-600 text-white text-[9px] font-black rounded-full flex items-center justify-center flex-shrink-0">
                                    {i + 1}
                                  </span>
                                  {skill}
                                </span>
                                {i < learningPath.length - 1 && (
                                  <svg className="w-4 h-4 text-indigo-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                  </svg>
                                )}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Inline courses */}
                      {(loadingCourses || courses) && (
                        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                          <div className="flex items-center justify-between mb-4">
                            <div>
                              <h3 className="font-bold text-gray-900 text-sm">📚 Recommended Courses</h3>
                              {courses?.total_estimated_hours > 0 && (
                                <p className="text-xs text-gray-400 mt-0.5">~{courses.total_estimated_hours}h total study time</p>
                              )}
                            </div>
                            {courses?.courses?.length > 0 && (
                              <button
                                onClick={() => setActiveTab("courses")}
                                className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors"
                              >
                                View all →
                              </button>
                            )}
                          </div>

                          {loadingCourses ? (
                            <div className="flex items-center gap-3 py-6 justify-center">
                              <div className="w-5 h-5 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                              <span className="text-sm text-gray-400">Finding best courses for your gaps…</span>
                            </div>
                          ) : courses?.courses?.length > 0 ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              {courses.courses.slice(0, 6).map((c, i) => <CourseCard key={i} course={c} />)}
                            </div>
                          ) : (
                            <p className="text-sm text-gray-400 text-center py-4">No courses found for these skills.</p>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Tab: Strengths */}
              {activeTab === "strengths" && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                  <h3 className="font-bold text-gray-900 mb-1">
                    Skills You Already Have ({gapData.strong_matches?.length || 0})
                  </h3>
                  <p className="text-xs text-gray-400 mb-5">
                    These match what {selectedRole} roles typically require — make sure they're on your resume.
                  </p>
                  {gapData.strong_matches?.length === 0 ? (
                    <div className="text-center py-8 text-gray-400">
                      <p className="text-sm">No exact matches found. Try re-uploading your resume with more detailed skills.</p>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {(gapData.strong_matches || []).map((skill) => {
                        const cat = getCategory(skill, gapData);
                        return <SkillChip key={skill} skill={skill} has={true} category={cat} />;
                      })}
                    </div>
                  )}

                  {/* Full required skills map */}
                  <div className="mt-8">
                    <h4 className="font-bold text-gray-900 text-sm mb-4">All Required Skills for {selectedRole}</h4>
                    <div className="flex flex-wrap gap-2">
                      {[
                        ...(gapData.strong_matches || []).map((s) => ({ skill: s, has: true })),
                        ...(gapData.gaps || []).map((g) => ({ skill: g.skill, has: false, category: g.category })),
                      ]
                        .sort((a, b) => (b.has ? 1 : 0) - (a.has ? 1 : 0))
                        .map(({ skill, has, category }) => (
                          <SkillChip key={skill} skill={skill} has={has}
                            category={category || getCategory(skill, gapData)} />
                        ))
                      }
                    </div>
                  </div>
                </div>
              )}

              {/* Tab: Category Progress */}
              {activeTab === "progress" && (
                <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
                  <h3 className="font-bold text-gray-900 mb-1">Skills by Category</h3>
                  <p className="text-xs text-gray-400 mb-6">How well you cover each technical domain for {selectedRole}.</p>
                  <div className="space-y-5">
                    {Object.entries(categoryStats)
                      .sort((a, b) => {
                        const pctA = a[1].total > 0 ? a[1].matched / a[1].total : 0;
                        const pctB = b[1].total > 0 ? b[1].matched / b[1].total : 0;
                        return pctB - pctA;
                      })
                      .map(([cat, stats]) => (
                        <CategoryBar key={cat} catKey={cat} matched={stats.matched} total={stats.total} />
                      ))}
                  </div>

                  <div className="mt-8 grid grid-cols-2 gap-3">
                    {Object.entries(categoryStats).map(([cat, stats]) => {
                      const cfg = CATEGORY_CONFIG[cat] || CATEGORY_CONFIG.general;
                      const pct = stats.total > 0 ? Math.round(stats.matched / stats.total * 100) : 0;
                      return (
                        <div key={cat} className={`${cfg.bg} rounded-xl border ${cfg.border} p-4`}>
                          <p className={`text-xs font-bold ${cfg.text} mb-1`}>{cfg.label}</p>
                          <p className="text-2xl font-black text-gray-900">{pct}%</p>
                          <p className="text-xs text-gray-400">{stats.matched} of {stats.total} skills</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Tab: Courses */}
              {activeTab === "courses" && (
                <div>
                  {loadingCourses && (
                    <div className="flex flex-col items-center gap-3 py-16">
                      <div className="w-10 h-10 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                      <p className="text-sm text-gray-500">Finding the best courses for your gaps…</p>
                    </div>
                  )}
                  {courses && !loadingCourses && (
                    <>
                      <div className="flex items-center justify-between mb-5">
                        <h3 className="font-bold text-gray-900">
                          Recommended Courses ({courses.courses?.length || 0})
                        </h3>
                        {courses.total_estimated_hours > 0 && (
                          <span className="text-xs text-gray-400 bg-gray-100 px-3 py-1 rounded-full">
                            ~{courses.total_estimated_hours}h total
                          </span>
                        )}
                      </div>
                      {gapData.gaps?.length === 0 ? (
                        <div className="text-center py-12 text-gray-400">
                          <p className="text-sm">No skill gaps — no courses needed! You're ready.</p>
                        </div>
                      ) : courses.courses?.length === 0 ? (
                        <div className="text-center py-12 text-gray-400">
                          <p className="text-sm">No courses found. Check your internet connection or try again.</p>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          {courses.courses.map((c, i) => <CourseCard key={i} course={c} />)}
                        </div>
                      )}
                    </>
                  )}
                  {!courses && !loadingCourses && (
                    <div className="text-center py-16 text-gray-400">
                      <p className="text-sm">Run the analysis first to get course recommendations.</p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* Empty state */}
          {!gapData && !analyzing && !error && (
            <div className="text-center py-20">
              <div className="w-20 h-20 bg-indigo-50 rounded-3xl flex items-center justify-center mx-auto mb-5">
                <svg className="w-10 h-10 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <h3 className="font-bold text-gray-800 text-lg mb-1">Pick a role and analyze</h3>
              <p className="text-sm text-gray-400 max-w-sm mx-auto">
                We'll compare your resume skills against what that role typically requires and show you exactly what to learn.
              </p>
            </div>
          )}

        </div>
      </div>
    </ProtectedLayout>
  );
}

export default function SkillsPage() {
  return (
    <Suspense fallback={
      <ProtectedLayout>
        <div className="flex justify-center p-16">
          <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </ProtectedLayout>
    }>
      <SkillsContent />
    </Suspense>
  );
}
