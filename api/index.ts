import { handleApi } from '../server/http.js';

// Route /api/:path* here using the Vercel rewrite in vercel.json.
export const maxDuration = 180;
export default { fetch: handleApi };
