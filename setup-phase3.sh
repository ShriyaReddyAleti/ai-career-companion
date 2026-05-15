#!/bin/bash
# AI Career Companion - Phase 3 Setup Script
# Implements: Chatbot service (port 8005) + Course Recommender service (port 8006)
# Run from project root after Phase 1 & 2 are complete

set -e
echo "🚀 Setting up Phase 3: Chatbot & Course Recommender..."

###############################################
# Chatbot Service - Full Implementation
###############################################

mkdir -p backend/services/chatbot/app/{models,services}

cat > backend/services/chatbot/requirements.txt << 'EOF'
fastapi==0.115.0
uvicorn==0.30.6
pydantic==2.9.2
python-dotenv==1.0.1
openai==1.51.0
httpx==0.27.2
psycopg2-binary==2.9.9
EOF

cat > backend/services/chatbot/app/__init__.py << 'EOF'
EOF

cat > backend/services/chatbot/app/models/__init__.py << 'EOF'
EOF

cat > backend/services/chatbot/app/models/schemas.py << 'PYEOF'
from pydantic import BaseModel
from typing import Optional


class Message(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str
    conversation_history: list[Message] = []
    context: Optional[dict] = None


class ChatResponse(BaseModel):
    response: str
    conversation_id: Optional[str] = None
PYEOF

cat > backend/services/chatbot/app/services/__init__.py << 'EOF'
EOF

cat > backend/services/chatbot/app/services/assistant.py << 'PYEOF'
import os
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv("../../../.env")

SYSTEM_PROMPT = """You are an expert AI Career Companion assistant. Your role is to help users with:

1. **Career Planning** - Guide users in defining career goals, identifying growth paths, and planning next steps
2. **Resume Advice** - Provide specific, actionable feedback on resumes, cover letters, and professional profiles
3. **Job Search Strategy** - Help craft job search plans, identify target companies, and optimize applications
4. **Interview Preparation** - Coach users on common interview questions, STAR method answers, and technical prep
5. **Skill Development** - Recommend learning resources, certifications, and skills to prioritize based on career goals
6. **Salary Negotiation** - Advise on compensation research, negotiation tactics, and offer evaluation
7. **Networking** - Suggest networking strategies, LinkedIn optimization, and professional relationship building

Guidelines:
- Be specific and actionable — avoid vague advice
- Tailor responses to the user's background when context is provided
- Cite realistic timelines and industry standards
- Be encouraging but honest about challenges
- Keep responses concise (under 300 words) unless detail is specifically requested
- Use bullet points and structure for readability
- If asked about skills gaps, suggest the 3 most impactful skills to learn first

When user context (resume data, skills, job matches) is provided, personalize your advice accordingly."""


class CareerAssistant:
    def __init__(self):
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key or api_key == "your_openai_key_here":
            self.client = None
        else:
            self.client = OpenAI(api_key=api_key)

    def chat(self, message: str, conversation_history: list[dict], context: dict = None) -> str:
        if not self.client:
            return self._fallback_response(message)

        messages = [{"role": "system", "content": SYSTEM_PROMPT}]

        # Inject user context if available
        if context:
            context_str = self._format_context(context)
            if context_str:
                messages.append({
                    "role": "system",
                    "content": f"User context:\n{context_str}"
                })

        # Add conversation history (keep last 10 turns to stay within token limits)
        for msg in conversation_history[-10:]:
            messages.append({"role": msg["role"], "content": msg["content"]})

        # Add current message
        messages.append({"role": "user", "content": message})

        response = self.client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            max_tokens=600,
            temperature=0.7,
        )

        return response.choices[0].message.content

    def _format_context(self, context: dict) -> str:
        parts = []
        if context.get("skills"):
            skills = context["skills"]
            if isinstance(skills, list):
                skill_names = [s["name"] if isinstance(s, dict) else s for s in skills[:15]]
                parts.append(f"User's skills: {', '.join(skill_names)}")
        if context.get("experience"):
            exp = context["experience"]
            if isinstance(exp, list) and exp:
                titles = [e.get("title", "") for e in exp[:3] if isinstance(e, dict)]
                parts.append(f"Recent experience: {', '.join(filter(None, titles))}")
        if context.get("education"):
            edu = context["education"]
            if isinstance(edu, list) and edu:
                degrees = [e.get("degree", "") for e in edu[:2] if isinstance(e, dict)]
                parts.append(f"Education: {', '.join(filter(None, degrees))}")
        if context.get("target_role"):
            parts.append(f"Target role: {context['target_role']}")
        return "\n".join(parts)

    def _fallback_response(self, message: str) -> str:
        message_lower = message.lower()
        if any(w in message_lower for w in ["resume", "cv"]):
            return (
                "For resume optimization:\n"
                "• Tailor your resume keywords to each job description\n"
                "• Quantify achievements (e.g., 'Increased performance by 40%')\n"
                "• Keep it to 1-2 pages; use a clean ATS-friendly format\n"
                "• Lead each bullet with a strong action verb\n\n"
                "Note: Set your OPENAI_API_KEY in .env for personalized AI advice."
            )
        if any(w in message_lower for w in ["interview", "prep"]):
            return (
                "Interview preparation tips:\n"
                "• Use the STAR method for behavioral questions\n"
                "• Research the company's recent news and culture\n"
                "• Prepare 3-5 questions to ask the interviewer\n"
                "• Practice out loud — not just in your head\n\n"
                "Note: Set your OPENAI_API_KEY in .env for personalized AI advice."
            )
        if any(w in message_lower for w in ["skill", "learn", "course"]):
            return (
                "Skill development advice:\n"
                "• Focus on the top 2-3 skills most requested in your target job postings\n"
                "• Build projects to demonstrate new skills — not just certificates\n"
                "• Contribute to open source for real-world experience\n"
                "• Aim for 30-60 min of focused learning daily\n\n"
                "Note: Set your OPENAI_API_KEY in .env for personalized AI advice."
            )
        return (
            "I'm your AI Career Companion. I can help with:\n"
            "• Resume & cover letter advice\n"
            "• Job search strategy\n"
            "• Interview preparation\n"
            "• Skill gap analysis\n"
            "• Salary negotiation\n\n"
            "What would you like help with today?\n\n"
            "Note: Set your OPENAI_API_KEY in .env for full AI-powered responses."
        )
PYEOF

cat > backend/services/chatbot/app/main.py << 'PYEOF'
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from app.models.schemas import ChatRequest, ChatResponse
from app.services.assistant import CareerAssistant
import uvicorn

app = FastAPI(title="Career Chatbot Service", version="3.0.0")

app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

assistant = CareerAssistant()


@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "chatbot", "version": "3.0.0", "ai_enabled": assistant.client is not None}


@app.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    if not request.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    history = [{"role": m.role, "content": m.content} for m in request.conversation_history]

    response_text = assistant.chat(
        message=request.message,
        conversation_history=history,
        context=request.context,
    )

    return ChatResponse(response=response_text)


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8005)
PYEOF

echo "✅ Chatbot service implemented"

###############################################
# Course Recommender Service - Full Implementation
###############################################

mkdir -p backend/services/course-recommender/app/{models,services}

cat > backend/services/course-recommender/requirements.txt << 'EOF'
fastapi==0.115.0
uvicorn==0.30.6
pydantic==2.9.2
python-dotenv==1.0.1
httpx==0.27.2
EOF

cat > backend/services/course-recommender/app/__init__.py << 'EOF'
EOF

cat > backend/services/course-recommender/app/models/__init__.py << 'EOF'
EOF

cat > backend/services/course-recommender/app/models/schemas.py << 'PYEOF'
from pydantic import BaseModel
from typing import Optional


class RecommendRequest(BaseModel):
    skills_to_learn: list[str] = []
    current_skills: list[str] = []
    target_role: str = ""
    level: str = "beginner"


class Course(BaseModel):
    title: str
    platform: str
    url: str
    skill: str
    level: str = "beginner"
    duration: str = ""
    description: str = ""
    free: bool = False


class RecommendResponse(BaseModel):
    courses: list[Course] = []
    learning_path: list[str] = []
    total_estimated_hours: int = 0
PYEOF

cat > backend/services/course-recommender/app/services/__init__.py << 'EOF'
EOF

cat > backend/services/course-recommender/app/services/recommender.py << 'PYEOF'
COURSE_DATABASE = {
    "python": [
        {
            "title": "Python for Everybody Specialization",
            "platform": "Coursera",
            "url": "https://www.coursera.org/specializations/python",
            "level": "beginner",
            "duration": "8 months",
            "description": "Learn Python programming fundamentals, data structures, and web APIs.",
            "free": False,
        },
        {
            "title": "Automate the Boring Stuff with Python",
            "platform": "Udemy",
            "url": "https://www.udemy.com/course/automate/",
            "level": "beginner",
            "duration": "9.5 hours",
            "description": "Practical Python programming for automating everyday tasks.",
            "free": False,
        },
        {
            "title": "Python Tutorial — Full Course for Beginners",
            "platform": "YouTube (freeCodeCamp)",
            "url": "https://www.youtube.com/watch?v=rfscVS0vtbw",
            "level": "beginner",
            "duration": "4.5 hours",
            "description": "Complete beginner Python course covering all the basics.",
            "free": True,
        },
    ],
    "javascript": [
        {
            "title": "JavaScript Algorithms and Data Structures",
            "platform": "freeCodeCamp",
            "url": "https://www.freecodecamp.org/learn/javascript-algorithms-and-data-structures/",
            "level": "beginner",
            "duration": "300 hours",
            "description": "Comprehensive JavaScript curriculum from basics to algorithms.",
            "free": True,
        },
        {
            "title": "The Complete JavaScript Course",
            "platform": "Udemy",
            "url": "https://www.udemy.com/course/the-complete-javascript-course/",
            "level": "beginner",
            "duration": "69 hours",
            "description": "Modern JavaScript from beginner to advanced level.",
            "free": False,
        },
    ],
    "typescript": [
        {
            "title": "Understanding TypeScript",
            "platform": "Udemy",
            "url": "https://www.udemy.com/course/understanding-typescript/",
            "level": "intermediate",
            "duration": "22 hours",
            "description": "Deep dive into TypeScript for modern web development.",
            "free": False,
        },
        {
            "title": "TypeScript Tutorial for Beginners",
            "platform": "YouTube (Traversy Media)",
            "url": "https://www.youtube.com/watch?v=BCg4U1FzODs",
            "level": "beginner",
            "duration": "1.5 hours",
            "description": "Quick introduction to TypeScript syntax and features.",
            "free": True,
        },
    ],
    "react": [
        {
            "title": "React — The Complete Guide",
            "platform": "Udemy",
            "url": "https://www.udemy.com/course/react-the-complete-guide-incl-redux/",
            "level": "beginner",
            "duration": "68 hours",
            "description": "Hooks, Redux, React Router, Next.js and more.",
            "free": False,
        },
        {
            "title": "React Official Tutorial",
            "platform": "React Docs",
            "url": "https://react.dev/learn",
            "level": "beginner",
            "duration": "10 hours",
            "description": "The official interactive React tutorial and documentation.",
            "free": True,
        },
    ],
    "next.js": [
        {
            "title": "Next.js & React — The Complete Guide",
            "platform": "Udemy",
            "url": "https://www.udemy.com/course/nextjs-react-the-complete-guide/",
            "level": "intermediate",
            "duration": "25 hours",
            "description": "Full-stack development with Next.js, covering SSR, SSG, and API routes.",
            "free": False,
        },
        {
            "title": "Next.js Official Tutorial",
            "platform": "Next.js Docs",
            "url": "https://nextjs.org/learn",
            "level": "beginner",
            "duration": "6 hours",
            "description": "Official step-by-step Next.js tutorial.",
            "free": True,
        },
    ],
    "node.js": [
        {
            "title": "The Complete Node.js Developer Course",
            "platform": "Udemy",
            "url": "https://www.udemy.com/course/the-complete-nodejs-developer-course-2/",
            "level": "beginner",
            "duration": "34.5 hours",
            "description": "Node.js, Express, MongoDB, Jest, and more.",
            "free": False,
        },
    ],
    "fastapi": [
        {
            "title": "FastAPI — The Complete Course",
            "platform": "Udemy",
            "url": "https://www.udemy.com/course/fastapi-the-complete-course/",
            "level": "intermediate",
            "duration": "13 hours",
            "description": "Build production-ready APIs with FastAPI and Python.",
            "free": False,
        },
        {
            "title": "FastAPI Official Tutorial",
            "platform": "FastAPI Docs",
            "url": "https://fastapi.tiangolo.com/tutorial/",
            "level": "beginner",
            "duration": "5 hours",
            "description": "Official comprehensive FastAPI documentation and tutorial.",
            "free": True,
        },
    ],
    "django": [
        {
            "title": "Django for Everybody Specialization",
            "platform": "Coursera",
            "url": "https://www.coursera.org/specializations/django",
            "level": "beginner",
            "duration": "4 months",
            "description": "Build web applications using Django and Python.",
            "free": False,
        },
    ],
    "flask": [
        {
            "title": "REST APIs with Flask and Python",
            "platform": "Udemy",
            "url": "https://www.udemy.com/course/rest-api-flask-and-python/",
            "level": "intermediate",
            "duration": "17 hours",
            "description": "Build professional REST APIs using Flask.",
            "free": False,
        },
    ],
    "postgresql": [
        {
            "title": "The Complete SQL Bootcamp",
            "platform": "Udemy",
            "url": "https://www.udemy.com/course/the-complete-sql-bootcamp/",
            "level": "beginner",
            "duration": "9 hours",
            "description": "Master SQL and PostgreSQL for data analysis and backend development.",
            "free": False,
        },
        {
            "title": "PostgreSQL Tutorial",
            "platform": "postgresqltutorial.com",
            "url": "https://www.postgresqltutorial.com/",
            "level": "beginner",
            "duration": "20 hours",
            "description": "Free comprehensive PostgreSQL tutorial from basics to advanced.",
            "free": True,
        },
    ],
    "sql": [
        {
            "title": "SQL for Data Science",
            "platform": "Coursera (UC Davis)",
            "url": "https://www.coursera.org/learn/sql-for-data-science",
            "level": "beginner",
            "duration": "4 weeks",
            "description": "Learn SQL fundamentals for data analysis and reporting.",
            "free": False,
        },
        {
            "title": "SQL Tutorial",
            "platform": "SQLZoo",
            "url": "https://sqlzoo.net/wiki/SQL_Tutorial",
            "level": "beginner",
            "duration": "10 hours",
            "description": "Interactive SQL exercises and tutorials.",
            "free": True,
        },
    ],
    "mongodb": [
        {
            "title": "MongoDB — The Complete Developer's Guide",
            "platform": "Udemy",
            "url": "https://www.udemy.com/course/mongodb-the-complete-developers-guide/",
            "level": "beginner",
            "duration": "17 hours",
            "description": "Deep dive into MongoDB with CRUD, aggregations, and Atlas.",
            "free": False,
        },
    ],
    "redis": [
        {
            "title": "Redis Bootcamp for Beginners",
            "platform": "Udemy",
            "url": "https://www.udemy.com/course/redis-bootcamp-for-beginners/",
            "level": "beginner",
            "duration": "4.5 hours",
            "description": "Learn Redis caching, pub/sub, and data structures.",
            "free": False,
        },
    ],
    "docker": [
        {
            "title": "Docker and Kubernetes: The Complete Guide",
            "platform": "Udemy",
            "url": "https://www.udemy.com/course/docker-and-kubernetes-the-complete-guide/",
            "level": "intermediate",
            "duration": "21.5 hours",
            "description": "Learn Docker, Docker Compose, and Kubernetes from scratch.",
            "free": False,
        },
        {
            "title": "Docker Tutorial for Beginners",
            "platform": "YouTube (TechWorld with Nana)",
            "url": "https://www.youtube.com/watch?v=3c-iBn73dDE",
            "level": "beginner",
            "duration": "3 hours",
            "description": "Complete Docker tutorial covering containers and networking.",
            "free": True,
        },
    ],
    "kubernetes": [
        {
            "title": "Kubernetes for the Absolute Beginners",
            "platform": "Udemy",
            "url": "https://www.udemy.com/course/learn-kubernetes/",
            "level": "beginner",
            "duration": "6 hours",
            "description": "Kubernetes fundamentals with hands-on labs.",
            "free": False,
        },
        {
            "title": "Kubernetes Tutorial",
            "platform": "YouTube (TechWorld with Nana)",
            "url": "https://www.youtube.com/watch?v=X48VuDVv0do",
            "level": "beginner",
            "duration": "4 hours",
            "description": "Comprehensive Kubernetes crash course.",
            "free": True,
        },
    ],
    "aws": [
        {
            "title": "AWS Certified Solutions Architect — Associate",
            "platform": "Udemy (Stephane Maarek)",
            "url": "https://www.udemy.com/course/aws-certified-solutions-architect-associate-saa-c03/",
            "level": "intermediate",
            "duration": "27 hours",
            "description": "Most popular AWS SAA course with practice exams.",
            "free": False,
        },
        {
            "title": "AWS Cloud Practitioner Essentials",
            "platform": "AWS Training",
            "url": "https://aws.amazon.com/training/digital/aws-cloud-practitioner-essentials/",
            "level": "beginner",
            "duration": "6 hours",
            "description": "Official AWS training for cloud fundamentals.",
            "free": True,
        },
    ],
    "azure": [
        {
            "title": "AZ-900: Microsoft Azure Fundamentals",
            "platform": "Microsoft Learn",
            "url": "https://learn.microsoft.com/en-us/certifications/azure-fundamentals/",
            "level": "beginner",
            "duration": "10 hours",
            "description": "Official Microsoft Azure fundamentals certification prep.",
            "free": True,
        },
    ],
    "gcp": [
        {
            "title": "Google Cloud Digital Leader",
            "platform": "Google Cloud Skills Boost",
            "url": "https://cloud.google.com/learn/certification/cloud-digital-leader",
            "level": "beginner",
            "duration": "8 hours",
            "description": "Google Cloud fundamentals for non-technical and technical learners.",
            "free": False,
        },
    ],
    "terraform": [
        {
            "title": "Terraform for the Absolute Beginners",
            "platform": "Udemy",
            "url": "https://www.udemy.com/course/terraform-for-the-absolute-beginners/",
            "level": "beginner",
            "duration": "3 hours",
            "description": "Infrastructure as Code with Terraform from scratch.",
            "free": False,
        },
    ],
    "machine learning": [
        {
            "title": "Machine Learning Specialization",
            "platform": "Coursera (Andrew Ng)",
            "url": "https://www.coursera.org/specializations/machine-learning-introduction",
            "level": "beginner",
            "duration": "3 months",
            "description": "The gold standard ML course by Andrew Ng — supervised, unsupervised, and RL.",
            "free": False,
        },
        {
            "title": "Practical Deep Learning for Coders",
            "platform": "fast.ai",
            "url": "https://course.fast.ai/",
            "level": "intermediate",
            "duration": "20 hours",
            "description": "Top-down approach to deep learning with PyTorch.",
            "free": True,
        },
    ],
    "deep learning": [
        {
            "title": "Deep Learning Specialization",
            "platform": "Coursera (deeplearning.ai)",
            "url": "https://www.coursera.org/specializations/deep-learning",
            "level": "intermediate",
            "duration": "5 months",
            "description": "Neural networks, CNN, RNN, and transformers by Andrew Ng.",
            "free": False,
        },
    ],
    "pytorch": [
        {
            "title": "PyTorch for Deep Learning Bootcamp",
            "platform": "Udemy",
            "url": "https://www.udemy.com/course/pytorch-for-deep-learning-and-computer-vision/",
            "level": "intermediate",
            "duration": "21 hours",
            "description": "Complete PyTorch course from basics to advanced models.",
            "free": False,
        },
        {
            "title": "PyTorch Official Tutorial",
            "platform": "PyTorch Docs",
            "url": "https://pytorch.org/tutorials/",
            "level": "intermediate",
            "duration": "10 hours",
            "description": "Official PyTorch tutorials and documentation.",
            "free": True,
        },
    ],
    "tensorflow": [
        {
            "title": "TensorFlow Developer Certificate",
            "platform": "Coursera (deeplearning.ai)",
            "url": "https://www.coursera.org/professional-certificates/tensorflow-in-practice",
            "level": "intermediate",
            "duration": "4 months",
            "description": "Prepare for the TensorFlow Developer Certificate exam.",
            "free": False,
        },
    ],
    "nlp": [
        {
            "title": "Natural Language Processing Specialization",
            "platform": "Coursera (deeplearning.ai)",
            "url": "https://www.coursera.org/specializations/natural-language-processing",
            "level": "advanced",
            "duration": "4 months",
            "description": "NLP with attention models, transformers, and named entity recognition.",
            "free": False,
        },
        {
            "title": "Hugging Face NLP Course",
            "platform": "Hugging Face",
            "url": "https://huggingface.co/learn/nlp-course/",
            "level": "intermediate",
            "duration": "15 hours",
            "description": "Practical NLP with transformers and the Hugging Face ecosystem.",
            "free": True,
        },
    ],
    "pandas": [
        {
            "title": "Data Analysis with Python",
            "platform": "freeCodeCamp",
            "url": "https://www.freecodecamp.org/learn/data-analysis-with-python/",
            "level": "beginner",
            "duration": "300 hours",
            "description": "Learn NumPy, Pandas, Matplotlib, and Seaborn for data analysis.",
            "free": True,
        },
    ],
    "numpy": [
        {
            "title": "NumPy for Data Science",
            "platform": "Kaggle",
            "url": "https://www.kaggle.com/learn/intro-to-programming",
            "level": "beginner",
            "duration": "5 hours",
            "description": "Hands-on NumPy and data manipulation exercises.",
            "free": True,
        },
    ],
    "git": [
        {
            "title": "Git & GitHub Crash Course",
            "platform": "YouTube (Traversy Media)",
            "url": "https://www.youtube.com/watch?v=SWYqp7iY_Tc",
            "level": "beginner",
            "duration": "0.75 hours",
            "description": "Essential Git and GitHub for beginners.",
            "free": True,
        },
        {
            "title": "The Git & GitHub Bootcamp",
            "platform": "Udemy",
            "url": "https://www.udemy.com/course/git-and-github-bootcamp/",
            "level": "beginner",
            "duration": "17 hours",
            "description": "Comprehensive Git and GitHub training.",
            "free": False,
        },
    ],
    "linux": [
        {
            "title": "Linux Command Line Basics",
            "platform": "Coursera",
            "url": "https://www.coursera.org/learn/unix",
            "level": "beginner",
            "duration": "4 weeks",
            "description": "Practical Unix and Linux command line skills.",
            "free": False,
        },
        {
            "title": "Linux Tutorial",
            "platform": "Ryan's Tutorials",
            "url": "https://ryanstutorials.net/linuxtutorial/",
            "level": "beginner",
            "duration": "5 hours",
            "description": "Beginner Linux command line reference and tutorial.",
            "free": True,
        },
    ],
    "ci/cd": [
        {
            "title": "GitHub Actions — The Complete Guide",
            "platform": "Udemy",
            "url": "https://www.udemy.com/course/github-actions-the-complete-guide/",
            "level": "intermediate",
            "duration": "12 hours",
            "description": "Build CI/CD pipelines with GitHub Actions.",
            "free": False,
        },
    ],
    "agile": [
        {
            "title": "Agile with Atlassian Jira",
            "platform": "Coursera",
            "url": "https://www.coursera.org/learn/agile-atlassian-jira",
            "level": "beginner",
            "duration": "4 weeks",
            "description": "Learn agile methodologies and Jira project management.",
            "free": False,
        },
    ],
    "graphql": [
        {
            "title": "GraphQL with React",
            "platform": "Udemy",
            "url": "https://www.udemy.com/course/graphql-with-react-course/",
            "level": "intermediate",
            "duration": "13 hours",
            "description": "Build full-stack apps with GraphQL and React.",
            "free": False,
        },
    ],
    "java": [
        {
            "title": "Java Programming Masterclass",
            "platform": "Udemy",
            "url": "https://www.udemy.com/course/java-the-complete-java-developer-course/",
            "level": "beginner",
            "duration": "80 hours",
            "description": "Comprehensive Java programming from basics to advanced.",
            "free": False,
        },
    ],
    "go": [
        {
            "title": "Learn Go with Tests",
            "platform": "gitbook",
            "url": "https://quii.gitbook.io/learn-go-with-tests",
            "level": "beginner",
            "duration": "20 hours",
            "description": "Test-driven development approach to learning Go.",
            "free": True,
        },
    ],
    "rust": [
        {
            "title": "The Rust Programming Language (Book)",
            "platform": "rust-lang.org",
            "url": "https://doc.rust-lang.org/book/",
            "level": "intermediate",
            "duration": "30 hours",
            "description": "The official Rust book — comprehensive and free.",
            "free": True,
        },
    ],
    "spring": [
        {
            "title": "Spring & Hibernate for Beginners",
            "platform": "Udemy",
            "url": "https://www.udemy.com/course/spring-hibernate-tutorial/",
            "level": "intermediate",
            "duration": "42 hours",
            "description": "Full-stack Java development with Spring Boot and Hibernate.",
            "free": False,
        },
    ],
    "elasticsearch": [
        {
            "title": "Elasticsearch 8 and the Elastic Stack",
            "platform": "Udemy",
            "url": "https://www.udemy.com/course/elasticsearch-complete-guide/",
            "level": "intermediate",
            "duration": "15 hours",
            "description": "Search, aggregations, and the Elastic Stack ecosystem.",
            "free": False,
        },
    ],
    "rest api": [
        {
            "title": "REST API Design, Development & Management",
            "platform": "Udemy",
            "url": "https://www.udemy.com/course/rest-api/",
            "level": "beginner",
            "duration": "9 hours",
            "description": "Best practices for designing and building REST APIs.",
            "free": False,
        },
    ],
    "microservices": [
        {
            "title": "Microservices with Node JS and React",
            "platform": "Udemy",
            "url": "https://www.udemy.com/course/microservices-with-node-js-and-react/",
            "level": "advanced",
            "duration": "54 hours",
            "description": "Build production-grade microservices with Node.js, React, and Docker.",
            "free": False,
        },
    ],
    "scrum": [
        {
            "title": "Scrum Master Certification Prep",
            "platform": "Coursera",
            "url": "https://www.coursera.org/professional-certificates/scrum-master",
            "level": "beginner",
            "duration": "3 months",
            "description": "Prepare for Professional Scrum Master certification.",
            "free": False,
        },
    ],
}

LEARNING_PATH_TEMPLATES = {
    "frontend": ["html", "css", "javascript", "typescript", "react", "next.js", "git"],
    "backend": ["python", "sql", "postgresql", "fastapi", "docker", "git", "linux"],
    "fullstack": ["javascript", "react", "node.js", "postgresql", "docker", "git"],
    "data science": ["python", "pandas", "numpy", "sql", "machine learning", "deep learning"],
    "ml engineer": ["python", "machine learning", "deep learning", "pytorch", "docker", "aws"],
    "devops": ["linux", "git", "docker", "kubernetes", "terraform", "ci/cd", "aws"],
    "default": ["git", "linux", "docker", "sql", "python"],
}


class CourseRecommender:
    def recommend(
        self,
        skills_to_learn: list[str],
        current_skills: list[str],
        target_role: str = "",
        level: str = "beginner",
    ) -> dict:
        skills_lower = [s.lower().strip() for s in skills_to_learn]
        current_lower = set(s.lower().strip() for s in current_skills)

        # Remove skills the user already has
        skills_needed = [s for s in skills_lower if s not in current_lower]

        # Add skills from learning path if target role specified
        if target_role and not skills_needed:
            skills_needed = self._get_role_path(target_role)

        courses = []
        seen_titles = set()

        for skill in skills_needed[:8]:
            skill_courses = COURSE_DATABASE.get(skill, [])
            # Prefer free courses for beginners, all for others
            for course in skill_courses:
                if course["title"] not in seen_titles:
                    courses.append({**course, "skill": skill})
                    seen_titles.add(course["title"])
                    break  # One course per skill to keep list manageable

        # Build learning path
        learning_path = self._build_learning_path(skills_needed, target_role)

        # Estimate hours
        total_hours = self._estimate_hours(courses)

        return {
            "courses": courses,
            "learning_path": learning_path,
            "total_estimated_hours": total_hours,
        }

    def _get_role_path(self, role: str) -> list[str]:
        role_lower = role.lower()
        for key, path in LEARNING_PATH_TEMPLATES.items():
            if key in role_lower:
                return path
        return LEARNING_PATH_TEMPLATES["default"]

    def _build_learning_path(self, skills: list[str], target_role: str) -> list[str]:
        if not skills:
            return []
        path = []
        # Foundations first
        for foundation in ["git", "linux", "sql", "python", "javascript"]:
            if foundation in skills:
                path.append(foundation)
        # Then everything else
        for s in skills:
            if s not in path:
                path.append(s)
        return path[:10]

    def _estimate_hours(self, courses: list[dict]) -> int:
        total = 0
        for course in courses:
            duration = course.get("duration", "")
            if "month" in duration:
                try:
                    months = float(duration.split()[0])
                    total += int(months * 20)
                except (ValueError, IndexError):
                    total += 40
            elif "hour" in duration:
                try:
                    hours = float(duration.split()[0])
                    total += int(hours)
                except (ValueError, IndexError):
                    total += 10
            elif "week" in duration:
                try:
                    weeks = float(duration.split()[0])
                    total += int(weeks * 5)
                except (ValueError, IndexError):
                    total += 20
            else:
                total += 10
        return total
PYEOF

cat > backend/services/course-recommender/app/main.py << 'PYEOF'
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from app.models.schemas import RecommendRequest, RecommendResponse
from app.services.recommender import CourseRecommender
import uvicorn

app = FastAPI(title="Course Recommender Service", version="3.0.0")

app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

recommender = CourseRecommender()


@app.get("/health")
async def health_check():
    return {"status": "ok", "service": "course-recommender", "version": "3.0.0"}


@app.post("/recommend", response_model=RecommendResponse)
async def recommend_courses(request: RecommendRequest):
    if not request.skills_to_learn and not request.target_role:
        raise HTTPException(status_code=400, detail="Provide skills_to_learn or target_role")

    result = recommender.recommend(
        skills_to_learn=request.skills_to_learn,
        current_skills=request.current_skills,
        target_role=request.target_role,
        level=request.level,
    )
    return result


@app.get("/skills")
async def list_supported_skills():
    from app.services.recommender import COURSE_DATABASE
    return {"skills": sorted(list(COURSE_DATABASE.keys()))}


if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8006)
PYEOF

echo "✅ Course Recommender service implemented"

###############################################
# Update API Gateway chat route to call chatbot microservice
###############################################

cat > backend/api-gateway/src/routes/chat.js << 'JSEOF'
const express = require("express");
const axios = require("axios");
const { authenticateToken } = require("../middleware/auth");
const pool = require("../config/db");

const router = express.Router();

const CHATBOT_URL = `http://localhost:${process.env.CHATBOT_PORT || 8005}`;
const COURSE_RECOMMENDER_URL = `http://localhost:${process.env.COURSE_RECOMMENDER_PORT || 8006}`;

// Start new conversation
router.post("/conversations", authenticateToken, async (req, res) => {
  try {
    const { type = "general" } = req.body;
    const result = await pool.query(
      "INSERT INTO conversations (user_id, conversation_type) VALUES ($1, $2) RETURNING *",
      [req.user.id, type]
    );
    res.status(201).json({ conversation: result.rows[0] });
  } catch (err) {
    console.error("Create conversation error:", err);
    res.status(500).json({ error: "Failed to create conversation" });
  }
});

// Send message — calls chatbot microservice
router.post("/conversations/:id/messages", authenticateToken, async (req, res) => {
  try {
    const { content } = req.body;
    const conversationId = req.params.id;

    if (!content || !content.trim()) {
      return res.status(400).json({ error: "Message content cannot be empty" });
    }

    // Save user message
    await pool.query(
      "INSERT INTO messages (conversation_id, role, content) VALUES ($1, $2, $3)",
      [conversationId, "user", content]
    );

    // Fetch conversation history (last 10 messages)
    const historyResult = await pool.query(
      "SELECT role, content FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC LIMIT 20",
      [conversationId]
    );
    const history = historyResult.rows.slice(0, -1); // exclude the message we just added

    // Fetch user context (resume skills, experience) if available
    let userContext = null;
    try {
      const ctxResult = await pool.query(
        `SELECT pd.skills, pd.experience, pd.education
         FROM resumes r
         JOIN parsed_data pd ON pd.resume_id = r.id
         WHERE r.user_id = $1
         ORDER BY r.uploaded_at DESC LIMIT 1`,
        [req.user.id]
      );
      if (ctxResult.rows.length > 0) {
        userContext = ctxResult.rows[0];
      }
    } catch (_) {}

    // Call chatbot microservice
    let aiResponse;
    try {
      const chatRes = await axios.post(`${CHATBOT_URL}/chat`, {
        message: content,
        conversation_history: history,
        context: userContext,
      }, { timeout: 30000 });
      aiResponse = chatRes.data.response;
    } catch (chatErr) {
      console.error("Chatbot service error:", chatErr.message);
      aiResponse = "I'm having trouble connecting to the AI service right now. Please make sure the chatbot service is running on port 8005.";
    }

    // Save AI response
    await pool.query(
      "INSERT INTO messages (conversation_id, role, content) VALUES ($1, $2, $3)",
      [conversationId, "assistant", aiResponse]
    );

    res.json({ response: aiResponse });
  } catch (err) {
    console.error("Send message error:", err);
    res.status(500).json({ error: "Failed to send message" });
  }
});

// Get conversation messages
router.get("/conversations/:id/messages", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM messages WHERE conversation_id = $1 ORDER BY created_at ASC",
      [req.params.id]
    );
    res.json({ messages: result.rows });
  } catch (err) {
    console.error("Fetch messages error:", err);
    res.status(500).json({ error: "Failed to fetch messages" });
  }
});

// Get all user conversations
router.get("/conversations", authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT c.*, COUNT(m.id) as message_count
       FROM conversations c
       LEFT JOIN messages m ON m.conversation_id = c.id
       WHERE c.user_id = $1
       GROUP BY c.id
       ORDER BY c.created_at DESC`,
      [req.user.id]
    );
    res.json({ conversations: result.rows });
  } catch (err) {
    console.error("Fetch conversations error:", err);
    res.status(500).json({ error: "Failed to fetch conversations" });
  }
});

// Course recommendations — proxies to course-recommender microservice
router.post("/courses/recommend", authenticateToken, async (req, res) => {
  try {
    const { skills_to_learn, target_role, level } = req.body;

    // Get user's current skills if not provided
    let currentSkills = req.body.current_skills || [];
    if (!currentSkills.length) {
      try {
        const skillResult = await pool.query(
          `SELECT pd.skills FROM resumes r
           JOIN parsed_data pd ON pd.resume_id = r.id
           WHERE r.user_id = $1
           ORDER BY r.uploaded_at DESC LIMIT 1`,
          [req.user.id]
        );
        if (skillResult.rows.length > 0) {
          const skills = skillResult.rows[0].skills || [];
          currentSkills = skills.map((s) => (typeof s === "string" ? s : s.name || "")).filter(Boolean);
        }
      } catch (_) {}
    }

    const recRes = await axios.post(`${COURSE_RECOMMENDER_URL}/recommend`, {
      skills_to_learn: skills_to_learn || [],
      current_skills: currentSkills,
      target_role: target_role || "",
      level: level || "beginner",
    }, { timeout: 10000 });

    res.json(recRes.data);
  } catch (err) {
    console.error("Course recommend error:", err.message);
    res.status(500).json({ error: "Failed to get course recommendations. Make sure the course-recommender service is running on port 8006." });
  }
});

module.exports = router;
JSEOF

echo "✅ API Gateway chat routes updated"

###############################################
# Install dependencies and create virtual environments
###############################################

echo ""
echo "📦 Setting up virtual environments and installing dependencies..."

# Chatbot service
echo "  → Chatbot service..."
cd backend/services/chatbot
python3 -m venv venv
source venv/bin/activate
pip install -q -r requirements.txt
deactivate
cd ../../..
echo "  ✅ Chatbot dependencies installed"

# Course Recommender service
echo "  → Course Recommender service..."
cd backend/services/course-recommender
python3 -m venv venv
source venv/bin/activate
pip install -q -r requirements.txt
deactivate
cd ../../..
echo "  ✅ Course Recommender dependencies installed"

echo ""
echo "============================================"
echo "✅ Phase 3 setup complete!"
echo "============================================"
echo ""
echo "NEXT STEPS:"
echo ""
echo "1. Start the Chatbot service (new terminal tab):"
echo "   cd backend/services/chatbot"
echo "   source venv/bin/activate"
echo "   python -m app.main"
echo ""
echo "2. Start the Course Recommender (new terminal tab):"
echo "   cd backend/services/course-recommender"
echo "   source venv/bin/activate"
echo "   python -m app.main"
echo ""
echo "3. Restart the API Gateway to pick up new chat routes."
echo ""
echo "4. Test chatbot:"
echo "   curl http://localhost:8005/health"
echo ""
echo "5. Test course recommender:"
echo "   curl http://localhost:8006/health"
echo "   curl http://localhost:8006/skills"
echo ""
