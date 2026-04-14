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

  const handleGoogleRegister = async () => {
    try {
      const authData = await pb.collection('users').authWithOAuth2({
        provider: 'google',
        // This is the magic line:
        urlQueryParameters: {
          prompt: 'select_account',
        },
      });

      // If this is a brand new user, let's grab their name from Google
      if (authData.meta.isNew) {
        const fullNames = authData.meta.name.split(' ');
        const fName = fullNames[0] || '';
        const lName = fullNames.slice(1).join(' ') || '';

        await pb.collection('users').update(authData.record.id, {
          firstName: fName,
          lastName: lName,
        });
      }

      navigate('/');
    } catch (err) {
      console.error("Google Registration Failed", err);
    }
  };

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

        <div className="social-login-separator">
          <span>OF REGISTREER MET</span>
        </div>

        <div className="social-login-container">
          <button onClick={handleGoogleRegister} className="btn-social btn-google">
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" />
            <span>Google</span>
          </button>
        </div>

        <p className="auth-footer">
          Heb je al een account? <Link to="/inloggen">Log hier in</Link>
        </p>
      </div>
    </div>
  );
}