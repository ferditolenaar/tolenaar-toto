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
      await pb.collection('users').authWithPassword(formData.email, formData.password);
      navigate('/'); 
    } catch (err) {
      alert("Login failed: " + err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-wrapper">
      <div className="auth-card">
        <h2>Login</h2>
        <form onSubmit={handleSubmit}>
          
          <div className="form-group">
            <label htmlFor="email">Email address</label>
            <input 
              id="email" 
              type="email" 
              value={formData.email}
              onChange={e => setFormData({...formData, email: e.target.value})} 
              required 
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input 
              id="password" 
              type="password" 
              value={formData.password}
              onChange={e => setFormData({...formData, password: e.target.value})} 
              required 
            />
          </div>

          <button type="submit" className="submit-btn" disabled={loading}>
            {loading ? "Logging in..." : "Login"}
          </button>
        </form>

        <p className="auth-footer">
          Don't have an account? <Link to="/register">Register here</Link>
        </p>
      </div>
    </div>
  );
}