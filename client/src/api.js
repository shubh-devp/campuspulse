import axios from 'axios'

// Single place where the backend URL is defined
export const API_ORIGIN = import.meta.env.VITE_API_URL || 'http://localhost:5000'

const api = axios.create({
  baseURL: `${API_ORIGIN}/api`,
})

// A complaint image is either a full Cloudinary URL or a path served by the backend,
// so only the stored paths get the API origin in front of them
export function imageUrl(fileUrl) {
  if (!fileUrl) return ''
  return /^https?:\/\//i.test(fileUrl) ? fileUrl : `${API_ORIGIN}${fileUrl}`
}

export default api
