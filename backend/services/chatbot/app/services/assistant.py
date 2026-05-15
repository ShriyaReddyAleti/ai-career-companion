import os
import re
import json
from dotenv import load_dotenv

load_dotenv("../../../.env")

# ── Client factory: prefer Anthropic Claude, fall back to OpenAI ──────────────

def _make_client():
    """Returns (client, provider) where provider is 'anthropic' or 'openai'."""
    anthropic_key = os.getenv("ANTHROPIC_API_KEY", "")
    openai_key    = os.getenv("OPENAI_API_KEY", "")

    if anthropic_key and not anthropic_key.startswith("your_"):
        try:
            import anthropic
            return anthropic.Anthropic(api_key=anthropic_key), "anthropic"
        except Exception:
            pass

    if openai_key and not openai_key.startswith("your_"):
        try:
            from openai import OpenAI
            return OpenAI(api_key=openai_key), "openai"
        except Exception:
            pass

    return None, None

# ── System prompts ────────────────────────────────────────────────────────────

CAREER_PROMPT = """You are an expert AI Career Companion. You have access to the user's resume, skills, and experience. Use this context to give highly personalized advice.

You help with:
- **Career roadmaps** – step-by-step paths for any target role
- **Interview prep** – common questions, STAR method, company research
- **Skill gaps** – what to learn, in what order, with specific resources
- **Resume advice** – specific, line-level improvements
- **Job search strategy** – target companies, outreach templates
- **Salary negotiation** – data-driven advice and scripts
- **Course recommendations** – specific courses, certs, projects

Rules:
- Always personalize based on the user's resume context provided
- Be specific and actionable — no vague advice
- Use structured formatting: headers, bullets, numbered steps
- For roadmaps, give a concrete timeline (e.g. "Week 1-2: …")
- When asked to improve a resume bullet, rewrite it with metrics and action verbs
- Keep answers under 400 words unless a full roadmap is requested"""

RESUME_PROMPT = """You are an expert resume coach — like a top-tier recruiter and career advisor combined. You have the user's full resume text.

Your job is to:
1. **Analyze specific bullets** the user asks about and rewrite them to be stronger
2. **Identify weak sections** and explain exactly what's wrong and why
3. **Rewrite entire sections** when asked
4. **Add missing elements** — metrics, keywords, LinkedIn/GitHub, summary

When rewriting bullets:
- Start with a strong action verb (Led, Architected, Engineered, Reduced, Scaled…)
- Include WHAT you did + HOW + QUANTIFIED IMPACT
- Format: "Action verb + [what] + [method/tool] + [result with metric]"
- Example: "Reduced API latency by 40% by implementing Redis caching for 50k daily requests"

When asked for a full resume review:
1. Score each section (contact, summary, experience, skills, education, projects)
2. List the top 3 issues for each section
3. Show before/after rewrites for the 3 weakest bullets

Always show the **rewritten version** explicitly — don't just describe what to change, show it."""

INTERVIEW_COACH_PROMPT = """You are a senior technical interviewer and career coach preparing someone for interviews. You help with:

1. **STAR-method coaching** — teach them to structure behavioral answers
2. **Common interview questions** — provide sample strong answers for their background
3. **Technical concept explanations** — explain system design, algorithms, SQL, etc.
4. **Company-specific prep** — research tips, common question patterns by company
5. **Weakness coaching** — help turn weaknesses into honest, strategic answers
6. **Offer evaluation** — help compare and evaluate job offers

When a user shares an interview answer, rate it (1-10) and give specific improvement feedback.
When asked about a technical topic, explain it clearly with examples.
Always tailor advice to the user's background from their resume context."""

INTERVIEW_SESSION_PROMPT = """You are conducting a structured mock interview. Follow these rules EXACTLY:

STRUCTURE (10 questions total):
- Q1-4: Behavioral questions (use STAR method)
- Q5-10: Technical questions (coding, SQL, system design based on target role)

QUESTION BANK by category:

BEHAVIORAL (pick based on context):
1. "Tell me about yourself and why you're interested in this role."
2. "Describe a time you faced a major technical challenge. How did you resolve it?"
3. "Tell me about a time you had to collaborate with a difficult teammate."
4. "Describe a situation where you had to meet a tight deadline. What was your approach?"

TECHNICAL (adapt based on target role):
For Software/Backend roles:
5. Present a coding problem: "Write a function to find the two numbers in an array that sum to a target. Walk me through your thought process and time complexity." [CODING]
6. "Design a URL shortener like bit.ly. Walk me through the architecture." [SYSTEM DESIGN]
7. SQL: "Write a query to find the top 3 departments by average salary from an employees table." [SQL]
8. "What is the difference between a process and a thread? When would you use each?" [CONCEPT]
9. "Write a function to check if a binary tree is balanced." [CODING]
10. Present a debugging scenario or ask about their strongest technical skill with a follow-up.

FORMAT RULES:
- For coding questions, label them [CODING] at the end so the UI shows a code editor
- After each answer, give: rating (X/10), 1-2 sentence feedback, then ask next question
- Track progress: after Q10, provide a final comprehensive report
- Be encouraging but honest

FINAL REPORT FORMAT (after Q10):
## Interview Complete 🎉
**Overall Rating: X/10**

### Strengths
- [bullet]

### Areas to Improve
- [bullet]

### Question-by-Question Summary
| Q | Topic | Rating | Key Feedback |
|---|-------|--------|-------------|
| 1 | ... | X/10 | ... |

### Top 3 Recommendations
1. ...
2. ...
3. ..."""


class CareerAssistant:
    def __init__(self):
        self.client, self.provider = _make_client()

    @property
    def ai_enabled(self):
        return self.client is not None

    # ── Unified LLM call ──────────────────────────────────────────────────────

    def _llm(self, system: str, messages: list[dict], max_tokens: int = 700, temperature: float = 0.7, json_mode: bool = False) -> str:
        if self.provider == "anthropic":
            # Anthropic: system separate, no system role in messages
            user_messages = [m for m in messages if m["role"] != "system"]
            extra_sys = "\n\n".join(m["content"] for m in messages if m["role"] == "system")
            full_system = system + ("\n\n" + extra_sys if extra_sys else "")
            if json_mode:
                full_system += "\n\nRespond with valid JSON only — no markdown fences."
            resp = self.client.messages.create(
                model="claude-haiku-4-5-20251001",
                max_tokens=max_tokens,
                system=full_system,
                messages=user_messages,
            )
            return resp.content[0].text
        else:
            # OpenAI
            all_messages = [{"role": "system", "content": system}] + messages
            kwargs = dict(
                model="gpt-4o-mini",
                messages=all_messages,
                max_tokens=max_tokens,
                temperature=temperature,
            )
            if json_mode:
                kwargs["response_format"] = {"type": "json_object"}
            resp = self.client.chat.completions.create(**kwargs)
            return resp.choices[0].message.content

    # ── Main chat entry point ─────────────────────────────────────────────────

    def chat(
        self,
        message: str,
        conversation_history: list[dict],
        context: dict = None,
        conversation_type: str = "general",
    ) -> str:
        if not self.client:
            return self._fallback_response(message, conversation_type)

        prompt_map = {
            "general":         CAREER_PROMPT,
            "resume":          RESUME_PROMPT,
            "interview_coach": INTERVIEW_COACH_PROMPT,
            "interview":       INTERVIEW_SESSION_PROMPT,
        }
        system_prompt = prompt_map.get(conversation_type, CAREER_PROMPT)

        messages = []
        if context:
            ctx_str = self._format_context(context, conversation_type)
            if ctx_str:
                messages.append({"role": "system", "content": ctx_str})

        for msg in conversation_history[-16:]:
            messages.append({"role": msg["role"], "content": msg["content"]})

        messages.append({"role": "user", "content": message})

        is_interview = conversation_type == "interview"
        try:
            return self._llm(
                system=system_prompt,
                messages=messages,
                max_tokens=900 if is_interview else 700,
                temperature=0.5 if is_interview else 0.7,
            )
        except Exception as e:
            print(f"LLM error ({self.provider}): {e}")
            return self._fallback_response(message, conversation_type)

    # ── Code evaluation ───────────────────────────────────────────────────────

    def evaluate_code(
        self,
        question: str,
        code: str,
        language: str,
        target_role: str = "",
    ) -> dict:
        if not self.client:
            return {
                "rating": 5, "correct": False,
                "feedback": "No AI API key configured. Add ANTHROPIC_API_KEY or OPENAI_API_KEY to your .env file.",
                "optimal_solution": "", "time_complexity": "N/A",
                "space_complexity": "N/A", "improvements": [],
            }

        prompt = f"""You are an expert technical interviewer evaluating a candidate's code solution.

Question: {question}

Candidate's {language} solution:
```{language}
{code}
```
Target role: {target_role or "Software Engineer"}

Return JSON with exactly these fields:
{{
  "rating": <integer 1-10>,
  "correct": <true/false>,
  "feedback": "<2-3 sentences on what they did right and what's wrong>",
  "optimal_solution": "<clean optimal {language} solution>",
  "time_complexity": "<e.g. O(n)>",
  "space_complexity": "<e.g. O(1)>",
  "improvements": ["<improvement 1>", "<improvement 2>"]
}}"""

        try:
            raw = self._llm(
                system="You are a technical interviewer. Always respond with valid JSON only.",
                messages=[{"role": "user", "content": prompt}],
                max_tokens=800,
                temperature=0.3,
                json_mode=True,
            )
            return json.loads(raw)
        except Exception as e:
            return {
                "rating": 5, "correct": False,
                "feedback": f"Evaluation error: {e}",
                "optimal_solution": "", "time_complexity": "N/A",
                "space_complexity": "N/A", "improvements": [],
            }

    # ── Context formatting ────────────────────────────────────────────────────

    def _format_context(self, context: dict, conv_type: str) -> str:
        parts = []

        # Raw resume text — gold for RAG
        raw_text = context.get("raw_text") or context.get("resume_text", "")
        if raw_text and len(raw_text) > 100:
            if conv_type == "resume":
                parts.append(f"CANDIDATE'S FULL RESUME TEXT:\n{raw_text[:4000]}")
            else:
                parts.append(f"CANDIDATE'S RESUME (for context):\n{raw_text[:2000]}")
        else:
            # Structured fallback
            if context.get("skills"):
                skills = context["skills"]
                names = [s["name"] if isinstance(s, dict) else s for s in skills[:20]]
                parts.append(f"Skills: {', '.join(filter(None, names))}")
            if context.get("experience"):
                exp = context["experience"]
                if isinstance(exp, list) and exp:
                    roles = [
                        f"{e.get('title','')} at {e.get('company','')}"
                        for e in exp[:3] if isinstance(e, dict)
                    ]
                    parts.append(f"Experience: {'; '.join(filter(None, roles))}")
            if context.get("education"):
                edu = context["education"]
                if isinstance(edu, list) and edu:
                    degs = [e.get("degree", "") for e in edu[:2] if isinstance(e, dict)]
                    parts.append(f"Education: {', '.join(filter(None, degs))}")

        if context.get("target_role"):
            parts.append(f"Target role: {context['target_role']}")

        return "\n\n".join(parts)

    # ── Fallback (no API key) ─────────────────────────────────────────────────

    def _fallback_response(self, message: str, conversation_type: str) -> str:
        ml = message.lower()
        if conversation_type == "interview":
            BEHAVIORAL_QUESTIONS = [
                "Tell me about yourself and why you're interested in this role.",
                "Describe a time you faced a major technical challenge. How did you identify the root cause and resolve it?",
                "Tell me about a time you had to collaborate with a difficult teammate. What was the situation and outcome?",
                "Describe a situation where you had to meet a very tight deadline. What was your approach and what did you learn?",
            ]
            TECHNICAL_QUESTIONS = [
                "Write a function to find two numbers in an array that sum to a target value. Walk me through your thought process and time complexity. [CODING]",
                "Design a URL shortener like bit.ly — walk me through the system architecture, database schema, and how you'd handle scale. [SYSTEM DESIGN]",
                "Write a SQL query to find the top 3 departments by average salary. Assume a table: employees(id, name, department, salary). [SQL]",
                "What is the difference between a process and a thread? When would you use multi-threading vs multi-processing? [CONCEPT]",
                "Write a function to determine if a binary tree is height-balanced. What is the time complexity? [CODING]",
                "Explain the CAP theorem. Given a real-world distributed system you've worked with, how did it handle the trade-offs? [CONCEPT]",
            ]
            q_match = re.search(r"question\s+(\d+)", ml)
            q_num = int(q_match.group(1)) if q_match else 1
            is_technical = "technical" in ml or "coding" in ml or q_num > 4
            if is_technical:
                q = TECHNICAL_QUESTIONS[min(q_num - 5, len(TECHNICAL_QUESTIONS) - 1)]
            else:
                q = BEHAVIORAL_QUESTIONS[min(q_num - 1, len(BEHAVIORAL_QUESTIONS) - 1)]
            return f"**Question {q_num} of 10:** {q}"
        if conversation_type == "resume":
            return (
                "I can help you improve your resume. Share a bullet point or section and I'll rewrite it.\n\n"
                "For example: *'Improved system performance'* becomes:\n"
                "> **Reduced API response time by 40%** by implementing Redis caching, improving throughput from 200 to 2,000 req/s\n\n"
                "*(Add your OPENAI_API_KEY to .env for personalized AI resume coaching.)*"
            )
        if any(w in ml for w in ["roadmap", "path", "how to become", "learn"]):
            return (
                "Here's a general roadmap for software engineering roles:\n\n"
                "**Month 1-2:** Core data structures & algorithms (arrays, trees, graphs)\n"
                "**Month 3:** System design fundamentals (load balancers, databases, caching)\n"
                "**Month 4:** Pick a specialization (backend, ML, cloud, etc.)\n"
                "**Month 5-6:** Build 2-3 portfolio projects + LeetCode practice\n\n"
                "*(Add OPENAI_API_KEY to .env for a personalized roadmap based on your resume.)*"
            )
        return (
            "I'm your AI Career Companion. I can help with:\n"
            "• **Resume enhancement** — rewrite weak bullets with metrics\n"
            "• **Career roadmaps** — step-by-step path to your target role\n"
            "• **Interview prep** — STAR answers, technical explanations\n"
            "• **Skill gap analysis** — what to learn and in what order\n"
            "• **Mock interviews** — 10 structured questions with code evaluation\n\n"
            "*(Add your OPENAI_API_KEY to .env for full AI capabilities.)*"
        )
