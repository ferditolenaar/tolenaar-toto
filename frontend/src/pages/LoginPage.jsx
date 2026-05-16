import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import pb from '../lib/pocketbase';
import '../Auth.css';

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

  const requestPasswordReset = async () => {
    if (!formData.email) {
      alert("Voer eerst je e-mailadres in.");
      return;
    }

    try {
      await pb.collection('users').requestPasswordReset(formData.email);
      alert("Wachtwoordherstel e-mail verzonden! Controleer je inbox.");
    } catch (err) {
      alert("Fout: " + err.message);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      const authData = await pb.collection('users').authWithOAuth2({
        provider: 'google',
        queryParams: {
          prompt: 'select_account',
        },
        urlQueryParameters: {
          prompt: 'select_account',
        },
      });

      // 1. Safely extract separate first and last names directly from Google's raw metadata
      const rawUser = authData.meta?.rawUser || {};
      let fName = rawUser.given_name || '';
      let lName = rawUser.family_name || '';

      // Fallback: Only use a combined string split if Google's native fields are missing
      if (!fName && !lName && authData.meta?.name) {
        const fullNames = authData.meta.name.split(' ');
        fName = fullNames[0] || '';
        lName = fullNames.slice(1).join(' ') || '';
      }

      // 2. Inspect the actual database record returned from this authentication session
      const currentRecord = authData.record || {};
      const fieldsAreMissingInDb = !currentRecord.firstName || !currentRecord.lastName;

      // 3. Auto-Heal / New Account Setup: Update if it's a new account OR if names are blank in DB
      if (authData.meta?.isNew || fieldsAreMissingInDb) {
        if (fName || lName) {
          await pb.collection('users').update(currentRecord.id, {
            firstName: fName,
            lastName: lName,
          });
        }
      }

      navigate('/');
    } catch (err) {
      console.error("Google Auth Failed", err);
      alert("Er is iets fout gegaan tijdens het inloggen met Google: " + err.message);
    }
  };

  return (
    <div className="auth-page-wrapper">
      <div className="auth-card tournament-card"> {/* Added tournament-card */}
        <h2>Login</h2>
        <form onSubmit={handleSubmit}>

          <div className="form-group">
            <label htmlFor="email">Emailadres</label>
            <input
              id="email"
              type="email"
              value={formData.email}
              onChange={e => setFormData({ ...formData, email: e.target.value })}
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Wachtwoord</label>
            <input
              id="password"
              type="password"
              value={formData.password}
              onChange={e => setFormData({ ...formData, password: e.target.value })}
              required
            />
            <p className="password-footer">
              Wachtwoord vergeten?
              <Link to="#" onClick={requestPasswordReset}>Klik hier</Link>
            </p>
          </div>

          <button type="submit" className="submit-btn" disabled={loading}>
            {loading ? "Logging in..." : "Login"}
          </button>
        </form>

        <div className="social-login-separator">
          <span>OF LOG IN MET</span>
        </div>

        <div className="social-login-container">
          {/* Google Button */}
          <button onClick={handleGoogleLogin} className="btn-social btn-google">
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" />
            <span>Google</span>
          </button>
        </div>

        <p className="auth-footer">
          Nog geen account? <Link to="/registreer">Registreer hier</Link>
        </p>

      </div>
    </div>
  );
}