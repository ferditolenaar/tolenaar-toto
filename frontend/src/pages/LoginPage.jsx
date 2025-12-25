import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import pb from '../lib/pocketbase';

export default function LoginPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({ email: '', password: '' });

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      // 1. Authenticate with PocketBase
      await pb.collection('users').authWithPassword(formData.email, formData.formData.password);
      
      // 2. If successful, send them to the home/dashboard
      navigate('/'); 
    } catch (err) {
      alert("Error: " + err.message);
    }
    setLoading(false);
  }

  async function handleGoogleLogin() {
    try {
      await pb.collection('users').authWithOAuth2({ provider: 'google' });
      navigate('/');
    } catch (err) {
      console.error(err);
    }
  }

  return (
    <div className="auth-container">
      <h1>Login</h1>
      <form onSubmit={handleSubmit}>
        <input 
          type="email" 
          placeholder="Email" 
          onChange={(e) => setFormData({...formData, email: e.target.value})}
          required 
        />
        <input 
          type="password" 
          placeholder="Password" 
          onChange={(e) => setFormData({...formData, password: e.target.value})}
          required 
        />
        <button type="submit" disabled={loading}>
          {loading ? "Loading..." : "Login"}
        </button>
      </form>

      <hr />
      <button onClick={handleGoogleLogin} className="google-btn">
        Continue with Google
      </button>

      <p>
        Need an account? <Link to="/register">Register here</Link>
      </p>
    </div>
  );
}