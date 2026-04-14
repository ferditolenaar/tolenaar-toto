import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import pb from '../lib/pocketbase';
import '../Auth.css';

export default function ResetPasswordPage() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({ 
    password: '', 
    passwordConfirm: '' 
  });

  async function handleSubmit(e) {
    e.preventDefault();

    if (formData.password !== formData.passwordConfirm) {
      alert("Wachtwoorden komen niet overeen.");
      return;
    }

    setLoading(true);
    try {
      // PocketBase confirmPasswordReset call
      await pb.collection('users').confirmPasswordReset(
        token,
        formData.password,
        formData.passwordConfirm
      );
      
      alert("Wachtwoord succesvol gewijzigd! Je kunt nu inloggen.");
      navigate('/inloggen');
    } catch (err) {
      alert("Fout bij het instellen van nieuw wachtwoord: " + err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="auth-page-wrapper">
      <div className="auth-card tournament-card">
        <h2>Nieuw Wachtwoord</h2>
        <p style={{ textAlign: 'center', marginBottom: '1.5rem', fontSize: '0.9rem', color: '#666' }}>
          Voer hieronder je nieuwe wachtwoord in.
        </p>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="password">Nieuw Wachtwoord</label>
            <input
              id="password"
              type="password"
              value={formData.password}
              onChange={e => setFormData({ ...formData, password: e.target.value })}
              required
              minLength={8}
            />
          </div>

          <div className="form-group">
            <label htmlFor="passwordConfirm">Bevestig Wachtwoord</label>
            <input
              id="passwordConfirm"
              type="password"
              value={formData.passwordConfirm}
              onChange={e => setFormData({ ...formData, passwordConfirm: e.target.value })}
              required
            />
          </div>

          <button type="submit" className="submit-btn" disabled={loading}>
            {loading ? "Verwerken..." : "Wachtwoord Opslaan"}
          </button>
        </form>

        <p className="auth-footer">
          Terug naar <Link to="/inloggen">Login</Link>
        </p>
      </div>
    </div>
  );
}