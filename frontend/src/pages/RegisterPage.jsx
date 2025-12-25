import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import pb from '../lib/pocketbase';

export default function RegisterPage() {
  const navigate = useNavigate();
  const [data, setData] = useState({ 
    username: '', email: '', password: '', passwordConfirm: '' 
  });

  async function handleRegister(e) {
    e.preventDefault();
    try {
      // 1. Create the user record
      await pb.collection('users').create(data);
      
      // 2. Immediately log them in so they don't have to type it again
      await pb.collection('users').authWithPassword(data.email, data.password);
      
      navigate('/');
    } catch (err) {
      alert(err.message);
    }
  }

  return (
    <div className="auth-container">
      <h1>Create Account</h1>
      <form onSubmit={handleRegister}>
        <input type="text" placeholder="Username" onChange={e => setData({...data, username: e.target.value})} />
        <input type="email" placeholder="Email" onChange={e => setData({...data, email: e.target.value})} />
        <input type="password" placeholder="Password" onChange={e => setData({...data, password: e.target.value})} />
        <input type="password" placeholder="Confirm Password" onChange={e => setData({...data, passwordConfirm: e.target.value})} />
        <button type="submit">Sign Up</button>
      </form>
    </div>
  );
}