import { handleApi } from '../server/http.js';

// vercel.json rewrites /api/:path* here.
export default { fetch: handleApi };
