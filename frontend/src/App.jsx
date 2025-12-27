import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import StartPage from './pages/StartPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import Predictions from './pages/Predictions';
import AdminPage from './pages/AdminTools';
import AdminMatchResults from './pages/AdminMatchResult';
import ProtectedRoute from './components/ProtectedRoute';
import './App.css'; // Make sure the CSS is imported here!
import LeaderboardPage from './pages/LeaderboardPage';
import Top4SelectionPage from './pages/Top4SelectionPage';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Everything inside this Route gets the Navbar */}
        <Route element={<Layout />}>
          <Route path="/" element={<StartPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/voorspellen" element={<ProtectedRoute><Predictions /></ProtectedRoute>} />
          <Route path="/admin" element={<ProtectedRoute><AdminPage /></ProtectedRoute>} />
          <Route path="/uitslagen" element={<ProtectedRoute><AdminMatchResults /></ProtectedRoute>} />
          <Route path="/stand" element={<ProtectedRoute><LeaderboardPage /></ProtectedRoute>} />
          <Route path="/top4" element={<ProtectedRoute><Top4SelectionPage /></ProtectedRoute>} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;