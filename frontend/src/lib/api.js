import axios from "axios";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001/api";

const api = axios.create({ baseURL: API_URL });

api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("token");
    if (token) config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401 && typeof window !== "undefined") {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      window.location.href = "/login";
    }
    return Promise.reject(err);
  }
);

// Auth
export const login = (email, password) =>
  api.post("/auth/login", { email, password }).then((r) => r.data);

export const register = (name, email, password) =>
  api.post("/auth/register", { name, email, password }).then((r) => r.data);

// Dashboard
export const getDashboardSummary = () =>
  api.get("/dashboard/summary").then((r) => r.data);

// Resumes
export const uploadResume = (file) => {
  const form = new FormData();
  form.append("resume", file);
  return api.post("/resumes/upload", form, {
    headers: { "Content-Type": "multipart/form-data" },
  }).then((r) => r.data);
};

export const getResumes = () =>
  api.get("/resumes").then((r) => r.data);

export const scoreResume = (resumeId) =>
  api.post(`/resumes/${resumeId}/score`, {}).then((r) => r.data);

export const reparseResume = (resumeId, text) =>
  api.post(`/resumes/${resumeId}/reparse`, { text }).then((r) => r.data);

// Jobs
export const getJobs = (page = 1, search = "") =>
  api.get("/jobs", { params: { page, limit: 20, search } }).then((r) => r.data);

export const getJobMatches = () =>
  api.get("/jobs/matches").then((r) => r.data);

export const getSkillGap = (jobId) =>
  api.post("/jobs/skill-gap", { job_id: jobId }).then((r) => r.data);

export const getSkillGapByRole = (targetRole) =>
  api.post("/jobs/skill-gap-role", { target_role: targetRole }).then((r) => r.data);

// Chat
export const createConversation = (type = "general") =>
  api.post("/chat/conversations", { type }).then((r) => r.data);

export const evaluateCode = (question, code, language, targetRole) =>
  api.post("/chat/evaluate-code", { question, code, language, target_role: targetRole }).then((r) => r.data);

export const getConversations = () =>
  api.get("/chat/conversations").then((r) => r.data);

export const getMessages = (conversationId) =>
  api.get(`/chat/conversations/${conversationId}/messages`).then((r) => r.data);

export const sendMessage = (conversationId, content) =>
  api.post(`/chat/conversations/${conversationId}/messages`, { content }).then((r) => r.data);

// Courses
export const getCourseRecommendations = (skillsToLearn, targetRole = "", level = "beginner") =>
  api.post("/chat/courses/recommend", {
    skills_to_learn: skillsToLearn,
    target_role: targetRole,
    level,
  }).then((r) => r.data);

// Canvas LMS
export const fetchCanvasCourses = (token, canvasUrl = "https://sjsu.instructure.com") =>
  api.post("/dashboard/canvas", { token, canvas_url: canvasUrl }).then((r) => r.data);
