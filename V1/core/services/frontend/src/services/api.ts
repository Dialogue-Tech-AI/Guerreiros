import axios, { AxiosInstance } from 'axios';
import { useAuthStore } from '../store/auth.store';

// Usar /api (same-origin) por padrão para evitar bloqueio por ad blockers em requisições cross-origin
const API_URL = import.meta.env.VITE_API_URL || '/api';

export const api: AxiosInstance = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 30000,
});

// Request interceptor - add auth token; para FormData, deixar o browser definir Content-Type (com boundary)
api.interceptors.request.use(
  (config) => {
    const { accessToken } = useAuthStore.getState();
    
    if (accessToken) {
      config.headers.Authorization = `Bearer ${accessToken}`;
      console.log(`[API] Request to ${config.url}: Authorization header added`);
    } else {
      console.warn(`[API] Request to ${config.url}: No access token found`);
    }

    if (config.data instanceof FormData) {
      delete config.headers['Content-Type'];
    }
    
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor - handle errors
api.interceptors.response.use(
  (response) => {
    return response;
  },
  async (error) => {
    const originalRequest = error.config;

    // Handle 401 - token expired
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const { refreshToken } = useAuthStore.getState();
        
        if (refreshToken) {
          const response = await axios.post(`${API_URL}/auth/refresh`, {
            refreshToken,
          });

          // Handle different response structures
          const accessToken = response.data?.data?.accessToken || response.data?.accessToken;
          if (!accessToken) {
            throw new Error('No access token in refresh response');
          }
          
          // Update token in store
          useAuthStore.setState({ accessToken });

          // Retry original request with new token
          originalRequest.headers.Authorization = `Bearer ${accessToken}`;
          return api(originalRequest);
        }
      } catch (refreshError) {
        // Refresh failed - logout user
        useAuthStore.getState().logout();
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export default api;
