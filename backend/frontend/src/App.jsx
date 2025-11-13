import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import BotDashboard from './components/BotDashboard';
import PairForm from './components/PairForm';
import 'bootstrap/dist/css/bootstrap.min.css';
import '@fortawesome/fontawesome-free/css/all.min.css';

function App() {
  return (
    <Router>
      <div className="min-vh-100 bg-light">
        <nav className="navbar navbar-dark bg-primary shadow-sm">
          <div className="container">
            <span className="navbar-brand mb-0 h1">
              <i className="fas fa-robot me-2"></i>
              LP WhatsApp Bot Platform
            </span>
          </div>
        </nav>

        <main className="container py-4">
          <Routes>
            <Route path="/" element={<BotDashboard />} />
            <Route path="/pair" element={<PairForm />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>

        <footer className="bg-dark text-light py-4 mt-5">
          <div className="container text-center">
            <p className="mb-0">
              &copy; 2024 LP WhatsApp Bot Platform. Powered by Baileys & Firebase.
            </p>
          </div>
        </footer>
      </div>
    </Router>
  );
}

export default App;
