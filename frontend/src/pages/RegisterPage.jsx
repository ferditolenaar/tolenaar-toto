import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import pb from '../lib/pocketbase';
import '../Auth.css';

export default function RegisterPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
 
  const [data, setData] = useState({ 
    firstName: '',
    lastName: '',
    email: '', 
    password: '', 
    passwordConfirm: ''
  });

  async function handleRegister(e) {
    e.preventDefault();
    setLoading(true);

    try {
      // 1. Create the user record (PocketBase handles the extra fields automatically)
      await pb.collection('users').create(data);
      
      // 2. Automatically log them in
      await pb.collection('users').authWithPassword(data.email, data.password);
      
      // 3. Send them to the home page
      navigate('/');
    } catch (err) {
      alert("Registratie mislukt: " + err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page-wrapper">
      <div className="auth-card">
        <h2>Maak een nieuw account aan</h2>
        <form onSubmit={handleRegister}>
          
          {/* First Name Field */}
          <div className="form-group">
            <label htmlFor="firstName">Voornaam</label>
            <input 
              id="firstName" 
              type="text" 
              value={data.firstName}
              onChange={e => setData({...data, firstName: e.target.value})} 
              required 
            />
          </div>

          {/* Last Name Field */}
          <div className="form-group">
            <label htmlFor="lastName">Achternaam</label>
            <input 
              id="lastName" 
              type="text" 
              value={data.lastName}
              onChange={e => setData({...data, lastName: e.target.value})} 
              required 
            />
          </div>

          <div className="form-group">
            <label htmlFor="email">Emailadres</label>
            <input 
              id="email" 
              type="email" 
              value={data.email}
              onChange={e => setData({...data, email: e.target.value})} 
              required 
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Wachtwoord</label>
            <input 
              id="password" 
              type="password" 
              value={data.password}
              onChange={e => setData({...data, password: e.target.value})} 
              required 
            />
          </div>

          <div className="form-group">
            <label htmlFor="passwordConfirm">Bevestig Wachtwoord</label>
            <input 
              id="passwordConfirm" 
              type="password" 
              value={data.passwordConfirm}
              onChange={e => setData({...data, passwordConfirm: e.target.value})} 
              required 
            />
          </div>

          <button type="submit" className="submit-btn" disabled={loading}>
            {loading ? "Account aanmaken..." : "Registreren"}
          </button>
        </form>
        <p className="auth-footer">
          Heb je al een account? <Link to="/login">Log hier in</Link>
        </p>
      </div>
    </div>
  );
}