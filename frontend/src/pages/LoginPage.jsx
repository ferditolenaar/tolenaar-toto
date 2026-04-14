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
      await pb.collection('users').authWithOAuth2({
        provider: 'google',
        // Explicitly pass it here as well
        queryParams: {
          prompt: 'select_account',
        },
        // Keep this as a backup
        urlQueryParameters: {
          prompt: 'select_account',
        },
      });
      navigate('/');
    } catch (err) {
      console.error("Google Auth Failed", err);
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