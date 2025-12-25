import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import pb from '../lib/pocketbase';

export default function RegisterPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  
  // We keep all our form data in one object for cleanliness
  const [data, setData] = useState({ 
    username: '', 
    email: '', 
    password: '', 
    passwordConfirm: '' 
  });

  async function handleRegister(e) {
    e.preventDefault();
    setLoading(true);

    try {
      // 1. Create the user record in your PocketBase 'users' collection
      await pb.collection('users').create(data);
      
      // 2. Automatically log them in after registration
      await pb.collection('users').authWithPassword(data.email, data.password);
      
      // 3. Send them to the home page
      navigate('/');
    } catch (err) {
      alert("Registration failed: " + err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page-wrapper">
      <div className="auth-card">
        <h2>Create Account</h2>
        <form onSubmit={handleRegister}>
          
          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input 
              id="username" 
              type="text" 
              value={data.username}
              onChange={e => setData({...data, username: e.target.value})} 
              required 
            />
          </div>

          <div className="form-group">
            <label htmlFor="email">Email address</label>
            <input 
              id="email" 
              type="email" 
              value={data.email}
              onChange={e => setData({...data, email: e.target.value})} 
              required 
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input 
              id="password" 
              type="password" 
              value={data.password}
              onChange={e => setData({...data, password: e.target.value})} 
              required 
            />
          </div>

          <div className="form-group">
            <label htmlFor="passwordConfirm">Confirm Password</label>
            <input 
              id="passwordConfirm" 
              type="password" 
              value={data.passwordConfirm}
              onChange={e => setData({...data, passwordConfirm: e.target.value})} 
              required 
            />
          </div>

          <button type="submit" className="submit-btn" disabled={loading}>
            {loading ? "Creating Account..." : "Sign Up"}
          </button>
        </form>
        <p className="auth-footer">
          Already have an account? <Link to="/login">Login here</Link>
        </p>
      </div>
    </div>
  );
}