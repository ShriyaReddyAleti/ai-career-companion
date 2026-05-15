"use client";
import { useState, useEffect, useRef, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import ProtectedLayout from "@/components/ProtectedLayout";
import { createConversation, getConversations, getMessages, sendMessage } from "@/lib/api";
import { useAuth } from "@/lib/auth";

// ─── Markdown renderer (headers, bold, bullets, code) ─────────────────────────
function Markdown({ text }) {
  const lines = (text || "").split("\n");
  const elements = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (/^#{1,3}\s/.test(line)) {
      const level = line.match(/^(#+)/)[1].length;
      const content = line.replace(/^#+\s*/, "");
      const Tag = `h${Math.min(level + 2, 6)}`;
      const cls = level === 1 ? "text-base font-bold text-gray-900 mt-3 mb-1"
                : level === 2 ? "text-sm font-bold text-gray-800 mt-2 mb-1"
                : "text-sm font-semibold text-gray-700 mt-1";
      elements.push(<Tag key={i} className={cls}>{inlineFormat(content)}</Tag>);
    } else if (/^[-•*]\s/.test(line) || /^\d+\.\s/.test(line)) {
      const bullets = [];
      while (i < lines.length && (/^[-•*]\s/.test(lines[i]) || /^\d+\.\s/.test(lines[i]))) {
        bullets.push(<li key={i} className="ml-4">{inlineFormat(lines[i].replace(/^[-•*\d.]+\s*/, ""))}</li>);
        i++;
      }
      elements.push(<ul key={`ul-${i}`} className="space-y-0.5 text-sm text-gray-700 my-1 list-disc list-inside">{bullets}</ul>);
      continue;
    } else if (/^```/.test(line)) {
      const lang = line.replace(/^```/, "").trim();
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      elements.push(
        <pre key={i} className="bg-gray-900 text-green-300 text-xs rounded-xl px-4 py-3 my-2 overflow-x-auto font-mono leading-relaxed">
          <code>{codeLines.join("\n")}</code>
        </pre>
      );
    } else if (/^\|/.test(line)) {
      const tableLines = [];
      while (i < lines.length && /^\|/.test(lines[i])) {
        tableLines.push(lines[i]);
        i++;
      }
      const headers = tableLines[0].split("|").filter(c => c.trim());
      const rows = tableLines.slice(2).map(r => r.split("|").filter(c => c.trim()));
      elements.push(
        <div key={`table-${i}`} className="overflow-x-auto my-2">
          <table className="text-xs w-full border-collapse">
            <thead><tr>{headers.map((h,j) => <th key={j} className="bg-gray-100 px-3 py-1.5 text-left font-semibold text-gray-700 border border-gray-200">{h.trim()}</th>)}</tr></thead>
            <tbody>{rows.map((r,j) => <tr key={j} className="even:bg-gray-50">{r.map((c,k) => <td key={k} className="px-3 py-1.5 text-gray-600 border border-gray-200">{c.trim()}</td>)}</tr>)}</tbody>
          </table>
        </div>
      );
      continue;
    } else if (line.trim()) {
      elements.push(<p key={i} className="text-sm text-gray-700 leading-relaxed my-0.5">{inlineFormat(line)}</p>);
    } else {
      elements.push(<div key={i} className="h-1" />);
    }
    i++;
  }
  return <div className="space-y-0.5">{elements}</div>;
}

function inlineFormat(text) {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return parts.map((p, i) => {
    if (p.startsWith("**") && p.endsWith("**")) return <strong key={i} className="font-semibold text-gray-900">{p.slice(2,-2)}</strong>;
    if (p.startsWith("*") && p.endsWith("*")) return <em key={i}>{p.slice(1,-1)}</em>;
    if (p.startsWith("`") && p.endsWith("`")) return <code key={i} className="bg-gray-100 text-rose-600 text-xs px-1.5 py-0.5 rounded font-mono">{p.slice(1,-1)}</code>;
    return p;
  });
}

// ─── Conversation modes ───────────────────────────────────────────────────────
const MODES = [
  {
    key: "general",
    label: "Career Coach",
    icon: "🎯",
    color: "indigo",
    desc: "Roadmaps, job search, salary advice",
    placeholder: "Ask me about your career path, salary negotiation, job search strategy…",
    suggestions: [
      "Give me a 6-month roadmap to become a senior engineer",
      "How do I negotiate a higher salary?",
      "What skills should I focus on for ML Engineer roles?",
      "Help me prepare for a system design interview",
    ],
  },
  {
    key: "resume",
    label: "Resume Coach",
    icon: "📄",
    color: "emerald",
    desc: "Rewrite bullets, fix weak sections",
    placeholder: "Paste a bullet point or section and I'll improve it…",
    suggestions: [
      "Review my resume and tell me what's weak",
      "Rewrite this bullet: 'Worked on backend APIs'",
      "How do I write a strong professional summary?",
      "What keywords am I missing for a DevOps role?",
    ],
  },
  {
    key: "interview_coach",
    label: "Interview Prep",
    icon: "🏆",
    color: "violet",
    desc: "STAR answers, technical explanations",
    placeholder: "Ask about interview questions, STAR method, or any technical topic…",
    suggestions: [
      "Give me 5 common behavioral questions and strong answers",
      "Explain the STAR method with an example from my background",
      "How do I answer 'What's your greatest weakness?'",
      "Explain consistent hashing like I'm interviewing at Amazon",
    ],
  },
];

const COLOR = {
  indigo: { btn: "bg-indigo-600 hover:bg-indigo-700", ring: "ring-indigo-500", tab: "border-indigo-600 text-indigo-600", badge: "bg-indigo-100 text-indigo-700", dot: "bg-indigo-500" },
  emerald: { btn: "bg-emerald-600 hover:bg-emerald-700", ring: "ring-emerald-500", tab: "border-emerald-600 text-emerald-600", badge: "bg-emerald-100 text-emerald-700", dot: "bg-emerald-500" },
  violet: { btn: "bg-violet-600 hover:bg-violet-700", ring: "ring-violet-500", tab: "border-violet-600 text-violet-600", badge: "bg-violet-100 text-violet-700", dot: "bg-violet-500" },
};

function Message({ msg, mode }) {
  const isUser = msg.role === "user";
  const modeColor = COLOR[MODES.find(m => m.key === mode)?.color || "indigo"];
  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold ${
        isUser ? `${modeColor.btn} text-white` : "bg-gradient-to-br from-slate-700 to-slate-900 text-white"
      }`}>
        {isUser ? "You" : "AI"}
      </div>
      <div className={`max-w-[78%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${
        isUser
          ? `${modeColor.btn} text-white rounded-tr-none`
          : "bg-white border border-gray-200 text-gray-800 rounded-tl-none shadow-sm"
      }`}>
        {isUser ? <span className="whitespace-pre-wrap">{msg.content}</span> : <Markdown text={msg.content} />}
      </div>
    </div>
  );
}

// ─── Main chat content ────────────────────────────────────────────────────────
function ChatContent() {
  const searchParams = useSearchParams();
  const { user } = useAuth();

  const initMode = searchParams.get("mode") === "resume" ? "resume"
    : searchParams.get("mode") === "interview_coach" ? "interview_coach"
    : "general";

  const [mode, setMode] = useState(initMode);
  const [conversations, setConversations] = useState([]);
  const [activeConvId, setActiveConvId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loadingMsgs, setLoadingMsgs] = useState(false);

  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  const currentMode = MODES.find(m => m.key === mode) || MODES[0];
  const mc = COLOR[currentMode.color];

  const loadConversations = useCallback(() =>
    getConversations().then(d => setConversations(d.conversations || [])).catch(() => {}), []);

  useEffect(() => { loadConversations(); }, [loadConversations]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const startNew = async (selectedMode) => {
    const apiType = selectedMode === "interview_coach" ? "general" : selectedMode;
    try {
      const data = await createConversation(apiType);
      const conv = data.conversation;
      setConversations(prev => [conv, ...prev]);
      setActiveConvId(conv.id);
      setMode(selectedMode);
      setMessages([]);
      inputRef.current?.focus();
    } catch (_) {}
  };

  const selectConv = async (conv) => {
    setActiveConvId(conv.id);
    setLoadingMsgs(true);
    try {
      const data = await getMessages(conv.id);
      setMessages(data.messages || []);
    } catch (_) { setMessages([]); }
    finally { setLoadingMsgs(false); }
    const t = conv.conversation_type;
    setMode(t === "resume" ? "resume" : t === "interview" ? "interview_coach" : "general");
    inputRef.current?.focus();
  };

  const handleSend = async (text) => {
    const msg = (text || input).trim();
    if (!msg || sending) return;

    let convId = activeConvId;
    if (!convId) {
      try {
        const apiType = mode === "interview_coach" ? "general" : mode;
        const data = await createConversation(apiType);
        convId = data.conversation.id;
        setActiveConvId(convId);
        setConversations(prev => [data.conversation, ...prev]);
      } catch (_) { return; }
    }

    setMessages(prev => [...prev, { role: "user", content: msg }]);
    setInput("");
    setSending(true);

    try {
      const data = await sendMessage(convId, msg);
      setMessages(prev => [...prev, { role: "assistant", content: data.response }]);
      await loadConversations();
    } catch (_) {
      setMessages(prev => [...prev, {
        role: "assistant",
        content: "Sorry, I couldn't reach the AI service. Make sure the chatbot service is running on port 8005.",
      }]);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  return (
    <ProtectedLayout>
      <div className="flex h-screen overflow-hidden bg-gray-50">

        {/* ── Sidebar ── */}
        <div className="w-64 flex-shrink-0 border-r border-gray-200 bg-white flex flex-col">
          <div className="p-4 border-b border-gray-100">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Mode</p>
            <div className="space-y-1.5">
              {MODES.map(m => (
                <button
                  key={m.key}
                  onClick={() => { setMode(m.key); startNew(m.key); }}
                  className={`w-full text-left px-3 py-2.5 rounded-xl text-sm font-medium transition-all flex items-center gap-2.5 ${
                    mode === m.key
                      ? `${COLOR[m.color].badge} border border-current`
                      : "text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  <span className="text-base">{m.icon}</span>
                  <div>
                    <p className="font-semibold leading-tight">{m.label}</p>
                    <p className="text-[10px] text-gray-400 leading-tight">{m.desc}</p>
                  </div>
                </button>
              ))}
            </div>

            <div className="mt-3 pt-3 border-t border-gray-100">
              <Link
                href="/interview"
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-600 hover:bg-gray-50 transition-all"
              >
                <span className="text-base">🎤</span>
                <div>
                  <p className="font-semibold leading-tight">Mock Interview</p>
                  <p className="text-[10px] text-gray-400 leading-tight">10 Qs · code editor · webcam</p>
                </div>
              </Link>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider px-2 py-1">History</p>
            {conversations.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-4">No conversations yet</p>
            )}
            {conversations.map(conv => (
              <button
                key={conv.id}
                onClick={() => selectConv(conv)}
                className={`w-full text-left px-3 py-2.5 rounded-xl text-xs transition-colors ${
                  conv.id === activeConvId ? "bg-gray-100 font-medium" : "hover:bg-gray-50 text-gray-600"
                }`}
              >
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span>{conv.conversation_type === "resume" ? "📄" : conv.conversation_type === "interview" ? "🏆" : "🎯"}</span>
                  <span className="truncate font-medium text-gray-700">
                    {conv.conversation_type === "resume" ? "Resume Coach" : conv.conversation_type === "interview" ? "Interview Prep" : "Career Coach"}
                  </span>
                </div>
                <p className="text-gray-400">{conv.message_count || 0} messages</p>
              </button>
            ))}
          </div>
        </div>

        {/* ── Main ── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className={`w-9 h-9 rounded-xl ${mc.btn} flex items-center justify-center text-lg`}>
                {currentMode.icon}
              </div>
              <div>
                <p className="font-bold text-gray-900 text-sm">{currentMode.label}</p>
                <p className="text-xs text-gray-400">{currentMode.desc}</p>
              </div>
            </div>
            <Link href="/interview"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 text-white text-xs font-semibold rounded-lg hover:bg-violet-700 transition-colors">
              🎤 Mock Interview
            </Link>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
            {!activeConvId && messages.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <div className={`w-16 h-16 rounded-2xl ${mc.btn} flex items-center justify-center text-3xl mb-4`}>
                  {currentMode.icon}
                </div>
                <h2 className="text-lg font-bold text-gray-900 mb-1">{currentMode.label}</h2>
                <p className="text-sm text-gray-400 mb-6 max-w-sm">{currentMode.desc}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-lg">
                  {currentMode.suggestions.map(q => (
                    <button key={q} onClick={() => handleSend(q)}
                      className="p-3 text-xs text-left text-gray-600 bg-white border border-gray-200 rounded-xl hover:border-gray-300 hover:shadow-sm transition-all">
                      {q}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {loadingMsgs && (
              <div className="flex justify-center py-8">
                <div className={`w-6 h-6 border-4 border-t-transparent rounded-full animate-spin ${mc.ring} ring-2`} />
              </div>
            )}

            {messages.map((msg, i) => <Message key={i} msg={msg} mode={mode} />)}

            {sending && (
              <div className="flex gap-3">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-slate-700 to-slate-900 flex items-center justify-center text-xs font-bold text-white">AI</div>
                <div className="bg-white border border-gray-200 px-4 py-3 rounded-2xl rounded-tl-none shadow-sm flex items-center gap-1">
                  <span className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-2 h-2 bg-gray-300 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="bg-white border-t border-gray-200 px-6 py-4 flex-shrink-0">
            <div className="flex gap-3 items-end max-w-4xl mx-auto">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                placeholder={currentMode.placeholder}
                rows={1}
                className="flex-1 px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 resize-none max-h-40 overflow-y-auto"
                style={{ minHeight: "46px" }}
              />
              <button
                onClick={() => handleSend()}
                disabled={!input.trim() || sending}
                className={`p-3 ${mc.btn} text-white rounded-xl transition-colors disabled:opacity-40 flex-shrink-0`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            </div>
            <p className="text-xs text-gray-400 text-center mt-2">Enter to send · Shift+Enter for new line</p>
          </div>
        </div>
      </div>
    </ProtectedLayout>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={
      <ProtectedLayout>
        <div className="flex justify-center p-16">
          <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        </div>
      </ProtectedLayout>
    }>
      <ChatContent />
    </Suspense>
  );
}
