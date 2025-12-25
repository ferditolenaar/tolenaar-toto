import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import StartPage from './pages/StartPage';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import './App.css'; // Make sure the CSS is imported here!

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Everything inside this Route gets the Navbar */}
        <Route element={<Layout />}>
          <Route path="/" element={<StartPage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;