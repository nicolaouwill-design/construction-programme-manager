import axios from "axios";

// VITE_API_URL is set in Vercel environment variables to point at the Railway backend.
// Falls back to relative URLs (when backend serves frontend) or localhost in dev.
const BASE_URL = import.meta.env.VITE_API_URL ?? (import.meta.env.PROD ? "" : "http://localhost:8000");

const api = axios.create({ baseURL: BASE_URL });

// Attach JWT token to every request if present
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("auth_token");
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export interface Project {
  id: number;
  name: string;
  address?: string;
  client?: string;
  revision?: string;
  status_date?: string;
  working_days?: number;
  activity_count?: number;
}

export interface Activity {
  id: number;
  task_id: number;
  wbs?: string;
  name: string;
  duration_days: number;
  duration_weeks: number;
  start_date?: string;
  finish_date?: string;
  percent_complete: number;
  resource_names?: string;
  parent_id?: number;
  indent_level: number;
  is_summary: boolean;
  is_milestone: boolean;
  is_critical: boolean;
  is_near_critical: boolean;
  sort_order: number;
  notes?: string;
  color?: string;
}

export interface AuthUser {
  id: number;
  email: string;
}

// Auth
export const loginWithEmail = (email: string) =>
  api.post<{ token: string; user: AuthUser }>("/api/auth/login", { email });
export const getMe = () => api.get<AuthUser>("/api/auth/me");

// Projects
export const getProjects = () => api.get<Project[]>("/api/projects");
export const createProject = (data: Partial<Project>) => api.post<Project>("/api/projects", data);
export const updateProject = (id: number, data: Partial<Project>) => api.put(`/api/projects/${id}`, data);
export const deleteProject = (id: number) => api.delete(`/api/projects/${id}`);

// Activities
export const getActivities = (projectId: number) =>
  api.get<Activity[]>(`/api/projects/${projectId}/activities`);
export const createActivity = (projectId: number, data: Partial<Activity>) =>
  api.post<Activity>(`/api/projects/${projectId}/activities`, data);
export const updateActivity = (projectId: number, activityId: number, data: Partial<Activity>) =>
  api.put<Activity>(`/api/projects/${projectId}/activities/${activityId}`, data);
export const deleteActivity = (projectId: number, activityId: number) =>
  api.delete(`/api/projects/${projectId}/activities/${activityId}`);
export const bulkCreateActivities = (projectId: number, activities: Partial<Activity>[]) =>
  api.post(`/api/projects/${projectId}/activities/bulk`, { activities });

// Documents
export const getDocuments = (projectId: number) =>
  api.get(`/api/projects/${projectId}/documents`);
export const uploadDocument = (projectId: number, file: File) => {
  const form = new FormData();
  form.append("file", file);
  return api.post(`/api/projects/${projectId}/documents/upload`, form, {
    headers: { "Content-Type": "multipart/form-data" },
  });
};

// Export
export const exportExcel = (projectId: number) =>
  api.get(`/api/projects/${projectId}/export/excel`, { responseType: "blob" });
export const exportMSProject = (projectId: number) =>
  api.get(`/api/projects/${projectId}/export/msproject`, { responseType: "blob" });

export default api;
