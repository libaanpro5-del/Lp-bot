import React, { useState } from 'react';
import QRCode from 'qrcode.react';
import axios from 'axios';

const PairForm = () => {
  const [number, setNumber] = useState('');
  const [loading, setLoading] = useState(false);
  const [pairingData, setPairingData] = useState(null);
  const [error, setError] = useState('');

  const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

  const handlePair = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      const response = await axios.post(`${API_BASE}/pair`, { number });
      
      if (response.data.success) {
        setPairingData(response.data);
        
        // If already connected
        if (response.data.connected) {
          setTimeout(() => {
            window.location.href = '/';
          }, 2000);
        }
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to pair device');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="row justify-content-center">
      <div className="col-md-8 col-lg-6">
        <div className="card shadow-lg border-0">
          <div className="card-header bg-primary text-white text-center py-4">
            <h3 className="mb-0">
              <i className="fas fa-robot me-2"></i>
              Pair WhatsApp Bot
            </h3>
          </div>
          <div className="card-body p-4">
            {!pairingData ? (
              <form onSubmit={handlePair}>
                <div className="mb-3">
                  <label htmlFor="number" className="form-label">
                    WhatsApp Number
                  </label>
                  <input
                    type="tel"
                    className="form-control form-control-lg"
                    id="number"
                    placeholder="e.g., 252612345678"
                    value={number}
                    onChange={(e) => setNumber(e.target.value)}
                    required
                  />
                  <div className="form-text">
                    Enter your WhatsApp number with country code (without +)
                  </div>
                </div>
                
                {error && (
                  <div className="alert alert-danger d-flex align-items-center">
                    <i className="fas fa-exclamation-triangle me-2"></i>
                    {error}
                  </div>
                )}
                
                <button 
                  type="submit" 
                  className="btn btn-primary btn-lg w-100 py-3"
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-2"></span>
                      Pairing...
                    </>
                  ) : (
                    <>
                      <i className="fas fa-link me-2"></i>
                      Start Pairing
                    </>
                  )}
                </button>
              </form>
            ) : pairingData.qr ? (
              <div className="text-center">
                <div className="alert alert-info">
                  <i className="fas fa-qrcode me-2"></i>
                  Scan this QR code with WhatsApp
                </div>
                
                <div className="bg-white p-4 rounded d-inline-block">
                  <QRCode 
                    value={pairingData.qr} 
                    size={256}
                    level="H"
                  />
                </div>
                
                <div className="mt-4">
                  <p className="text-muted">
                    <strong>Steps:</strong><br />
                    1. Open WhatsApp → Settings → Linked Devices<br />
                    2. Tap on "Link a Device"<br />
                    3. Scan the QR code above
                  </p>
                </div>
                
                <button 
                  className="btn btn-outline-secondary mt-3"
                  onClick={() => setPairingData(null)}
                >
                  <i className="fas fa-arrow-left me-2"></i>
                  Try Another Number
                </button>
              </div>
            ) : pairingData.connected ? (
              <div className="text-center">
                <div className="alert alert-success">
                  <i className="fas fa-check-circle me-2"></i>
                  Successfully Connected!
                </div>
                <p>Your WhatsApp bot is now active and ready to use.</p>
                <a href="/" className="btn btn-success">
                  Go to Dashboard
                </a>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PairForm;
