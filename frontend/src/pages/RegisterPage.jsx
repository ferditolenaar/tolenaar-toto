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

    // 1. Password Length Check
    if (data.password.length < 8) {
      alert("Wachtwoord moet minimaal 8 tekens lang zijn.");
      return;
    }

    // 2. Password Match Check
    if (data.password !== data.passwordConfirm) {
      alert("Wachtwoorden komen niet overeen.");
      return;
    }

    setLoading(true);
    try {
      await pb.collection('users').create(data);
      await pb.collection('users').authWithPassword(data.email, data.password);
      navigate('/');
    } catch (err) {
      alert("Registratie mislukt: " + err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page-wrapper">
      <div className="auth-card tournament-card"> {/* Added tournament-card */}
        <h2>Maak een nieuw account aan</h2>
        <form onSubmit={handleRegister}>

          {/* First Name Field */}
          <div className="form-group">
            <label htmlFor="firstName">Voornaam</label>
            <input
              id="firstName"
              type="text"
              value={data.firstName}
              onChange={e => setData({ ...data, firstName: e.target.value })}
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
              onChange={e => setData({ ...data, lastName: e.target.value })}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="email">Emailadres</label>
            <input
              id="email"
              type="email"
              value={data.email}
              onChange={e => setData({ ...data, email: e.target.value })}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Wachtwoord</label>
            <input
              id="password"
              type="password"
              placeholder="Minimaal 8 tekens" /* Visual hint */
              value={data.password}
              onChange={e => setData({ ...data, password: e.target.value })}
              required
            />
            <small className="form-hint">Minimaal 8 tekens lang</small>
          </div>

          <div className="form-group">
            <label htmlFor="passwordConfirm">Bevestig Wachtwoord</label>
            <input
              id="passwordConfirm"
              type="password"
              value={data.passwordConfirm}
              onChange={e => setData({ ...data, passwordConfirm: e.target.value })}
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