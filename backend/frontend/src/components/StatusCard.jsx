import React from 'react';
import axios from 'axios';

const StatusCard = ({ bot, onUpdate }) => {
  const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

  const getStatusBadge = (status) => {
    const statusConfig = {
      Online: { class: 'success', icon: 'fa-check-circle' },
      Offline: { class: 'secondary', icon: 'fa-times-circle' },
      Pairing: { class: 'warning', icon: 'fa-qrcode' },
      Error: { class: 'danger', icon: 'fa-exclamation-triangle' }
    };
    
    const config = statusConfig[status] || { class: 'info', icon: 'fa-info-circle' };
    
    return (
      <span className={`badge bg-${config.class} fs-6`}>
        <i className={`fas ${config.icon} me-1`}></i>
        {status}
      </span>
    );
  };

  const handleRestart = async () => {
    try {
      await axios.post(`${API_BASE}/restart/${bot.number}`);
      onUpdate();
    } catch (error) {
      console.error('Restart failed:', error);
    }
  };

  const handleLogout = async () => {
    if (window.confirm('Are you sure you want to logout this bot?')) {
      try {
        await axios.delete(`${API_BASE}/logout/${bot.number}`);
        onUpdate();
      } catch (error) {
        console.error('Logout failed:', error);
      }
    }
  };

  return (
    <div className="col-md-6 col-lg-4 mb-4">
      <div className={`card h-100 shadow-sm border-0 status-card ${
        bot.status === 'Online' ? 'border-success' : 
        bot.status === 'Offline' ? 'border-secondary' : 'border-warning'
      }`}>
        <div className="card-header bg-transparent d-flex justify-content-between align-items-center">
          <h6 className="mb-0">
            <i className="fas fa-robot text-primary me-2"></i>
            {bot.number}
          </h6>
          {getStatusBadge(bot.status)}
        </div>
        
        <div className="card-body">
          <div className="mb-2">
            <small className="text-muted">Last Activity:</small>
            <div className="fw-semibold">
              {bot.lastActivity ? new Date(bot.lastActivity).toLocaleString() : 'Never'}
            </div>
          </div>
          
          {bot.lastMessage && (
            <div className="mb-2">
              <small className="text-muted">Last Message:</small>
              <div className="text-truncate fw-semibold">
                {bot.lastMessage}
              </div>
            </div>
          )}
          
          {bot.connectedAt && (
            <div className="mb-2">
              <small className="text-muted">Connected Since:</small>
              <div className="fw-semibold">
                {new Date(bot.connectedAt).toLocaleString()}
              </div>
            </div>
          )}
        </div>
        
        <div className="card-footer bg-transparent">
          <div className="btn-group w-100">
            <button 
              className="btn btn-outline-primary btn-sm"
              onClick={handleRestart}
              disabled={bot.status === 'Pairing'}
            >
              <i className="fas fa-redo me-1"></i>
              Restart
            </button>
            <button 
              className="btn btn-outline-danger btn-sm"
              onClick={handleLogout}
            >
              <i className="fas fa-sign-out-alt me-1"></i>
              Logout
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StatusCard;
