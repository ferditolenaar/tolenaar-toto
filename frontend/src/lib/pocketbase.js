import PocketBase from 'pocketbase';

// After you push the fix, check your browser console for this message
console.log("PocketBase URL:", import.meta.env.VITE_POCKETBASE_URL);

// Pull the URL from our central .env file
const pb = new PocketBase(import.meta.env.VITE_POCKETBASE_URL);

// Export the instance for use everywhere
export default pb;