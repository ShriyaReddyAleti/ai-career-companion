"use client";
import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import dynamic from "next/dynamic";
import ProtectedLayout from "@/components/ProtectedLayout";
import { createConversation, sendMessage, evaluateCode } from "@/lib/api";
import { useAuth } from "@/lib/auth";

const MonacoEditor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

// ─── Constants ────────────────────────────────────────────────────────────────
const TARGET_ROLES = [
  "Software Engineer", "Frontend Engineer", "Backend Engineer", "Full Stack Engineer",
  "Data Scientist", "ML Engineer", "DevOps / SRE Engineer", "Data Engineer",
  "Cloud Engineer", "Android Engineer", "iOS Engineer", "Product Manager",
];

const BEHAVIORAL_COUNT = 4;
const TOTAL_QUESTIONS = 10;

const LANGUAGES = [
  { id: "python",     label: "Python" },
  { id: "javascript", label: "JavaScript" },
  { id: "java",       label: "Java" },
  { id: "cpp",        label: "C++" },
  { id: "sql",        label: "SQL" },
  { id: "go",         label: "Go" },
];

const STARTER_CODE = {
  python:     "# Write your solution here\n\ndef solution():\n    pass\n",
  javascript: "// Write your solution here\n\nfunction solution() {\n  \n}\n",
  java:       "// Write your solution here\n\npublic class Solution {\n    public static void main(String[] args) {\n        \n    }\n}\n",
  cpp:        "// Write your solution here\n#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    \n    return 0;\n}\n",
  sql:        "-- Write your SQL query here\n\nSELECT \n\nFROM \n\nWHERE \n",
  go:         "// Write your solution here\npackage main\n\nimport \"fmt\"\n\nfunc main() {\n    fmt.Println(\"Hello\")\n}\n",
};

// ─── Markdown renderer (same as chat) ─────────────────────────────────────────
function Markdown({ text }) {
  const lines = (text || "").split("\n");
  const elements = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (/^#{1,3}\s/.test(line)) {
      const level = line.match(/^(#+)/)[1].length;
      const content = line.replace(/^#+\s*/, "");
      const cls = level === 1 ? "text-base font-bold text-gray-900 mt-3 mb-1"
                : level === 2 ? "text-sm font-bold text-gray-800 mt-2 mb-1"
                : "text-sm font-semibold text-gray-700 mt-1";
      elements.push(<p key={i} className={cls}>{content}</p>);
    } else if (/^[-•*]\s/.test(line) || /^\d+\.\s/.test(line)) {
      const bullets = [];
      while (i < lines.length && (/^[-•*]\s/.test(lines[i]) || /^\d+\.\s/.test(lines[i]))) {
        bullets.push(<li key={i} className="ml-4">{lines[i].replace(/^[-•*\d.]+\s*/, "")}</li>);
        i++;
      }
      elements.push(<ul key={`ul${i}`} className="list-disc list-inside space-y-0.5 text-sm text-gray-700 my-1">{bullets}</ul>);
      continue;
    } else if (/^```/.test(line)) {
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) { codeLines.push(lines[i]); i++; }
      elements.push(
        <pre key={i} className="bg-gray-900 text-green-300 text-xs rounded-xl px-4 py-3 my-2 overflow-x-auto font-mono">
          <code>{codeLines.join("\n")}</code>
        </pre>
      );
    } else if (/^\|/.test(line)) {
      const tableLines = [];
      while (i < lines.length && /^\|/.test(lines[i])) { tableLines.push(lines[i]); i++; }
      const headers = tableLines[0].split("|").filter(c => c.trim());
      const rows = tableLines.slice(2).map(r => r.split("|").filter(c => c.trim()));
      elements.push(
        <div key={`t${i}`} className="overflow-x-auto my-2">
          <table className="text-xs w-full border-collapse">
            <thead><tr>{headers.map((h,j)=><th key={j} className="bg-gray-100 px-3 py-1.5 text-left font-semibold border border-gray-200">{h.trim()}</th>)}</tr></thead>
            <tbody>{rows.map((r,j)=><tr key={j} className="even:bg-gray-50">{r.map((c,k)=><td key={k} className="px-3 py-1.5 border border-gray-200 text-gray-600">{c.trim()}</td>)}</tr>)}</tbody>
          </table>
        </div>
      );
      continue;
    } else if (line.trim()) {
      elements.push(<p key={i} className="text-sm text-gray-700 leading-relaxed">{line}</p>);
    } else {
      elements.push(<div key={i} className="h-1" />);
    }
    i++;
  }
  return <div className="space-y-0.5">{elements}</div>;
}

// ─── Rating badge ─────────────────────────────────────────────────────────────
function RatingBadge({ rating }) {
  const color = rating >= 8 ? "bg-emerald-100 text-emerald-700 border-emerald-200"
    : rating >= 6 ? "bg-blue-100 text-blue-700 border-blue-200"
    : rating >= 4 ? "bg-amber-100 text-amber-700 border-amber-200"
    : "bg-red-100 text-red-700 border-red-200";
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full border ${color}`}>
      {rating}/10
    </span>
  );
}

// ─── Start screen ─────────────────────────────────────────────────────────────
function StartScreen({ onStart }) {
  const [role, setRole] = useState("Software Engineer");
  const [custom, setCustom] = useState("");
  return (
    <div className="flex flex-col items-center justify-center h-full px-6 text-center">
      <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-violet-600 to-indigo-600 flex items-center justify-center text-4xl mb-6 shadow-xl">
        🎤
      </div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">AI Mock Interview</h1>
      <p className="text-gray-500 text-sm mb-8 max-w-md">
        10 structured questions — 4 behavioral + 6 technical — with live AI feedback and a code editor for coding problems.
      </p>

      <div className="w-full max-w-sm space-y-4">
        <div className="grid grid-cols-3 gap-2 text-xs text-center">
          {[["🧠","4 Behavioral","STAR method"], ["💻","6 Technical","Coding + SQL"], ["📊","AI Grading","Per question"]].map(([icon,label,sub])=>(
            <div key={label} className="bg-white rounded-xl border border-gray-200 p-3 shadow-sm">
              <div className="text-2xl mb-1">{icon}</div>
              <div className="font-semibold text-gray-800">{label}</div>
              <div className="text-gray-400">{sub}</div>
            </div>
          ))}
        </div>

        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5 text-left">Target Role</label>
          <select
            value={role}
            onChange={e => setRole(e.target.value)}
            className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
          >
            {TARGET_ROLES.map(r => <option key={r}>{r}</option>)}
            <option value="__custom__">Other (type below)</option>
          </select>
          {role === "__custom__" && (
            <input
              value={custom}
              onChange={e => setCustom(e.target.value)}
              placeholder="e.g. Embedded Systems Engineer"
              className="mt-2 w-full px-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
            />
          )}
        </div>

        <button
          onClick={() => onStart(role === "__custom__" ? (custom || "Software Engineer") : role)}
          className="w-full py-3 bg-gradient-to-r from-violet-600 to-indigo-600 text-white font-bold rounded-xl hover:opacity-90 transition-opacity shadow-md text-sm"
        >
          Start Interview →
        </button>
      </div>
    </div>
  );
}

// ─── Webcam panel ─────────────────────────────────────────────────────────────
function WebcamPanel({ active }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  useEffect(() => {
    if (!active) return;
    navigator.mediaDevices?.getUserMedia({ video: true, audio: false })
      .then(stream => {
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch(() => {});
    return () => { streamRef.current?.getTracks().forEach(t => t.stop()); };
  }, [active]);

  return (
    <div className="bg-gray-900 rounded-xl overflow-hidden aspect-video flex items-center justify-center relative">
      <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover" />
      {!active && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center text-gray-500">
            <div className="text-4xl mb-2">📷</div>
            <p className="text-xs">Camera off</p>
          </div>
        </div>
      )}
      {active && (
        <div className="absolute top-2 right-2 flex items-center gap-1.5 bg-red-600 text-white text-[10px] font-bold px-2 py-1 rounded-full">
          <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
          REC
        </div>
      )}
    </div>
  );
}

// ─── Main interview content ───────────────────────────────────────────────────
function InterviewContent() {
  const { user } = useAuth();
  const [phase, setPhase] = useState("start"); // start | interview | report
  const [targetRole, setTargetRole] = useState("");
  const [convId, setConvId] = useState(null);
  const [qIndex, setQIndex] = useState(0); // 0-9
  const [questions, setQuestions] = useState([]); // {text, type, isCoding}
  const [answers, setAnswers] = useState([]);     // {answer, feedback, rating, code}
  const [currentAnswer, setCurrentAnswer] = useState("");
  const [currentCode, setCurrentCode] = useState("");
  const [language, setLanguage] = useState("python");
  const [feedback, setFeedback] = useState(null); // current Q feedback
  const [evaluating, setEvaluating] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const [waitingForQ, setWaitingForQ] = useState(false);
  const bottomRef = useRef(null);

  const isBehavioral = qIndex < BEHAVIORAL_COUNT;
  const isCoding = !isBehavioral;
  const isLastQ = qIndex === TOTAL_QUESTIONS - 1;
  const progress = ((qIndex) / TOTAL_QUESTIONS) * 100;

  const startInterview = async (role) => {
    setTargetRole(role);
    setPhase("interview");
    setCameraOn(true);

    try {
      const data = await createConversation("interview");
      setConvId(data.conversation.id);

      // Ask AI for the first question
      setWaitingForQ(true);
      const resp = await sendMessage(data.conversation.id,
        `Start the mock interview for a ${role} position. Ask question 1 of 10 (behavioral).`
      );
      const qText = resp.response;
      setQuestions([{ text: qText, isCoding: false, type: "Behavioral" }]);
      setWaitingForQ(false);
    } catch (e) {
      setQuestions([{ text: "Tell me about yourself and why you're interested in this role.", isCoding: false, type: "Behavioral" }]);
      setWaitingForQ(false);
    }
  };

  const submitAnswer = async () => {
    if (evaluating) return;
    const answer = isCoding ? currentCode : currentAnswer;
    if (!answer.trim()) return;
    setEvaluating(true);
    setFeedback(null);

    const currentQ = questions[qIndex];
    let evalResult = null;

    // For coding questions, evaluate code separately
    if (isCoding && convId) {
      try {
        evalResult = await evaluateCode(
          currentQ.text.replace("[CODING]", "").replace("[SQL]", "").trim(),
          currentCode,
          language,
          targetRole,
        );
      } catch (_) {}
    }

    // Get conversational feedback from AI
    let aiFeedback = "";
    let aiRating = evalResult?.rating || null;
    try {
      const msgContent = isCoding
        ? `Q${qIndex + 1} answer (${language}):\n\`\`\`${language}\n${currentCode}\n\`\`\``
        : `Q${qIndex + 1} answer: ${answer}`;

      const resp = await sendMessage(convId, msgContent);
      aiFeedback = resp.response;

      // Extract rating from response if present
      const ratingMatch = aiFeedback.match(/(\d+)\s*\/\s*10/);
      if (ratingMatch && !aiRating) aiRating = parseInt(ratingMatch[1]);
    } catch (_) {
      aiFeedback = "Great answer! Let's continue to the next question.";
    }

    const feedbackData = {
      answer,
      code: isCoding ? currentCode : null,
      language: isCoding ? language : null,
      feedback: aiFeedback,
      rating: aiRating,
      codeEval: evalResult,
    };
    setFeedback(feedbackData);
    setAnswers(prev => [...prev, { ...feedbackData, question: currentQ.text, qNum: qIndex + 1 }]);
    setEvaluating(false);
  };

  const nextQuestion = async () => {
    if (isLastQ) {
      setPhase("report");
      return;
    }

    const nextIdx = qIndex + 1;
    setQIndex(nextIdx);
    setCurrentAnswer("");
    setCurrentCode(STARTER_CODE[language]);
    setFeedback(null);
    setWaitingForQ(true);

    const isBeh = nextIdx < BEHAVIORAL_COUNT;
    const qType = isBeh ? "behavioral" : "technical/coding";

    try {
      const resp = await sendMessage(convId,
        `Ask question ${nextIdx + 1} of 10 (${qType}${!isBeh ? ` for ${targetRole}` : ""}).`
      );
      const qText = resp.response;
      const isCodingQ = /\[CODING\]|\[SQL\]/i.test(qText) || !isBeh;
      setQuestions(prev => [...prev, {
        text: qText,
        isCoding: isCodingQ,
        type: isBeh ? "Behavioral" : "Technical",
      }]);
    } catch (_) {
      setQuestions(prev => [...prev, {
        text: nextIdx < BEHAVIORAL_COUNT
          ? ["Describe a challenging project you led.", "Tell me about a conflict with a teammate and how you resolved it.", "Describe a time you had to learn something new very quickly."][nextIdx - 1] || "Describe a situation where you showed leadership."
          : ["Write a function to reverse a linked list.", "Design a rate limiter.", "Write a SQL query to find the second highest salary.", "Explain the CAP theorem.", "Write a function to detect a cycle in a graph.", "What is the difference between a mutex and a semaphore?"][nextIdx - BEHAVIORAL_COUNT] || "What is your approach to debugging a production issue?",
        isCoding: nextIdx >= BEHAVIORAL_COUNT,
        type: nextIdx < BEHAVIORAL_COUNT ? "Behavioral" : "Technical",
      }]);
    }
    setWaitingForQ(false);
  };

  useEffect(() => {
    if (language) setCurrentCode(STARTER_CODE[language]);
  }, [language]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [feedback, waitingForQ]);

  const currentQ = questions[qIndex];

  // ── Report screen ────────────────────────────────────────────────────────────
  if (phase === "report") {
    const avgRating = answers.reduce((s, a) => s + (a.rating || 5), 0) / Math.max(answers.length, 1);
    return (
      <ProtectedLayout>
        <div className="max-w-3xl mx-auto px-6 py-8">
          <div className="text-center mb-8">
            <div className="text-5xl mb-3">🎉</div>
            <h1 className="text-2xl font-bold text-gray-900">Interview Complete!</h1>
            <p className="text-gray-500 mt-1">Target role: <span className="font-semibold text-gray-700">{targetRole}</span></p>
            <div className={`inline-flex items-center gap-2 mt-3 px-4 py-2 rounded-full text-sm font-bold ${
              avgRating >= 7 ? "bg-emerald-100 text-emerald-700" : avgRating >= 5 ? "bg-amber-100 text-amber-700" : "bg-red-100 text-red-700"
            }`}>
              Overall: {avgRating.toFixed(1)}/10 — {avgRating >= 7 ? "Strong Performance" : avgRating >= 5 ? "Good Progress" : "Needs More Practice"}
            </div>
          </div>

          <div className="space-y-4">
            {answers.map((a, i) => (
              <div key={i} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                <div className="px-5 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded ${i < BEHAVIORAL_COUNT ? "bg-blue-100 text-blue-700" : "bg-violet-100 text-violet-700"}`}>
                      Q{a.qNum} {i < BEHAVIORAL_COUNT ? "Behavioral" : "Technical"}
                    </span>
                  </div>
                  {a.rating && <RatingBadge rating={a.rating} />}
                </div>
                <div className="px-5 py-4 space-y-3">
                  <p className="text-sm font-semibold text-gray-800"><Markdown text={a.question} /></p>

                  {a.code ? (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 mb-1">Your code ({a.language}):</p>
                      <pre className="bg-gray-900 text-green-300 text-xs rounded-xl px-4 py-3 overflow-x-auto font-mono">{a.code}</pre>
                    </div>
                  ) : (
                    <div className="bg-gray-50 rounded-xl px-4 py-3">
                      <p className="text-xs font-semibold text-gray-500 mb-1">Your answer:</p>
                      <p className="text-sm text-gray-700">{a.answer}</p>
                    </div>
                  )}

                  {a.codeEval && (
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className={`px-3 py-2 rounded-lg ${a.codeEval.correct ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                        {a.codeEval.correct ? "✓ Correct solution" : "✗ Incorrect / incomplete"}
                      </div>
                      <div className="bg-gray-50 px-3 py-2 rounded-lg text-gray-600">
                        Time: {a.codeEval.time_complexity} · Space: {a.codeEval.space_complexity}
                      </div>
                    </div>
                  )}

                  <div className="bg-indigo-50 rounded-xl px-4 py-3">
                    <p className="text-xs font-bold text-indigo-600 mb-1">AI Feedback</p>
                    <Markdown text={a.feedback} />
                  </div>

                  {a.codeEval?.optimal_solution && (
                    <details className="group">
                      <summary className="text-xs font-semibold text-gray-500 cursor-pointer hover:text-gray-700">
                        View optimal solution ▸
                      </summary>
                      <pre className="mt-2 bg-gray-900 text-emerald-300 text-xs rounded-xl px-4 py-3 overflow-x-auto font-mono">{a.codeEval.optimal_solution}</pre>
                    </details>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 flex gap-3 justify-center">
            <button onClick={() => { setPhase("start"); setAnswers([]); setQuestions([]); setQIndex(0); setCameraOn(false); }}
              className="px-6 py-2.5 bg-violet-600 text-white font-semibold rounded-xl hover:bg-violet-700 text-sm">
              Practice Again
            </button>
            <button onClick={() => window.location.href = "/chat"}
              className="px-6 py-2.5 border border-gray-200 text-gray-600 font-semibold rounded-xl hover:bg-gray-50 text-sm">
              Back to Chat
            </button>
          </div>
        </div>
      </ProtectedLayout>
    );
  }

  // ── Start screen ─────────────────────────────────────────────────────────────
  if (phase === "start") {
    return (
      <ProtectedLayout>
        <StartScreen onStart={startInterview} />
      </ProtectedLayout>
    );
  }

  // ── Interview screen ──────────────────────────────────────────────────────────
  return (
    <ProtectedLayout>
      <div className="flex h-screen overflow-hidden bg-gray-50">

        {/* Left: question + answer */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Progress header */}
          <div className="bg-white border-b border-gray-200 px-6 py-3 flex-shrink-0">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <span className="text-sm font-bold text-gray-900">
                  Question {Math.min(qIndex + 1, TOTAL_QUESTIONS)} / {TOTAL_QUESTIONS}
                </span>
                <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                  isBehavioral ? "bg-blue-100 text-blue-700" : "bg-violet-100 text-violet-700"
                }`}>
                  {isBehavioral ? "Behavioral" : "Technical"}
                </span>
              </div>
              <span className="text-xs text-gray-400">{targetRole}</span>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-violet-500 to-indigo-500 rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }} />
            </div>
            <div className="flex justify-between mt-1">
              <span className="text-[10px] text-blue-500 font-medium">Q1–4 Behavioral</span>
              <span className="text-[10px] text-violet-500 font-medium">Q5–10 Technical</span>
            </div>
          </div>

          {/* Question */}
          <div className="px-6 pt-5 flex-shrink-0">
            {waitingForQ ? (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 flex items-center gap-3">
                <div className="w-5 h-5 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-sm text-gray-500">Preparing next question…</span>
              </div>
            ) : currentQ ? (
              <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                <div className="flex items-start gap-3">
                  <span className="w-7 h-7 bg-violet-100 text-violet-700 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
                    {qIndex + 1}
                  </span>
                  <div className="flex-1">
                    <Markdown text={currentQ.text.replace(/\[CODING\]|\[SQL\]|\[SYSTEM DESIGN\]|\[CONCEPT\]/gi, "")} />
                    {currentQ.isCoding && (
                      <span className="inline-flex items-center gap-1 mt-2 text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full font-medium">
                        💻 Write your code below
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          {/* Answer area */}
          <div className="flex-1 px-6 py-4 overflow-y-auto">
            {!waitingForQ && currentQ && !feedback && (
              isCoding ? (
                <div className="space-y-2 h-full">
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-semibold text-gray-600">Language:</label>
                    {LANGUAGES.map(l => (
                      <button key={l.id} onClick={() => setLanguage(l.id)}
                        className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-colors ${
                          language === l.id ? "bg-violet-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                        }`}>
                        {l.label}
                      </button>
                    ))}
                  </div>
                  <div className="h-64 rounded-xl overflow-hidden border border-gray-200">
                    <MonacoEditor
                      height="100%"
                      language={language === "cpp" ? "cpp" : language}
                      value={currentCode || STARTER_CODE[language]}
                      onChange={v => setCurrentCode(v || "")}
                      theme="vs-dark"
                      options={{
                        minimap: { enabled: false },
                        fontSize: 13,
                        lineNumbers: "on",
                        scrollBeyondLastLine: false,
                        automaticLayout: true,
                        tabSize: 2,
                      }}
                    />
                  </div>
                </div>
              ) : (
                <textarea
                  value={currentAnswer}
                  onChange={e => setCurrentAnswer(e.target.value)}
                  placeholder="Type your answer here… (use the STAR method: Situation → Task → Action → Result)"
                  rows={7}
                  className="w-full px-4 py-3 border border-gray-200 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 resize-none bg-white"
                />
              )
            )}

            {/* Feedback panel */}
            {feedback && (
              <div className="space-y-3" ref={bottomRef}>
                {feedback.codeEval && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className={`px-4 py-3 rounded-xl text-sm font-semibold ${
                      feedback.codeEval.correct ? "bg-emerald-50 text-emerald-700 border border-emerald-100" : "bg-red-50 text-red-700 border border-red-100"
                    }`}>
                      {feedback.codeEval.correct ? "✓ Correct!" : "✗ Not quite right"}
                    </div>
                    <div className="bg-gray-50 px-4 py-3 rounded-xl text-sm text-gray-600">
                      <span className="font-medium">Time:</span> {feedback.codeEval.time_complexity} &nbsp;
                      <span className="font-medium">Space:</span> {feedback.codeEval.space_complexity}
                    </div>
                  </div>
                )}

                <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-5">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-bold text-indigo-900">AI Feedback</p>
                    {feedback.rating && <RatingBadge rating={feedback.rating} />}
                  </div>
                  <Markdown text={feedback.feedback} />
                </div>

                {feedback.codeEval?.improvements?.length > 0 && (
                  <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4">
                    <p className="text-xs font-bold text-amber-800 mb-2">Improvements</p>
                    <ul className="space-y-1">
                      {feedback.codeEval.improvements.map((imp, i) => (
                        <li key={i} className="text-xs text-amber-700 flex gap-2"><span>→</span>{imp}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {feedback.codeEval?.optimal_solution && (
                  <details className="group">
                    <summary className="text-xs font-semibold text-gray-500 cursor-pointer hover:text-gray-700 bg-white border border-gray-200 rounded-xl px-4 py-2">
                      View optimal solution ▸
                    </summary>
                    <pre className="mt-2 bg-gray-900 text-emerald-300 text-xs rounded-xl px-4 py-3 overflow-x-auto font-mono">{feedback.codeEval.optimal_solution}</pre>
                  </details>
                )}
              </div>
            )}

            {/* Submit / Next buttons */}
            {!waitingForQ && currentQ && (
              <div className="mt-4 flex gap-3">
                {!feedback ? (
                  <button
                    onClick={submitAnswer}
                    disabled={evaluating || !(isCoding ? currentCode?.trim() : currentAnswer.trim())}
                    className="flex items-center gap-2 px-6 py-2.5 bg-violet-600 hover:bg-violet-700 text-white font-semibold rounded-xl text-sm transition-colors disabled:opacity-40"
                  >
                    {evaluating ? (
                      <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Evaluating…</>
                    ) : "Submit Answer →"}
                  </button>
                ) : (
                  <button
                    onClick={nextQuestion}
                    className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl text-sm transition-colors"
                  >
                    {isLastQ ? "View Report 🎉" : `Next Question →`}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right: webcam + sidebar info */}
        <div className="w-72 flex-shrink-0 border-l border-gray-200 bg-white flex flex-col p-4 gap-4">
          <WebcamPanel active={cameraOn} />

          <div className="space-y-2">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Progress</p>
            <div className="grid grid-cols-5 gap-1">
              {Array.from({ length: TOTAL_QUESTIONS }).map((_, i) => (
                <div key={i} className={`h-2 rounded-full transition-colors ${
                  i < qIndex ? "bg-emerald-500"
                  : i === qIndex ? "bg-violet-500 animate-pulse"
                  : "bg-gray-100"
                }`} />
              ))}
            </div>
            <div className="flex justify-between text-[10px] text-gray-400">
              <span>Behavioral (1–4)</span>
              <span>Technical (5–10)</span>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Tips</p>
            <div className="space-y-2">
              {isBehavioral ? (
                [
                  "Use the STAR method (Situation → Task → Action → Result)",
                  "Be specific — mention team size, timelines, tools used",
                  "Quantify results when possible (%, time saved, users affected)",
                ].map((tip, i) => (
                  <p key={i} className="text-xs text-gray-500 flex gap-1.5"><span className="text-blue-400">•</span>{tip}</p>
                ))
              ) : (
                [
                  "Think out loud — interviewers care about your process",
                  "Start with a brute force, then optimize",
                  "Consider edge cases: empty input, single element, duplicates",
                  "Mention time & space complexity after you solve it",
                ].map((tip, i) => (
                  <p key={i} className="text-xs text-gray-500 flex gap-1.5"><span className="text-violet-400">•</span>{tip}</p>
                ))
              )}
            </div>
          </div>

          {answers.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Answered</p>
              {answers.map((a, i) => (
                <div key={i} className="flex items-center justify-between text-xs bg-gray-50 px-3 py-1.5 rounded-lg">
                  <span className="text-gray-600">Q{a.qNum}</span>
                  {a.rating ? <RatingBadge rating={a.rating} /> : <span className="text-gray-400">—</span>}
                </div>
              ))}
            </div>
          )}

          <button
            onClick={() => { if (confirm("End interview and view report?")) setPhase("report"); }}
            className="mt-auto text-xs text-gray-400 hover:text-red-500 transition-colors text-center"
          >
            End Interview Early
          </button>
        </div>
      </div>
    </ProtectedLayout>
  );
}

export default function InterviewPage() {
  return (
    <Suspense fallback={
      <ProtectedLayout>
        <div className="flex justify-center p-16">
          <div className="w-8 h-8 border-4 border-violet-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </ProtectedLayout>
    }>
      <InterviewContent />
    </Suspense>
  );
}
