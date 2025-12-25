import PocketBase from 'pocketbase';

// Pull the URL from our central .env file
const pb = new PocketBase(import.meta.env.VITE_POCKETBASE_URL);

// Export the instance for use everywhere
export default pb;